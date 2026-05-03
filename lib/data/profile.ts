/* ------------------------------------------------------------------
   Profile fetch — shared, request-deduped

   Many server components on the same render fetch the current user's
   profile (display_name, city, badge, membership_tier). Without a
   shared cached fetcher, each component issues its own Supabase
   round-trip — N redundant queries per page render.

   React's `cache()` memoizes by argument identity within a single
   request lifetime (server component tree render). All callers of
   `getProfileLite(userId)` with the same userId on the same request
   share one query result. Cleared automatically between requests.

   The select projection is intentionally generous (covers the union
   of every page's actual needs) so the dedup wins outweigh the few
   extra bytes of unused columns. If a caller needs MORE columns than
   are listed here, add them — don't fork a separate fetcher.

   Cross-request caching is NOT used here on purpose: profile data
   changes via user action (rename, badge update, city change) and
   should be fresh on the next request. unstable_cache + revalidateTag
   would work but adds complexity for a single-row lookup.
   ------------------------------------------------------------------ */

import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import type { MembershipTier } from "@/lib/stripe";

export interface ProfileLite {
  display_name:    string | null;
  first_name:      string | null;
  city:            string | null;
  badge:           string | null;
  membership_tier: MembershipTier | null;
  is_admin:        boolean | null;
}

export const getProfileLite = cache(async (userId: string): Promise<ProfileLite | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_name, first_name, city, badge, membership_tier, is_admin")
    .eq("id", userId)
    .single();
  return data ?? null;
});
