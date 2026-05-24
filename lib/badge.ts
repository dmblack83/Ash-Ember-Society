/**
 * Badge frame types for user avatars.
 *
 * Two-column model since 2026-05-23:
 *   - `profiles.assigned_badges text[]` — admin-granted roles the user owns
 *   - `profiles.badge text`             — what the user chooses to display
 *
 * Admin grants append to assigned_badges. The picker unlocks admin
 * badges based on what the user owns. Permission overrides (founder,
 * beta_tester → premium) read assigned_badges, so the user's display
 * choice can never accidentally revoke their access.
 *
 * "member" and "premium" activate automatically from membership_tier
 * unless the user has explicitly selected a different badge via the
 * badge column.
 *
 * Database badge column values (display choice):
 *   null              → use tier default (member/premium frame; none for free)
 *   'none'            → user explicitly hid their badge
 *   'member'          → user explicitly chose member frame
 *   'premium'         → user explicitly chose premium frame
 *   'beta_tester'     → user chose to display their assigned beta_tester badge
 *   'top_contributor' → user chose to display their assigned top_contributor badge
 *   'moderator'       → user chose to display their assigned moderator badge
 *   'partner'         → user chose to display their assigned partner badge
 *   'founder'         → user chose to display their assigned founder badge
 *
 * Admin-assigned values are only valid in `badge` if they also appear in
 * `assigned_badges` — see resolveBadge for the revocation guard.
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

/** Badge values that must be explicitly assigned by an admin. */
const ADMIN_ASSIGNED_BADGES: ReadonlySet<string> = new Set([
  "beta_tester",
  "top_contributor",
  "moderator",
  "partner",
  "founder",
]);

/**
 * Resolves which badge frame to display for a user.
 * 'none' stored in the badge column → returns null (no frame).
 * An explicit badge column value overrides the tier default.
 *
 * When `assignedBadges` is provided, applies a revocation guard: if the
 * user's display choice is an admin-assigned badge they no longer own,
 * fall back to the tier default. When omitted, trusts `badge` as-is
 * (legacy callers; safe for read-only display of other users).
 */
export function resolveBadge(
  badge: string | null | undefined,
  tier:  string | null | undefined,
  assignedBadges?: readonly string[] | null,
): BadgeType {
  if (badge === "none") return null;
  if (badge) {
    // Revocation guard — admin badges require ownership.
    if (
      ADMIN_ASSIGNED_BADGES.has(badge) &&
      assignedBadges !== undefined &&
      !(assignedBadges ?? []).includes(badge)
    ) {
      // Fall through to tier default.
    } else {
      return badge as BadgeType;
    }
  }
  if (tier === "premium") return "premium";
  if (tier === "member")  return "member";
  return null;
}

/**
 * Returns all badge options for the picker in display order.
 * Locked options are shown at reduced opacity — they indicate what's
 * available to earn or unlock. Founder is never included.
 *
 * Admin badges unlock based on `assignedBadges` (what the user owns),
 * not the current `badge` display choice. This is the durable side of
 * the two-column model: switching display never revokes ownership.
 *
 * Order: No Badge, Member, Premium, Beta Tester, Top Contributor,
 *        Moderator, Partner
 */
export function getBadgeOptions(
  tier:           string | null | undefined,
  _badgeColumn:   string | null | undefined,
  assignedBadges: readonly string[] | null | undefined,
): Array<{ type: BadgeType; label: string; storeAs: string | null; locked: boolean }> {
  const isPremium = tier === "premium";
  const isMember  = tier === "member" || isPremium;
  const owned     = new Set(assignedBadges ?? []);

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
      locked:  !owned.has("beta_tester"),
    },
    {
      type:    "top_contributor",
      label:   "Top Contributor",
      storeAs: "top_contributor",
      locked:  !owned.has("top_contributor"),
    },
    {
      type:    "moderator",
      label:   "Moderator",
      storeAs: "moderator",
      locked:  !owned.has("moderator"),
    },
    {
      type:    "partner",
      label:   "Partner",
      storeAs: "partner",
      locked:  !owned.has("partner"),
    },
  ];
}
