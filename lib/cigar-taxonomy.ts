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

export const WRAPPERS: OptionWithDescription[] = [
  { name: "Habano",                 description: "Spicy / Bold" },
  { name: "Corojo",                 description: "Peppery / Zesty" },
  { name: "Connecticut Shade",      description: "Mild / Creamy" },
  { name: "Connecticut Broadleaf",  description: "Sweet / Earthy" },
  { name: "Sumatra",                description: "Floral / Cinnamon" },
  { name: "Criollo",                description: "Nutty / Savory" },
  { name: "Cameroon",               description: "Toasted / Sweet" },
  { name: "San Andrés Negro",       description: "Chocolate / Espresso" },
  { name: "Mata Fina",              description: "Natural Sweetness" },
  { name: "Arapiraca",              description: "Tangy / Dark" },
  { name: "Pennsylvania Broadleaf", description: "Bold / Earthy" },
  { name: "Besuki / Java",          description: "Mild / Herbal" },
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
];

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
