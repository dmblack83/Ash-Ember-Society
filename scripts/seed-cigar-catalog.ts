/**
 * Seed script — Cigar Catalog
 *
 * Loads cigars_clean.json into the cigar_catalog table in Supabase.
 *
 * Usage:
 *   npx tsx scripts/seed-cigar-catalog.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in .env.local
 * Place cigars_clean.json in the scripts/ directory before running.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

/* ------------------------------------------------------------------
   Parse source file
   ------------------------------------------------------------------ */

const filePath = path.resolve(process.cwd(), "scripts/cigars_clean.json");

if (!fs.existsSync(filePath)) {
  console.error("cigars_clean.json not found at scripts/cigars_clean.json");
  console.error("Copy the file there and try again.");
  process.exit(1);
}

let raw = fs.readFileSync(filePath, "utf-8").trim();
if (raw.startsWith("```json")) raw = raw.slice(7);
if (raw.endsWith("```"))       raw = raw.slice(0, -3);
raw = raw.trim();

const data = JSON.parse(raw);
const cigars = data.payload as any[];

/* ------------------------------------------------------------------
   Transform
   ------------------------------------------------------------------ */

function firstValue(arr: { name?: string | null; country?: string | null }[]): string | null {
  if (!arr || arr.length === 0) return null;
  const entry = arr[0];
  if (entry.name) return entry.name;
  if (entry.country) return entry.country;
  return null;
}

function countryList(arr: { country?: string | null }[]): string[] {
  if (!arr) return [];
  return [...new Set(arr.map((x) => x.country).filter(Boolean))] as string[];
}

const rows = cigars.map((c: any) => {
  const brand  = c.series?.brand?.name   ?? null;
  const series = c.series?.name          ?? null;
  const format = c.format?.trim()        ?? null;

  const wrappers = c.series?.wrappers ?? [];
  const binders  = c.series?.binders  ?? [];
  const fillers  = c.series?.fillers   ?? [];

  return {
    source_id:       String(c.id),
    brand,
    series,
    name:            [brand, series, format].filter(Boolean).join(" — "),
    format,
    ring_gauge:      c.ringGauge   ?? null,
    length_inches:   c.length      ?? null,
    wrapper:         firstValue(wrappers),
    wrapper_country: wrappers[0]?.country ?? null,
    binder_country:  firstValue(binders),
    filler_countries: countryList(fillers),
    approved:        c.approved    ?? false,
    community_added: false,
  };
});

/* ------------------------------------------------------------------
   Upsert in batches of 500
   ------------------------------------------------------------------ */

const BATCH = 500;

async function main() {
  console.log(`\nSeeding ${rows.length} cigars into cigar_catalog...\n`);

  let inserted = 0;
  let errors   = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("cigar_catalog")
      .upsert(batch, { onConflict: "source_id" });

    if (error) {
      console.error(`  ✗  Batch ${i}–${i + batch.length}: ${error.message}`);
      errors += batch.length;
    } else {
      inserted += batch.length;
      process.stdout.write(`  ✓  ${inserted} / ${rows.length}\r`);
    }
  }

  console.log(`\n\nDone. ${inserted} inserted, ${errors} errors.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
