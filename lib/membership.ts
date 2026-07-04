/**
 * Membership utilities
 *
 * Tiers (internal enum stays "free" | "member" | "premium" — the DB
 * enum still contains "premium"; the TypeScript type is kept for safe
 * reads. Any "premium" DB row is treated as "member" at runtime.
 *
 *   free    — 20 unique cigars, full lounge, unlimited burn reports
 *   member  — $5/mo, unlimited unique cigars, full lounge, unlimited burn reports
 */

import type { MembershipTier } from "@/lib/stripe";

export interface MembershipProfile {
  membership_tier:  MembershipTier | null;
  badge?:           string | null;
  assigned_badges?: string[] | null;
}

export type Feature =
  | "unlimited_humidor"
  | "community_posting"
  | "feed_read"
  | "burn_report"
  | "wishlist"
  | "stats"
  | "advanced_stats";

const FEATURE_TIER: Record<Feature, MembershipTier> = {
  feed_read:          "free",
  wishlist:           "free",
  burn_report:        "free",
  stats:              "free",
  unlimited_humidor:  "member",
  community_posting:  "free",
  advanced_stats:     "member",
};

const TIER_RANK: Record<MembershipTier, number> = {
  free:    0,
  member:  1,
  premium: 1, // premium is legacy — treated as member rank
};

export function getMembershipTier(profile: MembershipProfile | null): MembershipTier {
  const assigned = profile?.assigned_badges ?? [];
  if (assigned.includes("founder") || assigned.includes("beta_tester")) return "member";
  if (profile?.badge === "founder" || profile?.badge === "beta_tester") return "member";
  const tier = profile?.membership_tier ?? "free";
  // Treat legacy "premium" DB rows as "member" — premium tier removed 2026-05-26
  return tier === "premium" ? "member" : tier;
}

export function isPaidMember(profile: MembershipProfile | null): boolean {
  return getMembershipTier(profile) !== "free";
}

export function canAccess(profile: MembershipProfile | null, feature: Feature): boolean {
  const userRank     = TIER_RANK[getMembershipTier(profile)];
  const requiredRank = TIER_RANK[FEATURE_TIER[feature]];
  return userRank >= requiredRank;
}

export const FREE_TIER_LIMITS = {
  humidor_items: 20,
} as const;

export function isAtHumidorLimit(
  profile: MembershipProfile | null,
  currentItemCount: number
): boolean {
  if (isPaidMember(profile)) return false;
  return currentItemCount >= FREE_TIER_LIMITS.humidor_items;
}

export const TIER_DISPLAY: Record<MembershipTier, { label: string; color: string }> = {
  free:    { label: "Free",   color: "var(--muted-foreground)" },
  member:  { label: "Member", color: "var(--primary)" },
  premium: { label: "Member", color: "var(--primary)" }, // legacy alias
};

export const PLAN_PRICING = {
  member: {
    monthly: { cents: 500, label: "$5/month" },
  },
} as const;

export const TIER_DESCRIPTION: Record<MembershipTier, string> = {
  free:    "10 unique cigars, full lounge access, unlimited burn reports",
  member:  "Unlimited unique cigars, full lounge access, unlimited burn reports",
  premium: "Unlimited unique cigars, full lounge access, unlimited burn reports", // legacy alias
};
