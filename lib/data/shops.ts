/* ------------------------------------------------------------------
   Shops — public, cross-request cached

   The shops table is admin-managed (no end-user write path exists in
   the codebase as of this writing). It's read on:

   - Home page — total count badge for the LocalShops widget.
   - Discover → Shops page — ShopsPageClient does its own client-side
     fetch (out of scope here; client-side caching is a separate fix).

   Wrapping with `unstable_cache` means the count is served from
   Vercel's per-region cache for up to an hour — no Supabase round-
   trip on every home-page render. If shops mutate externally (admin
   edits via Supabase dashboard, seed scripts), the cache refreshes
   on its TTL. If/when an in-app shop admin UI ships, that mutation
   path should call `revalidateTag("shops")` to refresh immediately.

   Anon client used because the data is public — no per-user RLS.
   ------------------------------------------------------------------ */

import { unstable_cache } from "next/cache";
import { createAnonClient } from "@/utils/supabase/anon";

export const getShopCount = unstable_cache(
  async (): Promise<number> => {
    const supabase = createAnonClient();
    const { count } = await supabase
      .from("shops")
      .select("id", { count: "exact", head: true });
    return count ?? 0;
  },
  ["shops-count"],
  { tags: ["shops"], revalidate: 3600 },
);
