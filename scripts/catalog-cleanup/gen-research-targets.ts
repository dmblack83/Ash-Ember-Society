/* Pass-2 exporter: writes research batches for the fold-verdict and naming agents.
 * Run: SUPABASE_MGMT_TOKEN=... npx tsx scripts/catalog-cleanup/gen-research-targets.ts [--out .catalog-cleanup-out] [--max-per-batch 40]
 * Reads <out>/deferred.json (from gen-tier-a). Writes <out>/research/targets/folds.json and <out>/research/targets/names-NN.json */
import * as fs from "node:fs";
import * as path from "node:path";
import { createMgmtClient } from "../../lib/catalog-cleanup/mgmt-client";
import { fetchLines, fetchRefCounts, fetchVitolas } from "../../lib/catalog-cleanup/catalog-read";
import { buildFoldTargets, buildNameBatches } from "../../lib/catalog-cleanup/research-targets";
import { parseOut } from "../../lib/catalog-cleanup/cli-args";

const { outDir, rest } = parseOut(process.argv.slice(2));
const mIdx = rest.indexOf("--max-per-batch");
const maxPerBatch = mIdx >= 0 ? Number(rest[mIdx + 1]) : 40;
if (!Number.isInteger(maxPerBatch) || maxPerBatch < 5) { console.error("--max-per-batch needs an integer >= 5"); process.exit(2); }

async function main() {
  const token = process.env.SUPABASE_MGMT_TOKEN ?? "";
  if (!token) { console.error("SUPABASE_MGMT_TOKEN is not set"); process.exit(2); }
  const deferredPath = path.join(outDir, "deferred.json");
  if (!fs.existsSync(deferredPath)) { console.error(`missing ${deferredPath}; run gen-tier-a first`); process.exit(2); }
  const deferred = JSON.parse(fs.readFileSync(deferredPath, "utf8"));
  const client = createMgmtClient({ token, projectRef: process.env.SUPABASE_PROJECT_REF });
  const [lines, vitolas, refs] = await Promise.all([fetchLines(client), fetchVitolas(client), fetchRefCounts(client)]);
  const folds = buildFoldTargets(deferred, lines, vitolas, refs);
  const names = buildNameBatches(lines, vitolas, refs, maxPerBatch);
  const dir = path.join(outDir, "research", "targets");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "folds.json"), JSON.stringify(folds, null, 2));
  for (const b of names) fs.writeFileSync(path.join(dir, `${b.batch}.json`), JSON.stringify(b, null, 2));
  console.log(`fold targets: ${folds.filter((f) => f.kind === "fold").length} folds + ${folds.filter((f) => f.kind === "near_dupe").length} near-dupes -> ${path.join(dir, "folds.json")}`);
  console.log(`name batches: ${names.length} files, ${names.reduce((s, b) => s + b.vitolas.length, 0)} nameless vitolas, max ${maxPerBatch} per batch`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
