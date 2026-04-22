/**
 * Seed script — Cigar Images
 *
 * Searches Google Custom Search for each cigar in cigar_catalog,
 * downloads the top image result, uploads it to Supabase Storage
 * (cigar-photos bucket), and updates cigar_catalog.image_url.
 *
 * Usage:
 *   npx tsx scripts/seed-cigar-images.ts
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GOOGLE_API_KEY
 *   GOOGLE_SEARCH_ENGINE_ID
 *
 * Runs in batches of 10 with a 1s delay between batches to respect
 * Google's rate limits (100 free queries/day, then $5/1000).
 * Re-run the script to resume — already-imaged cigars are skipped.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const googleApiKey   = process.env.GOOGLE_API_KEY!;
const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID!;

if (!supabaseUrl || !serviceRoleKey || !googleApiKey || !searchEngineId) {
  console.error("Missing required environment variables.");
  console.error("Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_API_KEY, GOOGLE_SEARCH_ENGINE_ID");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const BATCH_SIZE  = 10;
const BATCH_DELAY = 1100; // ms between batches — stay under rate limits

/* ------------------------------------------------------------------
   Search Google for a cigar image
   ------------------------------------------------------------------ */

async function searchImage(query: string): Promise<string | null> {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key",  googleApiKey);
  url.searchParams.set("cx",   searchEngineId);
  url.searchParams.set("q",    query);
  url.searchParams.set("searchType", "image");
  url.searchParams.set("num",  "1");
  url.searchParams.set("imgType", "photo");
  url.searchParams.set("safe", "active");

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google API error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  const item = data.items?.[0];
  return item?.link ?? null;
}

/* ------------------------------------------------------------------
   Download image and upload to Supabase Storage
   ------------------------------------------------------------------ */

async function uploadImage(imageUrl: string, cigarId: string): Promise<string | null> {
  const res = await fetch(imageUrl);
  if (!res.ok) return null;

  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const ext = contentType.includes("png") ? "png"
            : contentType.includes("webp") ? "webp"
            : "jpg";

  const buffer = await res.arrayBuffer();
  const filePath = `cigars/${cigarId}.${ext}`;

  const { error } = await supabase.storage
    .from("cigar-photos")
    .upload(filePath, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data } = supabase.storage
    .from("cigar-photos")
    .getPublicUrl(filePath);

  return data.publicUrl;
}

/* ------------------------------------------------------------------
   Main
   ------------------------------------------------------------------ */

async function main() {
  // Fetch cigars that don't have an image yet
  const { data: cigars, error } = await supabase
    .from("cigar_catalog")
    .select("id, brand, series, format")
    .is("image_url", null)
    .order("usage_count", { ascending: false }) // Most used first
    .limit(1);

  if (error) {
    console.error("Failed to fetch cigars:", error.message);
    process.exit(1);
  }

  if (!cigars || cigars.length === 0) {
    console.log("All cigars already have images.");
    return;
  }

  console.log(`\nFound ${cigars.length} cigars without images.`);
  console.log(`Running in batches of ${BATCH_SIZE}.\n`);

  let success = 0;
  let skipped = 0;
  let failed  = 0;

  for (let i = 0; i < cigars.length; i += BATCH_SIZE) {
    const batch = cigars.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (cigar) => {
      const query = [cigar.brand, cigar.series, cigar.format, "cigar"]
        .filter(Boolean)
        .join(" ");

      try {
        const imageUrl = await searchImage(query);
        if (!imageUrl) {
          skipped++;
          process.stdout.write(`  -  [no result] ${cigar.brand} ${cigar.series}\n`);
          return;
        }

        const publicUrl = await uploadImage(imageUrl, cigar.id);
        if (!publicUrl) {
          skipped++;
          process.stdout.write(`  -  [upload fail] ${cigar.brand} ${cigar.series}\n`);
          return;
        }

        await supabase
          .from("cigar_catalog")
          .update({ image_url: publicUrl })
          .eq("id", cigar.id);

        success++;
        process.stdout.write(`  ✓  ${cigar.brand} ${cigar.series}\n`);
      } catch (err: any) {
        failed++;
        process.stdout.write(`  ✗  ${cigar.brand} ${cigar.series}: ${err.message}\n`);
      }
    }));

    const processed = Math.min(i + BATCH_SIZE, cigars.length);
    console.log(`\n  Progress: ${processed} / ${cigars.length} — ${success} saved, ${skipped} skipped, ${failed} errors\n`);

    // Delay between batches to respect rate limits
    if (i + BATCH_SIZE < cigars.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }
  }

  console.log(`\nDone. ${success} images saved, ${skipped} skipped, ${failed} errors.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
