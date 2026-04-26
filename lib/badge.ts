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

/** Returns the badge options the user can select in their profile settings. */
export function getBadgeOptions(
  tier:        string | null | undefined,
  badgeColumn: string | null | undefined,
): Array<{ type: BadgeType; label: string; storeAs: string | null }> {
  const options: Array<{ type: BadgeType; label: string; storeAs: string | null }> = [];

  // Special admin-assigned role badge (e.g. beta_tester, moderator)
  const specialRoles = ["beta_tester", "top_contributor", "moderator", "partner", "founder"];
  if (badgeColumn && specialRoles.includes(badgeColumn)) {
    options.push({
      type:    badgeColumn as BadgeType,
      label:   BADGE_LABELS[badgeColumn],
      storeAs: badgeColumn,
    });
  }

  // Tier badges
  if (tier === "premium") {
    // storeAs null = "let tier decide" = shows premium by default
    options.push({ type: "premium", label: "Premium", storeAs: null });
    options.push({ type: "member",  label: "Member",  storeAs: "member" });
  } else if (tier === "member") {
    options.push({ type: "member", label: "Member", storeAs: null });
  }

  // Always offer "no badge"
  options.push({ type: null, label: "No Badge", storeAs: "none" });

  return options;
}

/**
 * Returns the storeAs value of the currently active badge option,
 * for use in the badge picker's active-state highlighting.
 */
export function getActiveBadgeStoreAs(
  badgeColumn: string | null | undefined,
  tier:        string | null | undefined,
): string | null {
  if (badgeColumn === "none")    return "none";
  if (badgeColumn === "member")  return "member";
  if (badgeColumn === "premium") return null; // same as tier default
  if (badgeColumn)               return badgeColumn; // special role
  // null column → tier default is active
  // storeAs for tier-default options is null
  return null;
}
