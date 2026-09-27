/* Catalog cleanup executor. Run with: npx tsx scripts/catalog-cleanup/executor.ts <command> [args] [--out <dir>]
 *   refs                      count real humidor/smoke-log references per vitola -> refs.json
 *   probe-txn                 prove the Management API batch is one transaction (creates/drops _ae_txn_probe)
 *   preview <ops.json>        write preview.md, no prod writes
 *   execute <ops.json>        preview, then apply as one batch, write receipt
 *   confirm <receipt.json>    settle an uncommitted receipt: did its batch apply or not
 *   undo <receipt.json> [--force]
 * Env: SUPABASE_MGMT_TOKEN (required for every command; mint at supabase.com/dashboard/account/tokens,
 *      revoke after), SUPABASE_PROJECT_REF (optional). --out <dir> overrides .catalog-cleanup-out/.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { createMgmtClient } from "../../lib/catalog-cleanup/mgmt-client";
import { parseOut } from "../../lib/catalog-cleanup/cli-args";
import { runConfirm, runExecute, runPreview, runProbeTxn, runRefs, runUndo, type Io } from "../../lib/catalog-cleanup/executor-core";

const REVOKE_REMINDER = "Revoke the token at https://supabase.com/dashboard/account/tokens when the session's runs are finished.";
const USAGE = "usage: executor.ts refs | probe-txn | preview <ops.json> | execute <ops.json> | confirm <receipt.json> | undo <receipt.json> [--force] [--out <dir>]";

let parsed: ReturnType<typeof parseOut>;
try { parsed = parseOut(process.argv.slice(2)); } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(2); }
const { outDir, rest } = parsed;
const force = rest.includes("--force");
const [command, target] = rest.filter((a) => a !== "--force");

const io: Io = {
  readJson: (p) => JSON.parse(fs.readFileSync(p, "utf8")),
  writeText: (p, t) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); },
  writeJson: (p, d) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(d, null, 2)); },
  listReceipts: (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith("receipt-") && f.endsWith(".json")).map((f) => path.join(dir, f)) : []),
  log: (m) => console.log(m),
};

async function main() {
  const token = process.env.SUPABASE_MGMT_TOKEN ?? "";
  if (!token) { console.error("SUPABASE_MGMT_TOKEN is not set. Mint one at https://supabase.com/dashboard/account/tokens, then enter it with: read -s SUPABASE_MGMT_TOKEN; export SUPABASE_MGMT_TOKEN"); process.exit(2); }
  const client = createMgmtClient({ token, projectRef: process.env.SUPABASE_PROJECT_REF });
  switch (command) {
    case "refs": await runRefs(client, io, outDir); break;
    case "probe-txn": { const r = await runProbeTxn(client, io); if (r !== "rolled back") process.exit(1); break; }
    case "preview": if (!target) throw new Error("preview needs <ops.json>"); { const r = await runPreview(client, io, target, outDir); if (r.blocked) process.exit(1); } break;
    case "execute": if (!target) throw new Error("execute needs <ops.json>"); await runExecute(client, io, target, outDir); break;
    case "confirm": if (!target) throw new Error("confirm needs <receipt.json>"); { const r = await runConfirm(client, io, target); if (!r.confirmed) process.exit(1); } break;
    case "undo": if (!target) throw new Error("undo needs <receipt.json>"); await runUndo(client, io, target, outDir, { force }); break;
    default: console.error(USAGE); process.exit(2);
  }
  console.log(`Done. ${REVOKE_REMINDER}`);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  console.error(REVOKE_REMINDER);
  process.exit(1);
});
