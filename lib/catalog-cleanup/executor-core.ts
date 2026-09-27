import type { MgmtClient } from "./mgmt-client";
import { validateOpsFile } from "./ops";
import { forwardSql } from "./sql";
import { checkPreconditions, renderPreview } from "./preview";
import { buildReceipt, collectTouched, reverseSql, reverseWarnings } from "./receipt";
import {
  VITOLA_COLUMN_LIST, buildContext, fetchLines, fetchLinesById, fetchRefCounts, fetchRefRows, fetchVitolas, fetchVitolasById,
} from "./catalog-read";
import type { CatalogContext, LineRow, Op, Receipt, VitolaRow } from "./types";

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
    .map((p) => `receipt ${p} is NOT committed: a previous execute may have failed after writing it; run confirm on it before proceeding`);
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

export const SNAPSHOT_COLUMNS_SQL =
  "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'cigar_catalog' and is_generated = 'NEVER' order by column_name;";

/** Receipts snapshot VITOLA_COLUMN_LIST; a prod column outside it would be lost by an undo re-insert. */
export async function checkSnapshotColumns(client: MgmtClient): Promise<void> {
  const rows = await client.query<{ column_name: string }>(SNAPSHOT_COLUMNS_SQL);
  const prod = new Set(rows.map((r) => r.column_name));
  const listed = new Set(VITOLA_COLUMN_LIST);
  const missing = [...prod].filter((c) => !listed.has(c));
  const extra = [...listed].filter((c) => !prod.has(c));
  if (missing.length) throw new Error(`snapshot column list is missing prod column(s): ${missing.join(", ")} — update VITOLA_COLUMN_LIST before executing`);
  if (extra.length) throw new Error(`snapshot column list has column(s) prod lacks: ${extra.join(", ")} — update VITOLA_COLUMN_LIST before executing`);
}

export async function runExecute(client: MgmtClient, io: Io, opsPath: string, outDir: string) {
  const { blocked, ops, ctx } = await runPreview(client, io, opsPath, outDir);
  if (blocked > 0) throw new Error(`${blocked} op(s) blocked; fix the ops file or mark them reviewed. See ${outDir}/preview.md`);
  if (ops.length === 0) { io.log("nothing to do"); return { receiptPath: "", applied: 0 }; }

  // Everything that can fail before the write runs before the receipt exists,
  // so a schema or render error never leaves a stray uncommitted receipt.
  await checkSnapshotColumns(client);
  const statements = ops.flatMap((op) => forwardSql(op, ctx));
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

  io.log(`sending ${statements.length} statements as one batch`);
  await client.batch(statements);

  io.writeJson(receiptPath, { ...receipt, committed: true });
  io.log(`applied ${ops.length} ops; receipt ${receiptPath}`);
  return { receiptPath, applied: ops.length };
}

interface ExpectedState {
  vitolaFields: Map<string, Record<string, unknown>>;
  lineFields: Map<string, { brand: string; series: string | null }>;
  mergedAway: Set<string>;
  foldedAway: Set<string>;
}

/** The state a fully applied run leaves behind: final field values per row (a
 *  later op on the same field wins) and the rows the run removed. */
function expectedAfter(ops: Op[], includeFills: boolean): ExpectedState {
  const vitolaFields = new Map<string, Record<string, unknown>>();
  const lineFields = new Map<string, { brand: string; series: string | null }>();
  const mergedAway = new Set<string>(), foldedAway = new Set<string>();
  const setV = (id: string, k: string, v: unknown) => vitolaFields.set(id, { ...(vitolaFields.get(id) ?? {}), [k]: v });
  for (const op of ops) {
    switch (op.type) {
      case "fold_line":
        foldedAway.add(op.sourceLineId);
        if (includeFills) for (const [vid, fill] of Object.entries(op.childFills)) for (const [k, v] of Object.entries(fill)) setV(vid, k, v);
        break;
      case "merge_vitola": mergedAway.add(op.sourceVitolaId); break;
      case "rename_line": lineFields.set(op.lineId, { brand: op.brand, series: op.series }); break;
      case "update_vitola": for (const [k, v] of Object.entries(op.fields)) setV(op.vitolaId, k, v); break;
      case "write_name": setV(op.vitolaId, "name", op.name); break;
    }
  }
  return { vitolaFields, lineFields, mergedAway, foldedAway };
}

const sameValue = (a: unknown, b: unknown): boolean => {
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return String(a) === String(b);
};
const show = (v: unknown) => (v === null || v === undefined ? "null" : Array.isArray(v) ? JSON.stringify(v) : `"${String(v)}"`);

