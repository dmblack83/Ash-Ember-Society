/**
 * Seeds the Bad Hombre Cigars YouTube channel and syncs its first 5 videos.
 *
 * Run once after running the 20260426_content_channels.sql migration:
 *   npx ts-node scripts/seed-youtube-channel.ts
 */

import * as dotenv from "dotenv";
import * as path   from "path";

// Load .env.local from project root
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const BASE_URL    = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const SYNC_SECRET = process.env.SYNC_SECRET;
const HANDLE      = "BadHombre_Cigars";

async function main() {
  if (!SYNC_SECRET) {
    console.error("SYNC_SECRET not set in .env.local");
    process.exit(1);
  }

  console.log(`Seeding channel @${HANDLE} via sync route at ${BASE_URL}...`);

  const res = await fetch(
    `${BASE_URL}/api/youtube/sync?handle=${HANDLE}`,
    {
      method:  "POST",
      headers: { "x-sync-secret": SYNC_SECRET },
    }
  );

  const data = await res.json();

  if (!res.ok) {
    console.error("Sync failed:", data);
    process.exit(1);
  }

  console.log("Done:", data);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
