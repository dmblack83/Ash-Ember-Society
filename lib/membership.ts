/**
 * Membership utilities
 *
 * Centralises all tier-based access logic so feature gates stay consistent
 * across server components, API routes, and client-side checks.
 *
 * Tiers (internal enum stays "free" | "member" | "premium" — the
 * "member" enum value surfaces as "Standard" in the UI):
 *   free    — 10 unique cigars, 5 Burn Reports/month
 *   member  — $3.99/mo, 25 unique cigars, 15 Burn Reports/month (UI label: "Standard")
 *   premium — $6.99/mo, unlimited unique cigars, unlimited burn reports
 *
 * Enforcement of these limits is a planned follow-up; the
 * canAccess() and FEATURE_TIER tables below predate the new caps
 * and still gate on the old "5 humidor items" rule.
 */

import type { MembershipTier } from "@/lib/stripe";

/* ------------------------------------------------------------------
   Profile shape (subset — only the fields we need here)
   ------------------------------------------------------------------ */

export interface MembershipProfile {
  membership_tier: MembershipTier | null;
  badge?:          string | null;
}

/* ------------------------------------------------------------------
   Feature catalogue
   ------------------------------------------------------------------ */

export type Feature =
  | "unlimited_humidor"    // more than 25 humidor items
  | "community_posting"    // create posts / share to feed
  | "feed_read"            // read the community feed
  | "burn_report"          // file detailed burn reports
  | "wishlist"             // maintain a wishlist
  | "stats"                // view personal stats dashboard
  | "advanced_stats";      // future: deeper analytics (premium only)

/** Maps each feature to the minimum tier required. */
const FEATURE_TIER: Record<Feature, MembershipTier> = {
  feed_read:          "free",
  wishlist:           "free",
  burn_report:        "free",
  stats:              "free",
  unlimited_humidor:  "member",
  community_posting:  "free",
  advanced_stats:     "premium",
};

const TIER_RANK: Record<MembershipTier, number> = {
  free:    0,
  member:  1,
  premium: 2,
};

/* ------------------------------------------------------------------
   Core helpers
   ------------------------------------------------------------------ */

/**
 * Returns the user's current membership tier, defaulting to "free"
 * if the profile has no tier set (e.g. brand-new sign-up).
 */
export function getMembershipTier(profile: MembershipProfile | null): MembershipTier {
  if (profile?.badge === "founder" || profile?.badge === "beta_tester") return "premium";
  return profile?.membership_tier ?? "free";
}

/**
 * Returns true if the user has an active paid subscription
 * (member or premium).
 */
export function isPaidMember(profile: MembershipProfile | null): boolean {
  return getMembershipTier(profile) !== "free";
}

/**
 * Returns true if the user's tier grants access to the given feature.
 *
 * Example:
 *   canAccess(profile, "unlimited_humidor") // false on free tier
 *   canAccess(profile, "feed_read")         // true on all tiers
 */
export function canAccess(profile: MembershipProfile | null, feature: Feature): boolean {
  const userRank    = TIER_RANK[getMembershipTier(profile)];
  const requiredRank = TIER_RANK[FEATURE_TIER[feature]];
  return userRank >= requiredRank;
}

/* ------------------------------------------------------------------
   Free-tier limits
   ------------------------------------------------------------------ */

export const FREE_TIER_LIMITS = {
  /** Maximum number of humidor items (sum of quantities) on the free tier. */
  humidor_items: 25,
} as const;

/**
 * Returns true if a free-tier user has reached or exceeded the humidor limit.
 * Always returns false for paid members (no limit applies).
 */
export function isAtHumidorLimit(
  profile: MembershipProfile | null,
  currentItemCount: number
): boolean {
  if (isPaidMember(profile)) return false;
  return currentItemCount >= FREE_TIER_LIMITS.humidor_items;
}

/* ------------------------------------------------------------------
   Display helpers
   ------------------------------------------------------------------ */

/* TIER_DISPLAY surfaces tier names in the UI. Internal `member` enum
   value is displayed as "Standard" per the 2026-05-19 pricing update;
   keeping the internal enum stable avoids touching the DB enum,
   webhook mapping, and every canAccess() callsite (enforcement is
   a separate follow-up). */
export const TIER_DISPLAY: Record<MembershipTier, { label: string; color: string }> = {
  free:    { label: "Free",     color: "var(--muted-foreground)" },
  member:  { label: "Standard", color: "var(--primary)" },
  premium: { label: "Premium",  color: "var(--accent)" },
};

/* Monthly-only as of 2026-05-19; annual options were dropped along
   with the price update. If annual ships again, add back the
   `annual` branches and the AnnualToggle in MembershipTab. */
export const PLAN_PRICING = {
  member: {
    monthly: { cents: 399, label: "$3.99/month" },
  },
  premium: {
    monthly: { cents: 699, label: "$6.99/month" },
  },
} as const;

/* Short, single-line tier descriptions surfaced on each tier card.
   Mirror the descriptions Dave specified 2026-05-19. Enforcement of
   these limits is a planned follow-up. */
export const TIER_DESCRIPTION: Record<MembershipTier, string> = {
  free:    "10 unique cigars, 5 Burn Reports/month",
  member:  "25 unique cigars, 15 Burn Reports/month",
  premium: "Unlimited unique cigars, unlimited burn reports",
};
