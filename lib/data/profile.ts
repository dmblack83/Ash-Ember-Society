import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import type { MembershipTier } from "@/lib/stripe";

/*
 * Shared, request-scoped profile fetcher.
 *
 * The dashboard splits into Suspense islands that each need a few
 * profile fields (UserHeader needs display_name + tier + memberSince,
 * QuickActions needs is_admin, SmokingConditions needs city). Without
 * a shared fetcher each island would issue its own Supabase round-trip
 * during a single page render — N redundant queries.
 *
 * React's `cache()` memoizes by argument identity for the lifetime of
 * one server request. All callers of `getProfileLite(userId)` with the
 * same id during the same render share one query result. The cache is
 * cleared automatically between requests, so updates (rename, badge
 * change, city change) are reflected on the next page load.
 *
 * The select projection is intentionally generous (covers the union
 * of every island's needs). If an island needs more columns than
 * listed here, add them — don't fork a separate fetcher.
 */

export interface ProfileLite {
  display_name:    string | null;
  membership_tier: MembershipTier | null;
  badge:           string | null;
  created_at:      string | null;
  city:            string | null;
  is_admin:        boolean | null;
}

const SELECT_COLS =
  "display_name, membership_tier, badge, created_at, city, is_admin";

export const getProfileLite = cache(
  async (userId: string): Promise<ProfileLite | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select(SELECT_COLS)
      .eq("id", userId)
      .single();
    return (data as ProfileLite) ?? null;
  },
);
