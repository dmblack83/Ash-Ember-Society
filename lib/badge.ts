/**
 * Badge frame types for user avatars.
 *
 * "member" and "premium" are derived automatically from membership_tier.
 * All other types are manually assigned via the `badge` column in `profiles`.
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

/**
 * Resolves which badge frame to show for a user.
 * A manually-assigned `badge` column takes priority over membership tier.
 */
export function resolveBadge(
  badge: string | null | undefined,
  tier:  string | null | undefined,
): BadgeType {
  if (badge) return badge as BadgeType;
  if (tier === "premium") return "premium";
  if (tier === "member")  return "member";
  return null;
}
