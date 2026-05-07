/**
 * Migration script — clean up cigar_catalog country data.
 *
 * Three jobs in one pass:
 *
 *   1. Normalize country codes in `wrapper_country` to canonical names
 *      (e.g. "EC" -> "Ecuador").
 *
 *   2. Where `wrapper` holds a country value AND `wrapper_country` is
 *      NULL, copy it across (canonical name) and clear `wrapper`.
 *
 *   3. Where `wrapper` and `wrapper_country` both hold the same country
 *      (after normalization), clear `wrapper` — it's a duplicate.
 *
 *   Rows where wrapper and wrapper_country disagree on country are
 *   reported as conflicts and left untouched (users will fix via the
 *   edit-suggestion flow).
 *
 * Usage:
 *   npx tsx scripts/migrate-wrapper-country-leak.ts --dry-run
 *   npx tsx scripts/migrate-wrapper-country-leak.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const args     = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");

/* ------------------------------------------------------------------
   Country alias map — lowercase value -> canonical country name
   Canonical names match the wrapper_country dropdown list.
   ------------------------------------------------------------------ */

const COUNTRY_ALIASES: Record<string, string> = {
  /* codes */
  "ni":  "Nicaragua",
  "ec":  "Ecuador",
  "do":  "Dominican Republic",
  "mx":  "Mexico",
  "hn":  "Honduras",
  "us":  "USA",
  "usa": "USA",
  "cm":  "Cameroon",
  "br":  "Brazil",
  "id":  "Indonesia",
  "cu":  "Cuba",
  "cr":  "Costa Rica",
  "pa":  "Panama",
  "pe":  "Peru",

  /* names */
  "nicaragua":          "Nicaragua",
  "ecuador":            "Ecuador",
  "dominican republic": "Dominican Republic",
  "dom. republic":      "Dominican Republic",
  "dominican":          "Dominican Republic",
  "mexico":             "Mexico",
  "honduras":           "Honduras",
  "united states":      "USA",
  "united states of america": "USA",
  "america":            "USA",
  "cameroon":           "Cameroon",
  "brazil":             "Brazil",
  "indonesia":          "Indonesia",
  "cuba":               "Cuba",
  "costa rica":         "Costa Rica",
  "panama":             "Panama",
  "peru":               "Peru",
};

function canonicalCountry(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  return COUNTRY_ALIASES[v] ?? null;
}

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
   Plan
   ------------------------------------------------------------------ */

type Update = {
  id: string;
  setWrapperCountry?: string;
  clearWrapper?: boolean;
};

