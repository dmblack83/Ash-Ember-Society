/**
 * Seed script — Cigar Default Images
 *
 * Updates image_url on every cigar_catalog row where image_url is null,
 * using the wrapper field to pick a default SVG illustration.
 * Cigars with no wrapper match fall back to Colorado.svg.
 *
 * Usage:
 *   npx tsx scripts/seed-cigar-default-images.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

/* ------------------------------------------------------------------
   Wrapper → default image mapping
   ------------------------------------------------------------------ */

const WRAPPER_MAP: Record<string, string> = {
  "Connecticut":                        "/Cigar Default Images/Connecticut.svg",
  "Connecticut Shade":                  "/Cigar Default Images/Connecticut.svg",
  "Connecticut Desflorado":             "/Cigar Default Images/Connecticut.svg",
  "Conneticut":                         "/Cigar Default Images/Connecticut.svg",
  "Candela":                            "/Cigar Default Images/Connecticut.svg",
  "Claro":                              "/Cigar Default Images/Connecticut.svg",
  "Broadleaf Claro":                    "/Cigar Default Images/Connecticut.svg",
  "Criollo Claro":                      "/Cigar Default Images/Connecticut.svg",
  "H-2000 Candela":                     "/Cigar Default Images/Connecticut.svg",
  "Habano Candela":                     "/Cigar Default Images/Connecticut.svg",
  "Shade":                              "/Cigar Default Images/Connecticut.svg",
  "Corojo Shade":                       "/Cigar Default Images/Connecticut.svg",
  "H-2000 Shade":                       "/Cigar Default Images/Connecticut.svg",
  "Yamasa Shade":                       "/Cigar Default Images/Connecticut.svg",
  "Havana Seed CT 142":                 "/Cigar Default Images/Connecticut.svg",
  "Connecticut Colorado":               "/Cigar Default Images/Colorado Clairo.svg",
  "Connecticut Sungrown":               "/Cigar Default Images/Colorado Clairo.svg",
  "Connecticut Broadleaf":              "/Cigar Default Images/Colorado Clairo.svg",
  "Corojo Rosado":                      "/Cigar Default Images/Colorado Clairo.svg",
  "Habano Rosado":                      "/Cigar Default Images/Colorado Clairo.svg",
  "H-2000 Rosado":                      "/Cigar Default Images/Colorado Clairo.svg",
  "San Andres Rosado":                  "/Cigar Default Images/Colorado Clairo.svg",
  "Rosado":                             "/Cigar Default Images/Colorado Clairo.svg",
  "Rosado habano":                      "/Cigar Default Images/Colorado Clairo.svg",
  "Sun Grown":                          "/Cigar Default Images/Colorado Clairo.svg",
  "Sungrown":                           "/Cigar Default Images/Colorado Clairo.svg",
  "Sungrown Corojo":                    "/Cigar Default Images/Colorado Clairo.svg",
  "Sun Grown H-2000":                   "/Cigar Default Images/Colorado Clairo.svg",
  "Florida Sun Grown":                  "/Cigar Default Images/Colorado Clairo.svg",
  "H 2000 Sungrown":                    "/Cigar Default Images/Colorado Clairo.svg",
  "H-2000 Sungrown":                    "/Cigar Default Images/Colorado Clairo.svg",
  "Sumatra":                            "/Cigar Default Images/Colorado Clairo.svg",
  "Sumatra Sun Grown":                  "/Cigar Default Images/Colorado Clairo.svg",
  "Sumatra Sungrown":                   "/Cigar Default Images/Colorado Clairo.svg",
  "Arapiraca Sungrown":                 "/Cigar Default Images/Colorado Clairo.svg",
  "Jamao":                              "/Cigar Default Images/Colorado Clairo.svg",
  "Colorado":                           "/Cigar Default Images/Colorado.svg",
  "Corojo":                             "/Cigar Default Images/Colorado.svg",
  "Corojo Colorado":                    "/Cigar Default Images/Colorado.svg",
  "Corojo Sungrown":                    "/Cigar Default Images/Colorado.svg",
  "Habano":                             "/Cigar Default Images/Colorado.svg",
  "Habano Sun Grown":                   "/Cigar Default Images/Colorado.svg",
  "Habano Sungrown":                    "/Cigar Default Images/Colorado.svg",
  "Criollo":                            "/Cigar Default Images/Colorado.svg",
  "Criollo 98":                         "/Cigar Default Images/Colorado.svg",
  "Cuban-Seed":                         "/Cigar Default Images/Colorado.svg",
  "Cameroon":                           "/Cigar Default Images/Colorado.svg",
  "Arapiraca":                          "/Cigar Default Images/Colorado.svg",
  "Besuki":                             "/Cigar Default Images/Colorado.svg",
  "H-2000":                             "/Cigar Default Images/Colorado.svg",
  "H 2000":                             "/Cigar Default Images/Colorado.svg",
  "H-2000 Colorado":                    "/Cigar Default Images/Colorado.svg",
  "H-2000  Colorado":                   "/Cigar Default Images/Colorado.svg",
  "H-2000 Criollo":                     "/Cigar Default Images/Colorado.svg",
  "San Andres":                         "/Cigar Default Images/Colorado.svg",
  "San Andres Colorado":                "/Cigar Default Images/Colorado.svg",
  "San Andres Criollo":                 "/Cigar Default Images/Colorado.svg",
  "San Andres Sun Grown":               "/Cigar Default Images/Colorado.svg",
  "San Andrés":                         "/Cigar Default Images/Colorado.svg",
  "Meerapfel":                          "/Cigar Default Images/Colorado.svg",
  "Jalapa":                             "/Cigar Default Images/Colorado.svg",
  "Jamastran":                          "/Cigar Default Images/Colorado.svg",
  "Cibao Valley Corojo":                "/Cigar Default Images/Colorado.svg",
  "Cotuí":                              "/Cigar Default Images/Colorado.svg",
  "Cubra":                              "/Cigar Default Images/Colorado.svg",
  "Yamasa":                             "/Cigar Default Images/Colorado.svg",
  "Maduro":                             "/Cigar Default Images/Maduro.svg",
  "Connecticut Maduro":                 "/Cigar Default Images/Maduro.svg",
  "Connecticut Broadleaf Maduro":       "/Cigar Default Images/Maduro.svg",
  "Broadleaf Maduro":                   "/Cigar Default Images/Maduro.svg",
  "Broadleaf":                          "/Cigar Default Images/Maduro.svg",
  "Corojo Maduro":                      "/Cigar Default Images/Maduro.svg",
  "Criollo Maduro":                     "/Cigar Default Images/Maduro.svg",
  "H-2000 Maduro":                      "/Cigar Default Images/Maduro.svg",
  "H-2000 Dark":                        "/Cigar Default Images/Maduro.svg",
  "San Andres Maduro":                  "/Cigar Default Images/Maduro.svg",
  "San Andres Negro":                   "/Cigar Default Images/Maduro.svg",
  "San Andres Sun Grown Maduro":        "/Cigar Default Images/Maduro.svg",
  "San Andrés Maduro":                  "/Cigar Default Images/Maduro.svg",
  "Sumatra Maduro":                     "/Cigar Default Images/Maduro.svg",
  "Maduro San Andres":                  "/Cigar Default Images/Maduro.svg",
  "Arapiraca Maduro":                   "/Cigar Default Images/Maduro.svg",
  "Besuki Maduro":                      "/Cigar Default Images/Maduro.svg",
  "Mata Fina":                          "/Cigar Default Images/Maduro.svg",
  "Matafina":                           "/Cigar Default Images/Maduro.svg",
  "Pennsylvania Broadleaf":             "/Cigar Default Images/Maduro.svg",
  "Pennsylvania Broadleaf Maduro":      "/Cigar Default Images/Maduro.svg",
  "Habano Maduro":                      "/Cigar Default Images/Maduro.svg",
  "Oscuro":                             "/Cigar Default Images/Oscuro.svg",
  "Corojo Oscuro":                      "/Cigar Default Images/Oscuro.svg",
  "Criollo Oscuro":                     "/Cigar Default Images/Oscuro.svg",
  "H-2000 Oscuro":                      "/Cigar Default Images/Oscuro.svg",
  "Habano Oscuro":                      "/Cigar Default Images/Oscuro.svg",
  "San Andres Oscuro":                  "/Cigar Default Images/Oscuro.svg",
  "Sumatra Oscuro":                     "/Cigar Default Images/Oscuro.svg",
  "Sun Grown Oscuro":                   "/Cigar Default Images/Oscuro.svg",
  "Medio Tiempo":                       "/Cigar Default Images/Oscuro.svg",
  "Kentucky":                           "/Cigar Default Images/Oscuro.svg",
  "Negrito":                            "/Cigar Default Images/Oscuro.svg",
  "Arapiraca Fumo de Corda":            "/Cigar Default Images/Oscuro.svg",
};

