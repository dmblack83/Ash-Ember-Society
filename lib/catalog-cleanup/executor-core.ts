import type { MgmtClient } from "./mgmt-client";
import { validateOpsFile } from "./ops";
import { forwardSql } from "./sql";
import { checkPreconditions, renderPreview } from "./preview";
import { buildReceipt, collectTouched, reverseSql, reverseWarnings } from "./receipt";
import { buildContext, fetchLines, fetchRefCounts, fetchRefRows, fetchVitolas } from "./catalog-read";
import type { CatalogContext, Op, Receipt } from "./types";

export interface Io {
  readJson(path: string): unknown;
  writeText(path: string, text: string): void;
  writeJson(path: string, data: unknown): void;
  listReceipts(dir: string): string[];
  log(msg: string): void;
}

async function loadContext(client: MgmtClient): Promise<CatalogContext> {
  const [lines, vitolas, refs] = await Promise.all([fetchLines(client), fetchVitolas(client), fetchRefCounts(client)]);
  return buildContext(lines, vitolas, refs);
}

function uncommittedWarnings(io: Io, outDir: string): string[] {
  return io.listReceipts(outDir)
    .filter((p) => { try { return (io.readJson(p) as Receipt).committed === false; } catch { return false; } })
    .map((p) => `receipt ${p} is NOT committed: a previous execute may have failed after writing it; verify prod state before proceeding`);
}

export async function runRefs(client: MgmtClient, io: Io, outDir: string) {
  const refs = await fetchRefCounts(client);
  io.writeJson(`${outDir}/refs.json`, refs);
  const values = Object.values(refs);
  const result = { vitolasWithRefs: values.length, totalRefs: values.reduce((a, b) => a + b, 0) };
  io.log(`real references: ${result.vitolasWithRefs} vitolas, ${result.totalRefs} rows (humidor_items + smoke_logs)`);
  return result;
}

export async function runPreview(client: MgmtClient, io: Io, opsPath: string, outDir: string) {
  const file = validateOpsFile(io.readJson(opsPath));
  const ctx = await loadContext(client);
  const blocked = checkPreconditions(file.ops, ctx);
  const qaSample = file.ops.length >= 10 ? [...Array(Math.ceil(file.ops.length / 10)).keys()].map((i) => i * 10) : [];
  const md = renderPreview({ ops: file.ops, ctx, blocked, generator: file.generator, qaSample, warnings: uncommittedWarnings(io, outDir) });
  const previewPath = `${outDir}/preview.md`;
  io.writeText(previewPath, md);
  io.log(`preview written to ${previewPath} (${file.ops.length} ops, ${blocked.length} blocked)`);
  return { previewPath, blocked: blocked.length, ops: file.ops, ctx };
}

export async function runExecute(client: MgmtClient, io: Io, opsPath: string, outDir: string) {
  const { blocked, ops, ctx } = await runPreview(client, io, opsPath, outDir);
  if (blocked > 0) throw new Error(`${blocked} op(s) blocked; fix the ops file or mark them reviewed. See ${outDir}/preview.md`);
  if (ops.length === 0) { io.log("nothing to do"); return { receiptPath: "", applied: 0 }; }

  const touched = collectTouched(ops, ctx);
  const refs = await fetchRefRows(client, touched.mergeSourceIds);
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const receipt = buildReceipt({
    runId, opsFile: opsPath, ops,
    lines: touched.lineIds.map((id) => ctx.lines.get(id)!),
    vitolas: touched.vitolaIds.map((id) => ctx.vitolas.get(id)!),
    refs,
    touched: { lineIds: touched.lineIds, vitolaIds: touched.vitolaIds },
  });
  const receiptPath = `${outDir}/receipt-${runId}.json`;
  io.writeJson(receiptPath, receipt);

  const statements = ops.flatMap((op) => forwardSql(op, ctx));
  io.log(`sending ${statements.length} statements as one batch`);
  await client.batch(statements);

  io.writeJson(receiptPath, { ...receipt, committed: true });
  io.log(`applied ${ops.length} ops; receipt ${receiptPath}`);
  return { receiptPath, applied: ops.length };
}

export async function runUndo(client: MgmtClient, io: Io, receiptPath: string, outDir: string, opts: { force: boolean }) {
  const receipt = io.readJson(receiptPath) as Receipt;
  if (!receipt || receipt.committed !== true) throw new Error(`receipt ${receiptPath} is not committed; nothing to undo (verify prod state by hand)`);
  if (receipt.runId.startsWith("undo-")) throw new Error(`receipt ${receiptPath} is an undo receipt; redo is not supported, re-run the original ops file instead`);
  const current = await fetchRefRows(client, receipt.snapshots.refs.map((r) => r.cigar_id));
  const warnings = reverseWarnings(receipt, current);
  for (const w of warnings) io.log(`WARNING: ${w}`);
  if (warnings.length && !opts.force) throw new Error(`${warnings.length} reference row(s) changed since the run; re-run with --force to undo anyway`);
  const statements = reverseSql(receipt);
  const undoReceipt = { runId: `undo-${receipt.runId}`, executedAt: new Date().toISOString(), opsFile: receiptPath, committed: false, ops: receipt.ops, snapshots: receipt.snapshots };
  const undoPath = `${outDir}/receipt-undo-${receipt.runId}.json`;
  io.writeJson(undoPath, undoReceipt);
  await client.batch(statements);
  io.writeJson(undoPath, { ...undoReceipt, committed: true });
  io.log(`reversed ${receipt.ops.length} ops (${statements.length} statements); undo receipt ${undoPath}`);
  return { receiptPath: undoPath, reversed: statements.length };
}

/** Proves the channel runs a multi-statement request as one implicit transaction. */
export async function runProbeTxn(client: MgmtClient, io: Io): Promise<"rolled back" | "NOT rolled back"> {
  await client.query("drop table if exists _ae_txn_probe;");
  try {
    return await probeOnce(client, io);
  } finally {
    await client.query("drop table if exists _ae_txn_probe;");
  }
}

async function probeOnce(client: MgmtClient, io: Io): Promise<"rolled back" | "NOT rolled back"> {
  let batchError: Error | null = null;
  try {
    await client.batch(["create table _ae_txn_probe (id int);", "insert into _ae_txn_probe values (1);", "select 1 / 0;"]);
  } catch (e) {
    batchError = e as Error;
  }

  if (!batchError) {
    io.log("probe batch did not error; the channel may not run statements together");
    io.log("transaction probe: NOT rolled back");
    return "NOT rolled back";
  }

  // A transport failure or unrelated server error never proves anything about the transaction.
  if (!/division by zero/i.test(batchError.message)) {
    throw new Error(`transaction probe inconclusive: ${batchError.message}`);
  }
  io.log(`probe batch errored as intended: ${batchError.message.slice(0, 120)}`);

  try {
    const [{ n }] = await client.query<{ n: number | string }>("select count(*) as n from _ae_txn_probe;");
    const result = Number(n) === 0 ? "rolled back" : "NOT rolled back";
    io.log(`transaction probe: ${result}`);
    return result;
  } catch (e) {
    const message = (e as Error).message;
    // Postgres 42P01: the table itself never landed, so the whole batch was rolled back.
    if (/does not exist/i.test(message)) {
      io.log("transaction probe: rolled back");
      return "rolled back";
    }
    throw new Error(`transaction probe inconclusive: ${message}`);
  }
}