async function main() {
  const PAGE = 1000;
  let from = 0;

  /* counters and buckets */
  const updates: Update[] = [];
  const normalizeHist: Record<string, number> = {};
  const setFromWrapperHist: Record<string, number> = {};
  const clearDupHist: Record<string, number> = {};
  const conflicts: Array<{ id: string; wrapper: string; wrapper_country: string }> = [];
  const unmappedWrapperCountry = new Map<string, number>();

  while (true) {
    const { data, error } = await supabase
      .from("cigar_catalog")
      .select("id, wrapper, wrapper_country")
      .range(from, from + PAGE - 1);

    if (error) { console.error(error); process.exit(1); }
    if (!data || data.length === 0) break;

    for (const row of data) {
      const wrapperCanon = canonicalCountry(row.wrapper);   // null if not a country
      const countryCanon = canonicalCountry(row.wrapper_country); // null if not a country
      const update: Update = { id: row.id };
      let dirty = false;

      /* --- (1) normalize wrapper_country if it's a code or non-canonical name --- */
      if (row.wrapper_country) {
        if (countryCanon && countryCanon !== row.wrapper_country) {
          update.setWrapperCountry = countryCanon;
          normalizeHist[`${row.wrapper_country} -> ${countryCanon}`] =
            (normalizeHist[`${row.wrapper_country} -> ${countryCanon}`] ?? 0) + 1;
          dirty = true;
        } else if (!countryCanon) {
          unmappedWrapperCountry.set(
            row.wrapper_country,
            (unmappedWrapperCountry.get(row.wrapper_country) ?? 0) + 1,
          );
        }
      }

      /* --- (2) wrapper holds a country value --- */
      if (wrapperCanon) {
        const effectiveCountry = update.setWrapperCountry ?? countryCanon ?? null;

        if (!effectiveCountry) {
          /* wrapper_country empty — copy across */
          update.setWrapperCountry = wrapperCanon;
          update.clearWrapper      = true;
          setFromWrapperHist[wrapperCanon] = (setFromWrapperHist[wrapperCanon] ?? 0) + 1;
          dirty = true;
        } else if (effectiveCountry === wrapperCanon) {
          /* duplicate — clear wrapper */
          update.clearWrapper = true;
          clearDupHist[wrapperCanon] = (clearDupHist[wrapperCanon] ?? 0) + 1;
          dirty = true;
        } else {
          /* conflict — skip, surface for review */
          conflicts.push({
            id: row.id,
            wrapper: row.wrapper!,
            wrapper_country: row.wrapper_country!,
          });
        }
      }

      if (dirty) updates.push(update);
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  /* ------------------------------------------------------------------
     Report
     ------------------------------------------------------------------ */

  console.log(`\n(1) Normalize wrapper_country codes -> names:`);
  if (Object.keys(normalizeHist).length === 0) console.log("  (none)");
  for (const [k, v] of Object.entries(normalizeHist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(5)}  ${k}`);
  }

  console.log(`\n(2) Copy wrapper -> wrapper_country (was NULL):`);
  if (Object.keys(setFromWrapperHist).length === 0) console.log("  (none)");
  for (const [k, v] of Object.entries(setFromWrapperHist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(5)}  ${k}`);
  }

  console.log(`\n(3) Clear duplicate wrapper (matches wrapper_country):`);
  if (Object.keys(clearDupHist).length === 0) console.log("  (none)");
  for (const [k, v] of Object.entries(clearDupHist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(5)}  ${k}`);
  }

  console.log(`\nConflicts (wrapper vs wrapper_country disagree, left untouched): ${conflicts.length}`);
  const conflictHist: Record<string, number> = {};
  for (const c of conflicts) {
    const k = `${c.wrapper} | ${c.wrapper_country}`;
    conflictHist[k] = (conflictHist[k] ?? 0) + 1;
  }
  for (const [k, v] of Object.entries(conflictHist).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${v.toString().padStart(5)}  ${k}`);
  }
  if (Object.keys(conflictHist).length > 20) {
    console.log(`  …and ${Object.keys(conflictHist).length - 20} more`);
  }

  if (unmappedWrapperCountry.size > 0) {
    console.log(`\nUnmapped wrapper_country values (kept as-is, top 20):`);
    const sorted = [...unmappedWrapperCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    for (const [k, v] of sorted) {
      console.log(`  ${v.toString().padStart(5)}  ${k}`);
    }
  }

  console.log(`\nTotal rows to update: ${updates.length}`);

  if (isDryRun) {
    console.log("Dry run — no writes performed.");
    return;
  }

  /* ------------------------------------------------------------------
     Apply
     ------------------------------------------------------------------ */

  const BATCH = 50;
  let ok = 0;
  let failed = 0;

  console.log(`\nApplying updates in batches of ${BATCH}…`);
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map((u) => {
        const patch: { wrapper_country?: string; wrapper?: null } = {};
        if (u.setWrapperCountry) patch.wrapper_country = u.setWrapperCountry;
        if (u.clearWrapper)      patch.wrapper = null;
        return supabase
          .from("cigar_catalog")
          .update(patch)
          .eq("id", u.id)
          .select("id")
          .maybeSingle();
      })
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
