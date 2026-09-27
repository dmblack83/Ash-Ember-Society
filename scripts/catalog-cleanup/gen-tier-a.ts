// scripts/catalog-cleanup/gen-tier-a.ts
/* Pass-1 generator: Tier-A rules -> ops.json + deferred.json.
 * Run: SUPABASE_MGMT_TOKEN=sbp_... npx tsx scripts/catalog-cleanup/gen-tier-a.ts [--out .catalog-cleanup-out] */
import * as fs from "node:fs";
import * as path from "node:path";
import { createMgmtClient } from "../../lib/catalog-cleanup/mgmt-client";
import { parseOut } from "../../lib/catalog-cleanup/cli-args";
import { fetchLines, fetchRefCounts, fetchVitolas } from "../../lib/catalog-cleanup/catalog-read";
import { generateTierA } from "../../lib/catalog-cleanup/rules-tier-a";
import type { OpsFile } from "../../lib/catalog-cleanup/types";

let outDir: string;
try { outDir = parseOut(process.argv.slice(2)).outDir; } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(2); }

async function main() {
  const token = process.env.SUPABASE_MGMT_TOKEN ?? "";
  if (!token) { console.error("SUPABASE_MGMT_TOKEN is not set"); process.exit(2); }
  const client = createMgmtClient({ token, projectRef: process.env.SUPABASE_PROJECT_REF });
  const [lines, vitolas, refs] = await Promise.all([fetchLines(client), fetchVitolas(client), fetchRefCounts(client)]);
  const { ops, deferred, summary } = generateTierA(lines, vitolas, refs);
  const file: OpsFile = { version: 1, generatedAt: new Date().toISOString(), generator: "rules-tier-a", ops };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "ops-tier-a.json"), JSON.stringify(file, null, 2));
  fs.writeFileSync(path.join(outDir, "deferred.json"), JSON.stringify(deferred, null, 2));
  console.log(`lines ${lines.length}, vitolas ${vitolas.length}, vitolas with real refs ${Object.keys(refs).length}`);
  console.log(`ops: case-dupe folds ${summary.caseDupeFolds}, noise folds ${summary.noiseFolds}, vitola merges ${summary.vitolaMerges}; deferred ${summary.deferred}`);
  console.log(`wrote ${path.join(outDir, "ops-tier-a.json")} and deferred.json`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
