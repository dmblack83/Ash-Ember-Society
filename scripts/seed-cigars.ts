/*
 * Seed script — inserts 50 popular cigars into the `cigars` table.
 *
 * Usage:
 *   npx tsx scripts/seed-cigars.ts
 *
 * Required environment variables (in .env.local or exported in your shell):
 *   NEXT_PUBLIC_SUPABASE_URL      — your Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY     — service-role key (bypasses RLS for seeding)
 *
 * Install tsx if needed:
 *   npm install -D tsx
 *
 * The script reads .env.local automatically — no extra dotenv package needed.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------
   Load .env.local without requiring dotenv as a dependency
   ------------------------------------------------------------------ */
try {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
} catch {
  // .env.local not found — rely on already-exported env vars
}

/* ------------------------------------------------------------------
   Validate env vars
   ------------------------------------------------------------------ */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

/* ------------------------------------------------------------------
   Cigar data
   ------------------------------------------------------------------ */

type Strength = "mild" | "mild_medium" | "medium" | "medium_full" | "full";

interface CigarSeed {
  brand: string;
  line: string;
  name: string;
  vitola: string;
  wrapper: string;
  binder: string;
  filler: string;
  country: string;
  strength: Strength;
  ring_gauge: number;
  length_inches: number;
  is_verified: boolean;
}

