/**
 * Migration script — move shade values out of cigar_catalog.wrapper
 * into the new cigar_catalog.shade column.
 *
 * Apply migration first:
 *   supabase/migrations/20260506_cigar_shade.sql
 *
 * Behavior:
 *   For each row in cigar_catalog where `wrapper` (case-insensitive,
 *   trimmed) matches a known shade alias, set `shade` to the canonical
 *   shade name and clear `wrapper`. Rows whose wrapper is a varietal
 *   (Habano, Corojo, Connecticut Shade, etc.) are left untouched.
 *
 * Usage:
 *   npx tsx scripts/migrate-wrapper-to-shade.ts --dry-run
 *   npx tsx scripts/migrate-wrapper-to-shade.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/* ------------------------------------------------------------------
   CLI args
   ------------------------------------------------------------------ */

const args     = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");

/* ------------------------------------------------------------------
   Alias map — lowercase wrapper value -> canonical shade name
   ------------------------------------------------------------------ */

const SHADE_ALIASES: Record<string, string> = {
  "candela":              "Candela / Double Claro",
  "double claro":         "Candela / Double Claro",
  "candela / double claro": "Candela / Double Claro",

  "claro":                "Claro",

  "colorado claro":       "Colorado Claro",
  "natural":              "Colorado Claro",

  "colorado":             "Colorado",

  "colorado maduro":      "Colorado Maduro",

  "maduro":               "Maduro",

  "oscuro":               "Oscuro / Double Maduro",
  "double maduro":        "Oscuro / Double Maduro",
  "oscuro / double maduro": "Oscuro / Double Maduro",
};

/* ------------------------------------------------------------------
   Connect
   ------------------------------------------------------------------ */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  console.error("Set both in .env.local before running.");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/* ------------------------------------------------------------------
   Fetch + plan
   ------------------------------------------------------------------ */

async function main() {
  const PAGE = 1000;
  let from = 0;
  const updates: Array<{ id: string; shade: string; oldWrapper: string }> = [];
  const untouched = new Map<string, number>(); // wrapper value -> count

  while (true) {
    const { data, error } = await supabase
      .from("cigar_catalog")
      .select("id, wrapper, shade")
      .not("wrapper", "is", null)
      .is("shade", null)
      .range(from, from + PAGE - 1);

    if (error) { console.error(error); process.exit(1); }
    if (!data || data.length === 0) break;

    for (const row of data) {
      const w = (row.wrapper ?? "").trim().toLowerCase();
      if (!w) continue;
      const canonical = SHADE_ALIASES[w];
      if (canonical) {
        updates.push({ id: row.id, shade: canonical, oldWrapper: row.wrapper });
      } else {
        untouched.set(row.wrapper, (untouched.get(row.wrapper) ?? 0) + 1);
      }
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  /* histogram of planned moves */
  const moveHistogram: Record<string, number> = {};
  for (const u of updates) {
    moveHistogram[u.shade] = (moveHistogram[u.shade] ?? 0) + 1;
  }

  console.log(`\nPlanned moves (wrapper -> shade): ${updates.length}`);
  for (const [k, v] of Object.entries(moveHistogram).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(5)}  ${k}`);
  }

  console.log(`\nUntouched wrapper values (kept as-is, top 30):`);
  const sortedUntouched = [...untouched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  for (const [k, v] of sortedUntouched) {
    console.log(`  ${v.toString().padStart(5)}  ${k}`);
  }
  if (untouched.size > 30) {
    console.log(`  …and ${untouched.size - 30} more`);
  }

  if (isDryRun) {
    console.log("\nDry run — no writes performed.");
    return;
  }

  /* ------------------------------------------------------------------
     Apply: set shade, clear wrapper, in batches
     ------------------------------------------------------------------ */

  const BATCH = 50;
  let ok = 0;
  let failed = 0;

  console.log(`\nApplying updates in batches of ${BATCH}…`);
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(({ id, shade }) =>
        supabase
          .from("cigar_catalog")
          .update({ shade, wrapper: null })
          .eq("id", id)
          .select("id")
          .maybeSingle()
      )
    );
    for (const r of results) {
      if (r.error) failed++;
      else         ok++;
    }
    process.stdout.write(`  ${ok + failed}/${updates.length}\r`);
  }

  console.log(`\n\nDone.`);
  console.log(`  ✓ updated: ${ok}`);
  console.log(`  ✗ errors:  ${failed}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
