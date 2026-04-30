/**
 * Membership utilities
 *
 * Centralises all tier-based access logic so feature gates stay consistent
 * across server components, API routes, and client-side checks.
 *
 * Tiers:
 *   free    — default, limited to 25 humidor items, read-only feed
 *   member  — $4.99/mo or $50/yr — unlimited items, community posting
 *   premium — $9.99/mo or $100/yr — all Member features + future premium perks
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
  community_posting:  "member",
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
  if (profile?.badge === "founder") return "premium";
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

export const TIER_DISPLAY: Record<MembershipTier, { label: string; color: string }> = {
  free:    { label: "Free",    color: "var(--muted-foreground)" },
  member:  { label: "Member",  color: "var(--primary)" },
  premium: { label: "Premium", color: "var(--accent)" },
};

export const PLAN_PRICING = {
  member: {
    monthly: { cents: 499,   label: "$4.99/month"  },
    annual:  { cents: 5000,  label: "$50/year"      },
  },
  premium: {
    monthly: { cents: 999,   label: "$9.99/month"  },
    annual:  { cents: 10000, label: "$100/year"     },
  },
} as const;
