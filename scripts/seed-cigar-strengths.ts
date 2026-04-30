/**
 * Seed script — Cigar strengths
 *
 * Reads the CDB.json export and populates the cigar_catalog.strength
 * column for every matching id. CDB uses display labels (e.g. "Mild-Med")
 * which are mapped here to the snake_case enum values the app's UI
 * helpers expect (mild, mild_medium, medium, medium_full, full).
 *
 * Source path is intentionally absolute — the JSON lives outside the
 * repo. Pass --source=<path> to override.
 *
 * Apply the migration first:
 *   supabase/migrations/20260430_cigar_strength.sql
 *
 * Usage:
 *   npx tsx scripts/seed-cigar-strengths.ts
 *   npx tsx scripts/seed-cigar-strengths.ts --dry-run
 *   npx tsx scripts/seed-cigar-strengths.ts --source=/path/to/CDB.json
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/* ------------------------------------------------------------------
   CLI args
   ------------------------------------------------------------------ */

const args     = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const sourceArg = args.find((a) => a.startsWith("--source="))?.split("=")[1];

const SOURCE = sourceArg
  ?? "/Users/dave.black/Documents/Claude/Projects/Ash & Ember Society/CDB.json";

if (!fs.existsSync(SOURCE)) {
  console.error(`Source file not found: ${SOURCE}`);
  process.exit(1);
}

/* ------------------------------------------------------------------
   Map CDB display values → app's internal snake_case enum
   ------------------------------------------------------------------ */

const STRENGTH_MAP: Record<string, string> = {
  "Mild":     "mild",
  "Mild-Med": "mild_medium",
  "Med":      "medium",
  "Med-Full": "medium_full",
  "Full":     "full",
};

interface CdbRow {
  id:       string;
  strength: string | null;
}

const raw = fs.readFileSync(SOURCE, "utf-8");
const rows: CdbRow[] = JSON.parse(raw);

const updates: Array<{ id: string; strength: string }> = [];
const unknownStrengths = new Set<string>();
let skippedNoStrength = 0;

for (const r of rows) {
  if (!r.id) continue;
  if (r.strength == null) { skippedNoStrength++; continue; }
  const mapped = STRENGTH_MAP[r.strength];
  if (!mapped) {
    unknownStrengths.add(r.strength);
    continue;
  }
  updates.push({ id: r.id, strength: mapped });
}

if (unknownStrengths.size > 0) {
  console.error(`Unmapped strength values found in source: ${[...unknownStrengths].join(", ")}`);
  console.error("Add them to STRENGTH_MAP and re-run.");
  process.exit(1);
}

console.log(`Source rows:     ${rows.length}`);
console.log(`Updates queued:  ${updates.length}`);
console.log(`Skipped (null):  ${skippedNoStrength}`);

if (isDryRun) {
  const histogram: Record<string, number> = {};
  for (const u of updates) histogram[u.strength] = (histogram[u.strength] ?? 0) + 1;
  console.log("\nDry run — would write:");
  for (const [k, v] of Object.entries(histogram).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(13)} ${v}`);
  }
  process.exit(0);
}

/* ------------------------------------------------------------------
   Apply
   ------------------------------------------------------------------ */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  console.error("Set both in .env.local before running without --dry-run.");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BATCH = 50;
let ok      = 0;
let missing = 0;
let failed  = 0;

async function main() {
  console.log(`\nApplying updates in batches of ${BATCH}…`);
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(({ id, strength }) =>
        supabase
          .from("cigar_catalog")
          .update({ strength })
          .eq("id", id)
          .select("id")
          .maybeSingle()
      )
    );
    for (const r of results) {
      if (r.error)        failed++;
      else if (!r.data)   missing++;
      else                ok++;
    }
    process.stdout.write(`  ${ok + missing + failed}/${updates.length}\r`);
  }
  console.log(`\n\nDone.`);
  console.log(`  ✓ updated:        ${ok}`);
  console.log(`  ⚠ id not in DB:   ${missing}`);
  console.log(`  ✗ errors:         ${failed}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
