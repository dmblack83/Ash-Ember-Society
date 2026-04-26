/**
 * Badge frame types for user avatars.
 *
 * "member" and "premium" activate automatically from membership_tier unless
 * the user has explicitly selected a different badge via the badge column.
 *
 * Database badge column values:
 *   null              → use tier default (member frame for member, premium frame for premium, none for free)
 *   'none'            → user explicitly hid their badge
 *   'member'          → user explicitly chose member frame (premium users downgrading display)
 *   'premium'         → user explicitly chose premium frame (same as null for premium users)
 *   'beta_tester'     → admin-assigned special role
 *   'top_contributor' → admin-assigned special role
 *   'moderator'       → admin-assigned special role
 *   'partner'         → admin-assigned special role
 *   'founder'         → admin-assigned special role (Dave's account only)
 */

export type BadgeType =
  | "beta_tester"
  | "member"
  | "premium"
  | "top_contributor"
  | "moderator"
  | "partner"
  | "founder"
  | null;

export const BADGE_LABELS: Record<string, string> = {
  beta_tester:     "Beta Tester",
  member:          "Member",
  premium:         "Premium",
  top_contributor: "Top Contributor",
  moderator:       "Moderator",
  partner:         "Partner",
  founder:         "Founder",
};

/**
 * Resolves which badge frame to display for a user.
 * 'none' stored in the badge column → returns null (no frame).
 * An explicit badge column value overrides the tier default.
 */
export function resolveBadge(
  badge: string | null | undefined,
  tier:  string | null | undefined,
): BadgeType {
  if (badge === "none") return null;
  if (badge) return badge as BadgeType;
  if (tier === "premium") return "premium";
  if (tier === "member")  return "member";
  return null;
}

/**
 * Returns all badge options for the picker in display order.
 * Locked options are shown at reduced opacity — they indicate what's
 * available to earn or unlock. Founder is never included.
 *
 * Order: No Badge, Member, Premium, Beta Tester, Top Contributor,
 *        Moderator, Partner
 */
export function getBadgeOptions(
  tier:        string | null | undefined,
  badgeColumn: string | null | undefined,
): Array<{ type: BadgeType; label: string; storeAs: string | null; locked: boolean }> {
  const isPremium = tier === "premium";
  const isMember  = tier === "member" || isPremium;

  return [
    {
      type:    null,
      label:   "No Badge",
      storeAs: "none",
      locked:  false,
    },
    {
      type:    "member",
      label:   "Member",
      // Premium choosing Member stores "member" explicitly;
      // Member-tier default is null (tier decides).
      storeAs: isPremium ? "member" : null,
      locked:  !isMember,
    },
    {
      type:    "premium",
      label:   "Premium",
      storeAs: null,   // null = let premium tier decide
      locked:  !isPremium,
    },
    {
      type:    "beta_tester",
      label:   "Beta Tester",
      storeAs: "beta_tester",
      locked:  badgeColumn !== "beta_tester",
    },
    {
      type:    "top_contributor",
      label:   "Top Contributor",
      storeAs: "top_contributor",
      locked:  badgeColumn !== "top_contributor",
    },
    {
      type:    "moderator",
      label:   "Moderator",
      storeAs: "moderator",
      locked:  badgeColumn !== "moderator",
    },
    {
      type:    "partner",
      label:   "Partner",
      storeAs: "partner",
      locked:  badgeColumn !== "partner",
    },
  ];
}