const DEFAULT_IMAGE = "/Cigar Default Images/Colorado.svg";
const BATCH_SIZE    = 500;

/* ------------------------------------------------------------------
   Main
   ------------------------------------------------------------------ */

async function main() {
  console.log("Fetching cigars with no image_url...");

  // Fetch all rows missing an image in a single paginated pass
  const rows: { id: string; wrapper: string | null }[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("cigar_catalog")
      .select("id, wrapper")
      .is("image_url", null)
      .range(offset, offset + 999);

    if (error) {
      console.error("Fetch error:", error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  console.log(`Found ${rows.length} cigars with no image_url.`);
  if (rows.length === 0) {
    console.log("Nothing to update.");
    return;
  }

  // Resolve each row to an image path
  let mapped   = 0;
  let fallback = 0;

  const updates: { id: string; image_url: string }[] = rows.map((row) => {
    const wrapper   = row.wrapper?.trim() ?? null;
    const image_url = (wrapper && WRAPPER_MAP[wrapper]) ? WRAPPER_MAP[wrapper] : DEFAULT_IMAGE;

    if (wrapper && WRAPPER_MAP[wrapper]) {
      mapped++;
    } else {
      fallback++;
      if (wrapper) {
        // Log unmapped wrapper values so they can be added to the map later
        console.log(`  [fallback] wrapper="${wrapper}"`);
      }
    }

    return { id: row.id, image_url };
  });

  // Update in batches of BATCH_SIZE
  let updated = 0;

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const batchNum   = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(updates.length / BATCH_SIZE);

    process.stdout.write(
      `  Batch ${batchNum}/${totalBatches} (${batch.length} rows)... `
    );

    // Update image_url for each id in the batch
    // Group by image_url so we can update multiple rows per query
    const byImage: Record<string, string[]> = {};
    for (const row of batch) {
      if (!byImage[row.image_url]) byImage[row.image_url] = [];
      byImage[row.image_url].push(row.id);
    }

    let error: { message: string } | null = null;
    for (const [url, rowIds] of Object.entries(byImage)) {
      const { error: err } = await supabase
        .from("cigar_catalog")
        .update({ image_url: url })
        .in("id", rowIds);
      if (err) { error = err; break; }
    }

    if (error) {
      console.error(`\nBatch ${batchNum} failed:`, error.message);
      process.exit(1);
    }

    updated += batch.length;
    console.log("done.");
  }

  console.log("\n--- Summary ---");
  console.log(`Total processed : ${rows.length}`);
  console.log(`Wrapper matched : ${mapped}`);
  console.log(`Fallback used   : ${fallback}`);
  console.log(`Updated         : ${updated}`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
