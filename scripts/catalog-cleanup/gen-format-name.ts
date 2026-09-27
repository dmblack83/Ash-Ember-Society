/* Pass-1 generator: format -> name split for nameless vitolas -> ops-format-name.json.
 * Run: SUPABASE_MGMT_TOKEN=sbp_... npx tsx scripts/catalog-cleanup/gen-format-name.ts [--out .catalog-cleanup-out] */
import * as fs from "node:fs";
import * as path from "node:path";
import { createMgmtClient } from "../../lib/catalog-cleanup/mgmt-client";
import { parseOut } from "../../lib/catalog-cleanup/cli-args";
import { fetchVitolas } from "../../lib/catalog-cleanup/catalog-read";
import { generateFormatName } from "../../lib/catalog-cleanup/rules-format-name";
import { FORMATS } from "../../lib/cigar-taxonomy";
import type { OpsFile } from "../../lib/catalog-cleanup/types";

let outDir: string;
try { outDir = parseOut(process.argv.slice(2)).outDir; } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(2); }

async function main() {
  const token = process.env.SUPABASE_MGMT_TOKEN ?? "";
  if (!token) { console.error("SUPABASE_MGMT_TOKEN is not set"); process.exit(2); }
  const client = createMgmtClient({ token, projectRef: process.env.SUPABASE_PROJECT_REF });
  const vitolas = await fetchVitolas(client);
  const { ops, summary } = generateFormatName(vitolas, FORMATS);
  const file: OpsFile = { version: 1, generatedAt: new Date().toISOString(), generator: "rules-format-name", ops };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "ops-format-name.json"), JSON.stringify(file, null, 2));
  console.log(`nameless non-canonical candidates ${summary.candidates}: splittable ${summary.splittable} (community-added ${summary.communityAdded}), untouched ${summary.untouched}`);
  console.log(`wrote ${path.join(outDir, "ops-format-name.json")}`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