const cigars: CigarSeed[] = [
  /* ── Arturo Fuente — Dominican Republic ─────────────────────── */
  {
    brand: "Arturo Fuente",
    line: "Opus X",
    name: "Robusto",
    vitola: "Robusto",
    wrapper: "Ecuador Rosado",
    binder: "Dominican",
    filler: "Dominican",
    country: "Dominican Republic",
    strength: "full",
    ring_gauge: 52,
    length_inches: 5.0,
    is_verified: true,
  },
  {
    brand: "Arturo Fuente",
    line: "Opus X",
    name: "Perfecxion X",
    vitola: "Perfecto",
    wrapper: "Ecuador Rosado",
    binder: "Dominican",
    filler: "Dominican",
    country: "Dominican Republic",
    strength: "full",
    ring_gauge: 52,
    length_inches: 5.25,
    is_verified: true,
  },
  {
    brand: "Arturo Fuente",
    line: "Hemingway",
    name: "Short Story",
    vitola: "Perfecto",
    wrapper: "Cameroon",
    binder: "Dominican",
    filler: "Dominican",
    country: "Dominican Republic",
    strength: "medium",
    ring_gauge: 49,
    length_inches: 4.0,
    is_verified: true,
  },
  {
    brand: "Arturo Fuente",
    line: "Hemingway",
    name: "Classic",
    vitola: "Figurado",
    wrapper: "Cameroon",
    binder: "Dominican",
    filler: "Dominican",
    country: "Dominican Republic",
    strength: "medium",
    ring_gauge: 52,
    length_inches: 7.0,
    is_verified: true,
  },
  {
    brand: "Arturo Fuente",
    line: "Don Carlos",
    name: "Robusto",
    vitola: "Robusto",
    wrapper: "African Cameroon",
    binder: "Dominican",
    filler: "Dominican",
    country: "Dominican Republic",
    strength: "medium_full",
    ring_gauge: 50,
    length_inches: 5.0,
    is_verified: true,
  },

  /* ── Padron — Nicaragua ──────────────────────────────────────── */
  {
    brand: "Padron",
    line: "1926 Serie",
    name: "No. 1 Natural",
    vitola: "Churchill",
    wrapper: "Nicaragua",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "full",
    ring_gauge: 54,
    length_inches: 6.25,
    is_verified: true,
  },
  {
    brand: "Padron",
    line: "1926 Serie",
    name: "No. 35 Natural",
    vitola: "Robusto",
    wrapper: "Nicaragua",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "full",
    ring_gauge: 46,
    length_inches: 4.5,
    is_verified: true,
  },
  {
    brand: "Padron",
    line: "1964 Anniversary",
    name: "Robusto Natural",
    vitola: "Robusto",
    wrapper: "Nicaragua",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "medium_full",
    ring_gauge: 50,
    length_inches: 5.0,
    is_verified: true,
  },
  {
    brand: "Padron",
    line: "1964 Anniversary",
    name: "Pyramid Natural",
    vitola: "Pyramid",
    wrapper: "Nicaragua",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "medium_full",
    ring_gauge: 56,
    length_inches: 6.5,
    is_verified: true,
  },
  {
    brand: "Padron",
    line: "Family Reserve",
    name: "No. 45 Natural",
    vitola: "Toro",
    wrapper: "Nicaragua",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "full",
    ring_gauge: 56,
    length_inches: 5.5,
    is_verified: true,
  },

  /* ── Oliva — Nicaragua ───────────────────────────────────────── */
  {
    brand: "Oliva",
    line: "Serie V",
    name: "Robusto",
    vitola: "Robusto",
    wrapper: "Nicaragua",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "full",
    ring_gauge: 50,
    length_inches: 5.0,
    is_verified: true,
  },
  {
    brand: "Oliva",
    line: "Serie V",
    name: "Torpedo",
    vitola: "Torpedo",
    wrapper: "Nicaragua",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "full",
    ring_gauge: 54,
    length_inches: 6.5,
    is_verified: true,
  },
  {
    brand: "Oliva",
    line: "Serie G",
    name: "Robusto",
    vitola: "Robusto",
    wrapper: "Ecuador",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "medium",
    ring_gauge: 50,
    length_inches: 5.0,
    is_verified: true,
  },
  {
    brand: "Oliva",
    line: "Serie G",
    name: "Churchill",
    vitola: "Churchill",
    wrapper: "Ecuador",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "medium",
    ring_gauge: 50,
    length_inches: 7.0,
    is_verified: true,
  },
  {
    brand: "Oliva",
    line: "Master Blends 3",
    name: "Robusto",
    vitola: "Robusto",
    wrapper: "Ecuador",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "medium_full",
    ring_gauge: 50,
    length_inches: 5.0,
    is_verified: true,
  },

  /* ── My Father — Nicaragua ───────────────────────────────────── */
  {
    brand: "My Father",
    line: "Le Bijou 1922",
    name: "Robusto",
    vitola: "Robusto",
    wrapper: "Ecuador Habano",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "full",
    ring_gauge: 52,
    length_inches: 5.0,
    is_verified: true,
  },
  {
    brand: "My Father",
    line: "Le Bijou 1922",
    name: "Torpedo",
    vitola: "Torpedo",
    wrapper: "Ecuador Habano",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "full",
    ring_gauge: 54,
    length_inches: 6.0,
    is_verified: true,
  },
  {
    brand: "My Father",
    line: "The Judge",
    name: "Toro",
    vitola: "Toro",
    wrapper: "Ecuador Habano",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "full",
    ring_gauge: 57,
    length_inches: 6.25,
    is_verified: true,
  },
  {
    brand: "My Father",
    line: "The Judge",
    name: "Short Robusto",
    vitola: "Robusto",
    wrapper: "Ecuador Habano",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "full",
    ring_gauge: 57,
    length_inches: 4.5,
    is_verified: true,
  },
  {
    brand: "My Father",
    line: "Flor de las Antillas",
    name: "Robusto",
    vitola: "Robusto",
    wrapper: "Ecuador",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "medium_full",
    ring_gauge: 52,
    length_inches: 5.0,
    is_verified: true,
  },

  /* ── Drew Estate — Nicaragua ─────────────────────────────────── */
  {
    brand: "Drew Estate",
    line: "Liga Privada No. 9",
    name: "Robusto",
    vitola: "Robusto",
    wrapper: "Connecticut Broadleaf",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "full",
    ring_gauge: 50,
    length_inches: 5.0,
    is_verified: true,
  },
  {
    brand: "Drew Estate",
    line: "Liga Privada No. 9",
    name: "Toro",
    vitola: "Toro",
    wrapper: "Connecticut Broadleaf",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "full",
    ring_gauge: 50,
    length_inches: 6.0,
    is_verified: true,
  },
  {
    brand: "Drew Estate",
    line: "Liga Privada T52",
    name: "Robusto",
    vitola: "Robusto",
    wrapper: "Connecticut Broadleaf",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "full",
    ring_gauge: 52,
    length_inches: 5.0,
    is_verified: true,
  },
  {
    brand: "Drew Estate",
    line: "Liga Privada T52",
    name: "Belicoso",
    vitola: "Belicoso",
    wrapper: "Connecticut Broadleaf",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "full",
    ring_gauge: 52,
    length_inches: 6.5,
    is_verified: true,
  },
  {
    brand: "Drew Estate",
    line: "Undercrown",
    name: "Robusto",
    vitola: "Robusto",
    wrapper: "Connecticut Broadleaf",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "medium_full",
    ring_gauge: 54,
    length_inches: 5.0,
    is_verified: true,
  },

  /* ── Ashton — Dominican Republic ─────────────────────────────── */
  {
    brand: "Ashton",
    line: "VSG",
    name: "Robusto",
    vitola: "Robusto",
    wrapper: "Ecuador Sumatra",
    binder: "Dominican",
    filler: "Dominican",
    country: "Dominican Republic",
    strength: "full",
    ring_gauge: 50,
    length_inches: 5.0,
    is_verified: true,
  },
  {
    brand: "Ashton",
    line: "VSG",
    name: "Torpedo",
    vitola: "Torpedo",
    wrapper: "Ecuador Sumatra",
    binder: "Dominican",
    filler: "Dominican",
    country: "Dominican Republic",
    strength: "full",
    ring_gauge: 52,
    length_inches: 6.25,
    is_verified: true,
  },
  {
    brand: "Ashton",
    line: "VSG",
    name: "Pegasus",
    vitola: "Churchill",
    wrapper: "Ecuador Sumatra",
    binder: "Dominican",
    filler: "Dominican",
    country: "Dominican Republic",
    strength: "full",
    ring_gauge: 54,
    length_inches: 7.0,
    is_verified: true,
  },
  {
    brand: "Ashton",
    line: "Cabinet Selection",
    name: "No. 2",
    vitola: "Lonsdale",
    wrapper: "Ecuador Connecticut",
    binder: "Dominican",
    filler: "Dominican",
    country: "Dominican Republic",
    strength: "mild_medium",
    ring_gauge: 44,
    length_inches: 6.75,
    is_verified: true,
  },
  {
    brand: "Ashton",
    line: "Cabinet Selection",
    name: "Belicoso",
    vitola: "Belicoso",
    wrapper: "Ecuador Connecticut",
    binder: "Dominican",
    filler: "Dominican",
    country: "Dominican Republic",
    strength: "mild_medium",
    ring_gauge: 52,
    length_inches: 6.0,
    is_verified: true,
  },

  /* ── Rocky Patel — Honduras ──────────────────────────────────── */
  {
    brand: "Rocky Patel",
    line: "Decade",
    name: "Robusto",
    vitola: "Robusto",
    wrapper: "Ecuador Sumatra",
    binder: "Honduras",
    filler: "Nicaragua/Honduras",
    country: "Honduras",
    strength: "full",
    ring_gauge: 50,
    length_inches: 5.0,
    is_verified: true,
  },
  {
    brand: "Rocky Patel",
    line: "Decade",
    name: "Toro",
    vitola: "Toro",
    wrapper: "Ecuador Sumatra",
    binder: "Honduras",
    filler: "Nicaragua/Honduras",
    country: "Honduras",
    strength: "full",
    ring_gauge: 54,
    length_inches: 6.0,
    is_verified: true,
  },
  {
    brand: "Rocky Patel",
    line: "Decade",
    name: "Churchill",
    vitola: "Churchill",
    wrapper: "Ecuador Sumatra",
    binder: "Honduras",
    filler: "Nicaragua/Honduras",
    country: "Honduras",
    strength: "full",
    ring_gauge: 50,
    length_inches: 7.0,
    is_verified: true,
  },
  {
    brand: "Rocky Patel",
    line: "Vintage 1990",
    name: "Robusto",
    vitola: "Robusto",
    wrapper: "Ecuador Connecticut",
    binder: "Honduras",
    filler: "Nicaragua/Honduras",
    country: "Honduras",
    strength: "medium",
    ring_gauge: 50,
    length_inches: 5.0,
    is_verified: true,
  },
  {
    brand: "Rocky Patel",
    line: "Vintage 1990",
    name: "Toro",
    vitola: "Toro",
    wrapper: "Ecuador Connecticut",
    binder: "Honduras",
    filler: "Nicaragua/Honduras",
    country: "Honduras",
    strength: "medium",
    ring_gauge: 54,
    length_inches: 6.0,
    is_verified: true,
  },

  /* ── Davidoff — Dominican Republic ───────────────────────────── */
  {
    brand: "Davidoff",
    line: "Grand Cru",
    name: "No. 2",
    vitola: "Corona",
    wrapper: "Ecuador Connecticut",
    binder: "Dominican",
    filler: "Dominican",
    country: "Dominican Republic",
    strength: "mild",
    ring_gauge: 43,
    length_inches: 5.5,
    is_verified: true,
  },
  {
    brand: "Davidoff",
    line: "Grand Cru",
    name: "No. 3",
    vitola: "Corona",
    wrapper: "Ecuador Connecticut",
    binder: "Dominican",
    filler: "Dominican",
    country: "Dominican Republic",
    strength: "mild",
    ring_gauge: 43,
    length_inches: 4.5,
    is_verified: true,
  },
  {
    brand: "Davidoff",
    line: "Grand Cru",
    name: "Robusto",
    vitola: "Robusto",
    wrapper: "Ecuador Connecticut",
    binder: "Dominican",
    filler: "Dominican",
    country: "Dominican Republic",
    strength: "mild",
    ring_gauge: 50,
    length_inches: 5.0,
    is_verified: true,
  },
  {
    brand: "Davidoff",
    line: "Late Hour",
    name: "Robusto",
    vitola: "Robusto",
    wrapper: "Ecuador Habano",
    binder: "Dominican",
    filler: "Dominican",
    country: "Dominican Republic",
    strength: "medium_full",
    ring_gauge: 50,
    length_inches: 5.0,
    is_verified: true,
  },
  {
    brand: "Davidoff",
    line: "Late Hour",
    name: "Toro",
    vitola: "Toro",
    wrapper: "Ecuador Habano",
    binder: "Dominican",
    filler: "Dominican",
    country: "Dominican Republic",
    strength: "medium_full",
    ring_gauge: 52,
    length_inches: 6.0,
    is_verified: true,
  },

  /* ── CAO — Honduras ──────────────────────────────────────────── */
  {
    brand: "CAO",
    line: "Flathead",
    name: "V660 Carb",
    vitola: "Toro",
    wrapper: "Pennsylvania Broadleaf",
    binder: "Honduras",
    filler: "Nicaragua",
    country: "Honduras",
    strength: "full",
    ring_gauge: 60,
    length_inches: 6.0,
    is_verified: true,
  },
  {
    brand: "CAO",
    line: "Flathead",
    name: "V554 Steel Mill",
    vitola: "Toro",
    wrapper: "Pennsylvania Broadleaf",
    binder: "Honduras",
    filler: "Nicaragua",
    country: "Honduras",
    strength: "full",
    ring_gauge: 54,
    length_inches: 5.5,
    is_verified: true,
  },
  {
    brand: "CAO",
    line: "Flathead",
    name: "V770 Camshaft",
    vitola: "Churchill",
    wrapper: "Pennsylvania Broadleaf",
    binder: "Honduras",
    filler: "Nicaragua",
    country: "Honduras",
    strength: "full",
    ring_gauge: 70,
    length_inches: 7.0,
    is_verified: true,
  },
  {
    brand: "CAO",
    line: "Brazilia",
    name: "Gol!",
    vitola: "Gordo",
    wrapper: "Brazil",
    binder: "Honduras",
    filler: "Nicaragua",
    country: "Honduras",
    strength: "medium",
    ring_gauge: 60,
    length_inches: 5.25,
    is_verified: true,
  },
  {
    brand: "CAO",
    line: "Brazilia",
    name: "Piranha",
    vitola: "Toro",
    wrapper: "Brazil",
    binder: "Honduras",
    filler: "Nicaragua",
    country: "Honduras",
    strength: "medium",
    ring_gauge: 60,
    length_inches: 6.0,
    is_verified: true,
  },

  /* ── Perdomo — Nicaragua ─────────────────────────────────────── */
  {
    brand: "Perdomo",
    line: "Lot 23",
    name: "Robusto",
    vitola: "Robusto",
    wrapper: "Ecuador Connecticut",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "medium",
    ring_gauge: 50,
    length_inches: 5.0,
    is_verified: true,
  },
  {
    brand: "Perdomo",
    line: "Lot 23",
    name: "Churchill",
    vitola: "Churchill",
    wrapper: "Ecuador Connecticut",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "medium",
    ring_gauge: 48,
    length_inches: 7.0,
    is_verified: true,
  },
  {
    brand: "Perdomo",
    line: "10th Anniversary Champagne",
    name: "Robusto",
    vitola: "Robusto",
    wrapper: "Ecuador Connecticut",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "medium_full",
    ring_gauge: 54,
    length_inches: 5.0,
    is_verified: true,
  },
  {
    brand: "Perdomo",
    line: "10th Anniversary Sun Grown",
    name: "Robusto",
    vitola: "Robusto",
    wrapper: "Nicaragua",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "full",
    ring_gauge: 54,
    length_inches: 5.0,
    is_verified: true,
  },
  {
    brand: "Perdomo",
    line: "10th Anniversary Maduro",
    name: "Robusto",
    vitola: "Robusto",
    wrapper: "Nicaragua Maduro",
    binder: "Nicaragua",
    filler: "Nicaragua",
    country: "Nicaragua",
    strength: "full",
    ring_gauge: 54,
    length_inches: 5.0,
    is_verified: true,
  },
];

/* ------------------------------------------------------------------
   Run seed
   ------------------------------------------------------------------ */

async function seed() {
  console.log(`Seeding ${cigars.length} cigars…`);

  // Clear existing rows so the script is safe to re-run
  const { error: deleteError } = await supabase
    .from("cigars")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // delete all rows

  if (deleteError) {
    console.error("Failed to clear table:", deleteError.message);
    process.exit(1);
  }

  const { data, error } = await supabase
    .from("cigars")
    .insert(cigars)
    .select("id, brand, line, name");

  if (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }

  console.log(`✓ Inserted ${data?.length ?? 0} cigars`);

  if (data) {
    for (const row of data) {
      console.log(`  • [${row.id}] ${row.brand} — ${row.line} ${row.name}`);
    }
  }
}

seed();