/** Whether each op's effect is visible in prod right now. */
async function opPostconditions(client: MgmtClient, ops: Op[]): Promise<boolean[]> {
  const exp = expectedAfter(ops, false);
  const lineIds = new Set<string>(), vitolaIds = new Set<string>();
  for (const op of ops) {
    if (op.type === "fold_line") lineIds.add(op.sourceLineId);
    if (op.type === "rename_line") lineIds.add(op.lineId);
    if (op.type === "merge_vitola") vitolaIds.add(op.sourceVitolaId);
    if (op.type === "update_vitola" || op.type === "write_name") vitolaIds.add(op.vitolaId);
  }
  const [lines, vitolas] = await Promise.all([fetchLinesById(client, [...lineIds]), fetchVitolasById(client, [...vitolaIds])]);
  const lineNow = new Map<string, LineRow>(lines.map((l) => [l.id, l]));
  const vitNow = new Map<string, VitolaRow>(vitolas.map((v) => [v.id, v]));
  const vitolaHolds = (id: string, keys: string[]) => {
    if (exp.mergedAway.has(id)) return !vitNow.has(id);
    const v = vitNow.get(id) as unknown as Record<string, unknown> | undefined;
    const want = exp.vitolaFields.get(id) ?? {};
    return !!v && keys.every((k) => sameValue(v[k], want[k]));
  };
  return ops.map((op) => {
    switch (op.type) {
      case "fold_line": return !lineNow.has(op.sourceLineId);
      case "merge_vitola": return !vitNow.has(op.sourceVitolaId);
      case "rename_line": {
        if (exp.foldedAway.has(op.lineId)) return !lineNow.has(op.lineId);
        const l = lineNow.get(op.lineId), want = exp.lineFields.get(op.lineId)!;
        return !!l && sameValue(l.brand, want.brand) && sameValue(l.series, want.series);
      }
      case "update_vitola": return vitolaHolds(op.vitolaId, Object.keys(op.fields));
      case "write_name": return vitolaHolds(op.vitolaId, ["name"]);
    }
  });
}

/** Settles an uncommitted receipt after an execute whose confirmation was lost. */
export async function runConfirm(client: MgmtClient, io: Io, receiptPath: string): Promise<{ confirmed: boolean; applied?: number }> {
  const receipt = io.readJson(receiptPath) as Receipt;
  if (!receipt || !Array.isArray(receipt.ops)) throw new Error(`receipt ${receiptPath} is not a receipt`);
  if (receipt.committed === true) { io.log(`receipt ${receiptPath} is already committed`); return { confirmed: true }; }
  if (receipt.runId.startsWith("undo-")) throw new Error("confirm does not support undo receipts");
  const holds = await opPostconditions(client, receipt.ops);
  const applied = holds.filter(Boolean).length, total = holds.length;
  if (applied === total) {
    io.writeJson(receiptPath, { ...receipt, committed: true });
    io.log(`batch applied: all ${total} ops are in prod; receipt ${receiptPath} is now committed (undo works)`);
    return { confirmed: true, applied };
  }
  if (applied === 0) {
    io.log(`batch did not apply; delete this receipt (${receiptPath}) and re-run execute`);
    return { confirmed: false, applied: 0 };
  }
  const which = holds.map((h, i) => `op ${i} (${receipt.ops[i].type}): ${h ? "applied" : "not applied"}`).join("; ");
  throw new Error(`partial state detected: ${applied} of ${total} ops applied; the batch should have been atomic, investigate before doing anything else. ${which}`);
}

/** Rows edited since the run. Their guarded reverse statements match nothing and are skipped. */
async function driftWarnings(client: MgmtClient, receipt: Receipt): Promise<string[]> {
  const exp = expectedAfter(receipt.ops, true);
  const vitolaIds = [...exp.vitolaFields.keys()].filter((id) => !exp.mergedAway.has(id));
  const lineIds = [...exp.lineFields.keys()].filter((id) => !exp.foldedAway.has(id));
  const [vitolas, lines] = await Promise.all([fetchVitolasById(client, vitolaIds), fetchLinesById(client, lineIds)]);
  const vitNow = new Map(vitolas.map((v) => [v.id, v as unknown as Record<string, unknown>]));
  const lineNow = new Map(lines.map((l) => [l.id, l as unknown as Record<string, unknown>]));
  const out: string[] = [];
  const compare = (kind: string, id: string, now: Record<string, unknown> | undefined, want: Record<string, unknown>) => {
    if (!now) { out.push(`${kind} ${id}: no longer exists; it will not be reverted`); return; }
    for (const [k, v] of Object.entries(want)) {
      if (!sameValue(now[k], v)) out.push(`${kind} ${id}: ${k} drifted from ${show(v)} to ${show(now[k])}; it will not be reverted`);
    }
  };
  for (const id of vitolaIds) compare("vitola", id, vitNow.get(id), exp.vitolaFields.get(id)!);
  for (const id of lineIds) compare("line", id, lineNow.get(id), exp.lineFields.get(id)!);
  return out;
}

export async function runUndo(client: MgmtClient, io: Io, receiptPath: string, outDir: string, opts: { force: boolean }) {
  const receipt = io.readJson(receiptPath) as Receipt;
  if (!receipt || receipt.committed !== true) throw new Error(`receipt ${receiptPath} is not committed; nothing to undo (run confirm on it first)`);
  if (receipt.runId.startsWith("undo-")) throw new Error(`receipt ${receiptPath} is an undo receipt; redo is not supported, re-run the original ops file instead`);
  const current = await fetchRefRows(client, receipt.snapshots.refs.map((r) => r.cigar_id));
  const warnings = [...reverseWarnings(receipt, current), ...(await driftWarnings(client, receipt))];
  for (const w of warnings) io.log(`WARNING: ${w}`);
  if (warnings.length && !opts.force) throw new Error(`${warnings.length} row(s) changed since the run; re-run with --force to undo anyway (changed rows are left as they are)`);
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
