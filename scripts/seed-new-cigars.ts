/**
 * Seed script — New Cigars
 *
 * Inserts records from components/cigars/new_cigars.json into cigar_catalog.
 * Skips any row where brand + series + format already exists.
 *
 * Usage:
 *   npx tsx scripts/seed-new-cigars.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv      from "dotenv";
import * as path        from "path";
import * as fs          from "fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

/* ------------------------------------------------------------------
   Load source file
   ------------------------------------------------------------------ */

const filePath = path.resolve(process.cwd(), "components/cigars/new_cigars.json");

if (!fs.existsSync(filePath)) {
  console.error("new_cigars.json not found at components/cigars/new_cigars.json");
  process.exit(1);
}

const source: {
  brand:         string;
  series:        string;
  name:          string;
  vitola:        string;
  ring_gauge:    number | null;
  length_inches: number | null;
  wrapper:       string;
  origin:        string;
  binder:        string;
  filler:        string;
}[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));

/* ------------------------------------------------------------------
   Transform
   ------------------------------------------------------------------ */

function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

const rows = source.map((c) => {
  const brand  = c.brand.trim()  || null;
  const series = c.series.trim() || null;
  const format = c.vitola.trim() || null;

  return {
    brand,
    series,
    format,
    ring_gauge:      c.ring_gauge    ?? null,
    length_inches:   c.length_inches ?? null,
    wrapper:         c.wrapper  ? toTitleCase(c.wrapper)  : null,
    wrapper_country: c.origin   ? toTitleCase(c.origin)   : null,
  };
});

/* ------------------------------------------------------------------
   Fetch existing (brand + series + format) combos to skip dupes
   ------------------------------------------------------------------ */

async function main() {
  console.log(`\nLoaded ${rows.length} cigars from new_cigars.json`);
  console.log("Fetching existing catalog entries to check for duplicates...\n");

  const { data: existing, error: fetchErr } = await supabase
    .from("cigar_catalog")
    .select("brand, series, format");

  if (fetchErr) {
    console.error("Failed to fetch existing catalog:", fetchErr.message);
    process.exit(1);
  }

  const existingKeys = new Set(
    (existing ?? []).map((r) => `${r.brand}||${r.series}||${r.format}`)
  );

  const toInsert = rows.filter((r) => {
    const key = `${r.brand}||${r.series}||${r.format}`;
    return !existingKeys.has(key);
  });

  const skipped = rows.length - toInsert.length;
  console.log(`  ${skipped} already in catalog — skipping`);
  console.log(`  ${toInsert.length} new rows to insert\n`);

  if (toInsert.length === 0) {
    console.log("Nothing to insert. Done.");
    return;
  }

  /* ---- Insert in batches of 200 ---------------------------------- */

  const BATCH = 200;
  let inserted = 0;
  let errors   = 0;

  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const { error } = await supabase.from("cigar_catalog").insert(batch);

    if (error) {
      console.error(`  ✗  Batch ${i}–${i + batch.length}: ${error.message}`);
      errors += batch.length;
    } else {
      inserted += batch.length;
      process.stdout.write(`  ✓  ${inserted} / ${toInsert.length}\r`);
    }
  }

  console.log(`\n\nDone. ${inserted} inserted, ${errors} errors, ${skipped} skipped.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
