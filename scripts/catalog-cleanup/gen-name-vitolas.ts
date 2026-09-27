/* Pass-2 generator: name research -> ops-name-vitolas.json, names-pending.json, dims-flags.json.
 * Run: SUPABASE_MGMT_TOKEN=... npx tsx scripts/catalog-cleanup/gen-name-vitolas.ts [--out .catalog-cleanup-out] [--min-confidence high|medium|low]
 * Reads every <out>/research/names/*.json */
import * as fs from "node:fs";
import * as path from "node:path";
import { createMgmtClient } from "../../lib/catalog-cleanup/mgmt-client";
import { fetchVitolas } from "../../lib/catalog-cleanup/catalog-read";
import { generateNameVitolas, validateNameFile, type Confidence } from "../../lib/catalog-cleanup/name-vitolas";
import { parseOut } from "../../lib/catalog-cleanup/cli-args";
import type { OpsFile } from "../../lib/catalog-cleanup/types";

const { outDir, rest } = parseOut(process.argv.slice(2));
const cIdx = rest.indexOf("--min-confidence");
const minConfidence = (cIdx >= 0 ? rest[cIdx + 1] : "high") as Confidence;
if (!["high", "medium", "low"].includes(minConfidence)) { console.error("--min-confidence must be high|medium|low"); process.exit(2); }

async function main() {
  const token = process.env.SUPABASE_MGMT_TOKEN ?? "";
  if (!token) { console.error("SUPABASE_MGMT_TOKEN is not set"); process.exit(2); }
  const ndir = path.join(outDir, "research", "names");
  const files = fs.existsSync(ndir) ? fs.readdirSync(ndir).filter((f) => f.endsWith(".json")).sort() : [];
  if (files.length === 0) { console.error(`no research files in ${ndir}`); process.exit(2); }
  const nameFiles = files.map((f) => validateNameFile(JSON.parse(fs.readFileSync(path.join(ndir, f), "utf8")), f));
  const client = createMgmtClient({ token, projectRef: process.env.SUPABASE_PROJECT_REF });
  const vitolas = await fetchVitolas(client);
  const r = generateNameVitolas({ nameFiles, vitolas, minConfidence });
  const file: OpsFile = { version: 1, generatedAt: new Date().toISOString(), generator: "name-vitolas", ops: r.ops };
  fs.writeFileSync(path.join(outDir, "ops-name-vitolas.json"), JSON.stringify(file, null, 2));
  fs.writeFileSync(path.join(outDir, "names-pending.json"), JSON.stringify(r.pending, null, 2));
  fs.writeFileSync(path.join(outDir, "dims-flags.json"), JSON.stringify(r.dimsFlags, null, 2));
  fs.writeFileSync(path.join(outDir, "names-rejected.txt"), r.rejected.join("\n"));
  console.log(`research files: ${files.length}; ${JSON.stringify(r.summary)}`);
  console.log(`wrote ops-name-vitolas.json (${r.ops.length} ops at >= ${minConfidence}), names-pending.json (${r.pending.length}), dims-flags.json (${r.dimsFlags.length}), names-rejected.txt (${r.rejected.length})`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
