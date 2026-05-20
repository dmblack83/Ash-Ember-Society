/**
 * Cigar taxonomy — single source of truth for the dropdown options
 * used in the manual Add Cigar form.
 *
 * Only `name` (or numeric `value` / `inches`) is persisted to the
 * cigar_catalog. `description` is UI-only and shown to users picking
 * a value; never sent to the database.
 *
 * Editing this list requires no migration — the DB does not constrain
 * these columns.
 */

export interface OptionWithDescription {
  name:        string;
  description: string;
}

/* ------------------------------------------------------------------
   Shades — wrapper colour
   ------------------------------------------------------------------ */

export const SHADES: OptionWithDescription[] = [
  { name: "Candela / Double Claro", description: "Bright Green" },
  { name: "Claro",                  description: "Pale Tan" },
  { name: "Colorado Claro",         description: "Light Brown / Natural" },
  { name: "Colorado",               description: "Medium Brown / Reddish" },
  { name: "Colorado Maduro",        description: "Dark Brown / Dark Natural" },
  { name: "Maduro",                 description: "Very Dark Brown / Oily" },
  { name: "Oscuro / Double Maduro", description: "Near Black / Jet Black" },
];

/* ------------------------------------------------------------------
   Wrapper varietals
   ------------------------------------------------------------------ */

/* Wrappers are surfaced in the AddCigar + SuggestEdit forms as
   plain name dropdowns — descriptions were dropped 2026-05-19 per
   Dave's call. Shape stays `string[]` so the dead description field
   doesn't accumulate. WRAPPER_COUNTRIES + SHADES keep their
   descriptions; their dropdowns still surface them. */
export const WRAPPERS: string[] = [
  "Habano",
  "Corojo",
  "Connecticut Shade",
  "Connecticut Broadleaf",
  "Sumatra",
  "Criollo",
  "Cameroon",
  "Honduran",
  "San Andrés Negro",
  "Mata Fina",
  "Arapiraca",
  "Pennsylvania Broadleaf",
  "Besuki / Java",
];

/* ------------------------------------------------------------------
   Wrapper countries / origins
   ------------------------------------------------------------------ */

export const WRAPPER_COUNTRIES: OptionWithDescription[] = [
  { name: "Nicaragua",          description: "Bold / Pepper" },
  { name: "Ecuador",            description: "Silky / Versatile" },
  { name: "Dominican Republic", description: "Smooth / Complex" },
  { name: "Mexico",             description: "Rich / Mineral" },
  { name: "Honduras",           description: "Woody / Robust" },
  { name: "USA",                description: "Cedar / Sweet" },
  { name: "Cameroon",           description: "Toasted / Aromatic" },
  { name: "Brazil",             description: "Zesty / Sweet" },
  { name: "Indonesia",          description: "Mild / Floral" },
  { name: "Cuba",               description: "Earthy / Traditional" },
  { name: "Costa Rica",         description: "Mild / Smooth" },
  { name: "Panama",             description: "Balanced / Refined" },
  { name: "Peru",               description: "Sweet / Earthy" },
  /* Added 2026-05-19 to cover the long tail of binder + filler
     origins in the catalog. Descriptions are short placeholder
     tasting hints; tune per Dave's editorial pass. */
  { name: "Philippines",        description: "Mild / Earthy" },
  { name: "Colombia",           description: "Mild / Sweet" },
  { name: "Italy",              description: "Bold / Toasted" },
  { name: "Paraguay",           description: "Sweet / Mild" },
  { name: "Zimbabwe",           description: "Robust / Earthy" },
  { name: "Spain",              description: "Mild / Sweet" },
];

/* ------------------------------------------------------------------
   Country code aliases.

   Some cigar_catalog rows still carry ISO codes ("NI", "DO") rather
   than the canonical dropdown names ("Nicaragua", "Dominican
   Republic"). The 2026-04-11 migrate-wrapper-country-leak.ts
   normalized wrapper_country only; binder_country + filler_countries
   were left behind. The 2026-05-19 SQL migration cleans the data;
   this map is the runtime safety net so any code that ever reaches
   client state (e.g. via a future ad-hoc SQL insert) is still
   rendered + edited as its canonical name.

   `canonicalCountry()` returns the canonical name for any input that
   matches a known code; otherwise returns the input unchanged. Safe
   to call on already-canonical values (no-op).

   Note: HVA is a one-off typo found in the catalog audit, mapped to
   Cuba (most likely "Havana" intent). US → USA matches the dropdown
   name (not `lib/country-name.ts`'s "United States" display form).
   ------------------------------------------------------------------ */

