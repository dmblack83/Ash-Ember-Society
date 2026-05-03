/* ------------------------------------------------------------------
   Flavor tags — shared, cross-request cached

   The flavor_tags table is admin-managed reference data that almost
   never changes from end-user actions. It's read on six different
   server pages (burn-report flow, burn-reports list, lounge feed,
   stats, etc.) plus a few client components.

   Wrapping with `unstable_cache` means after the first hit the
   result is served from Vercel's per-region cache for up to 24 h —
   no Supabase round-trip for repeat reads. If/when admin edits the
   catalog, call `revalidateTag("flavor-tags")` from the mutation
   path and all cached entries refresh on next read.

   We use the anon client here because the data is public reference
   information — no per-user RLS, no authenticated context needed.
   ------------------------------------------------------------------ */

import { unstable_cache } from "next/cache";
import { createAnonClient } from "@/utils/supabase/anon";

export interface FlavorTag {
  id:       string;
  name:     string;
  category: string;
}

const SELECT_COLS = "id, name, category";

/* Full ordered list — used by the burn-report flow (Step 4 chips,
   verdict-card sentence) and most read pages. */
export const getFlavorTags = unstable_cache(
  async (): Promise<FlavorTag[]> => {
    const supabase = createAnonClient();
    const { data } = await supabase
      .from("flavor_tags")
      .select(SELECT_COLS)
      .order("category")
      .order("name");
    return (data ?? []) as FlavorTag[];
  },
  ["flavor-tags-all"],
  { tags: ["flavor-tags"], revalidate: 86400 },
);
