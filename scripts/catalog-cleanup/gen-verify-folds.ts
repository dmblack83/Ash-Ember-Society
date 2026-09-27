/* Pass-2 generator: fold verdicts -> ops-verify-folds.json, review.json, resolved-keep.json.
 * Run: SUPABASE_MGMT_TOKEN=... npx tsx scripts/catalog-cleanup/gen-verify-folds.ts [--out .catalog-cleanup-out] [--decisions <review-decided.json>]
 * Reads every <out>/research/targets/folds-NN.json and every <out>/research/verdicts/*.json */
import * as fs from "node:fs";
import * as path from "node:path";
import { createMgmtClient } from "../../lib/catalog-cleanup/mgmt-client";
import { fetchLines, fetchRefCounts, fetchVitolas } from "../../lib/catalog-cleanup/catalog-read";
import { generateVerifyFolds, validateVerdictFile, type Decision } from "../../lib/catalog-cleanup/verify-folds";
import { parseOut } from "../../lib/catalog-cleanup/cli-args";
import type { FoldTarget } from "../../lib/catalog-cleanup/research-targets";
import type { OpsFile } from "../../lib/catalog-cleanup/types";

const { outDir, rest } = parseOut(process.argv.slice(2));
const dIdx = rest.indexOf("--decisions");
const decisionsArg = dIdx >= 0 ? rest[dIdx + 1] : null;
if (dIdx >= 0 && !decisionsArg) { console.error("--decisions needs a file"); process.exit(2); }
/* accept "--decisions review-decided.json" as shorthand for <out>/review-decided.json */
const decisionsPath = decisionsArg && !fs.existsSync(decisionsArg) && fs.existsSync(path.join(outDir, decisionsArg)) ? path.join(outDir, decisionsArg) : decisionsArg;
if (decisionsPath && path.resolve(decisionsPath) === path.resolve(outDir, "review.json")) {
  console.error("copy review.json to review-decided.json and edit that; the output file is overwritten each run");
  process.exit(2);
}

async function main() {
  const token = process.env.SUPABASE_MGMT_TOKEN ?? "";
  if (!token) { console.error("SUPABASE_MGMT_TOKEN is not set"); process.exit(2); }
  const tdir = path.join(outDir, "research", "targets");
  const targetFiles = fs.existsSync(tdir) ? fs.readdirSync(tdir).filter((f) => /^folds-\d+\.json$/.test(f)).sort() : [];
  if (targetFiles.length === 0) { console.error(`no folds-NN.json in ${tdir}; run gen-research-targets first`); process.exit(2); }
  const targets: FoldTarget[] = targetFiles.flatMap((f) => (JSON.parse(fs.readFileSync(path.join(tdir, f), "utf8")) as { targets: FoldTarget[] }).targets);
  const vdir = path.join(outDir, "research", "verdicts");
  const files = fs.existsSync(vdir) ? fs.readdirSync(vdir).filter((f) => f.endsWith(".json")).sort() : [];
  const verdictFiles = files.map((f) => validateVerdictFile(JSON.parse(fs.readFileSync(path.join(vdir, f), "utf8")), f));
  if (decisionsPath && !fs.existsSync(decisionsPath)) { console.error(`missing ${decisionsPath}`); process.exit(2); }
  const decisions: Decision[] | undefined = decisionsPath ? (JSON.parse(fs.readFileSync(decisionsPath, "utf8")) as Decision[]) : undefined;
  const targetIds = new Set(targets.map((t) => t.id));
  for (const d of decisions ?? []) if (!targetIds.has(d.targetId)) console.log(`decision ignored: ${d.targetId} matches no target`);
  const client = createMgmtClient({ token, projectRef: process.env.SUPABASE_PROJECT_REF });
  const [lines, vitolas, refs] = await Promise.all([fetchLines(client), fetchVitolas(client), fetchRefCounts(client)]);
  const r = generateVerifyFolds({ targets, verdictFiles, decisions, lines, vitolas, refs });
  const file: OpsFile = { version: 1, generatedAt: new Date().toISOString(), generator: "verify-folds", ops: r.ops };
  fs.writeFileSync(path.join(outDir, "ops-verify-folds.json"), JSON.stringify(file, null, 2));
  fs.writeFileSync(path.join(outDir, "review.json"), JSON.stringify(r.review, null, 2));
  fs.writeFileSync(path.join(outDir, "resolved-keep.json"), JSON.stringify(r.resolvedKeep, null, 2));
  console.log(`verdict files: ${files.length}; ${JSON.stringify(r.summary)}`);
  for (const s of r.skipped) console.log(`skipped: ${s}`);
  for (const o of r.orphans) {
    const models = verdictFiles.filter((f) => f.verdicts.some((vd) => vd.targetId === o)).map((f) => f.model);
    console.log(`orphan verdict: ${o} (${models.join(", ")})`);
  }
  console.log(`wrote ops-verify-folds.json (${r.ops.length} ops), review.json (${r.review.length} for Dave), resolved-keep.json (${r.resolvedKeep.length})`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