const COUNTRY_CODE_ALIASES: Record<string, string> = {
  NI:  "Nicaragua",
  DO:  "Dominican Republic",
  HN:  "Honduras",
  CU:  "Cuba",
  ID:  "Indonesia",
  EC:  "Ecuador",
  BR:  "Brazil",
  MX:  "Mexico",
  CR:  "Costa Rica",
  CM:  "Cameroon",
  PE:  "Peru",
  PA:  "Panama",
  US:  "USA",
  PH:  "Philippines",
  CO:  "Colombia",
  IT:  "Italy",
  PY:  "Paraguay",
  ZW:  "Zimbabwe",
  ES:  "Spain",
  HVA: "Cuba",
};

export function canonicalCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return COUNTRY_CODE_ALIASES[trimmed.toUpperCase()] ?? trimmed;
}

/* Apply canonicalCountry to every element of a string array, then
   dedupe while preserving first-seen order. Use for filler_countries
   pre-fill so a row like ["NI", "Nicaragua"] doesn't toggle as two
   distinct entries in the multi-select. */
export function canonicalCountryList(values: readonly string[] | null | undefined): string[] {
  if (!values || values.length === 0) return [];
  const seen = new Set<string>();
  const out:  string[] = [];
  for (const v of values) {
    const canonical = canonicalCountry(v);
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      out.push(canonical);
    }
  }
  return out;
}

/* ------------------------------------------------------------------
   Format / vitola — single flat list (per Dave's call: option 3)
   Combines parejo shapes and named vitolas into one selectable list.
   ------------------------------------------------------------------ */

export const FORMATS: string[] = [
  /* Shapes */
  "Parejo",
  "Torpedo",
  "Perfecto",
  "Piramide",
  "Belicoso",
  /* Named vitolas */
  "Corona",
  "Petit Corona",
  "Churchill",
  "Robusto",
  "Toro",
  "Corona Gorda",
  "Double Corona",
  "Panetela",
  "Lancero",
  "Lonsdale",
  "Grande",
  "Presidente",
  "Gran Corona",
  "Pyramid",
];

/* ------------------------------------------------------------------
   Lengths — display label + numeric inches
   DB stores `inches` (numeric); UI shows `label` (fraction).
   ------------------------------------------------------------------ */

export interface LengthOption {
  label:  string;
  inches: number;
}

export const LENGTHS: LengthOption[] = [
  { label: '4 1/2"', inches: 4.5    },
  { label: '4 7/8"', inches: 4.875  },
  { label: '5"',     inches: 5      },
  { label: '5 1/8"', inches: 5.125  },
  { label: '5 1/2"', inches: 5.5    },
  { label: '5 5/8"', inches: 5.625  },
  { label: '6"',     inches: 6      },
  { label: '6 1/8"', inches: 6.125  },
  { label: '6 1/4"', inches: 6.25   },
  { label: '6 1/2"', inches: 6.5    },
  { label: '7"',     inches: 7      },
  { label: '7 1/2"', inches: 7.5    },
  { label: '7 5/8"', inches: 7.625  },
  { label: '8"',     inches: 8      },
  { label: '9 1/4"', inches: 9.25   },
];

/* ------------------------------------------------------------------
   Ring gauges — numeric strings as labels, persisted as numbers.
   ------------------------------------------------------------------ */

export const RING_GAUGES: number[] = [
  26, 28, 30, 32, 34, 36, 38,
  40, 42, 44, 46, 47, 48, 49, 50, 52, 54,
  56, 58, 60, 64, 70, 80,
];

/* ------------------------------------------------------------------
   Helper — find a length option by stored numeric value, so the
   detail page can render "5 1/2\"" instead of "5.5".
   Returns the closest match within 0.01" tolerance, else null.
   ------------------------------------------------------------------ */

export function lengthLabelForInches(inches: number | null): string | null {
  if (inches == null) return null;
  const match = LENGTHS.find((o) => Math.abs(o.inches - inches) < 0.01);
  if (match) return match.label;
  /* Fall back to a sensible decimal -> fraction render for off-list values */
  return `${inches}"`;
}
