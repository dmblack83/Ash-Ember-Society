/* ------------------------------------------------------------------
   Notification category catalog.

   Single source of truth for the set of push-notification categories
   the app supports. Both the server-side delivery path (lib/push.ts)
   and the future per-category opt-out UI in /account read from this
   list — adding a new push trigger means adding a new entry here.

   Storage: profiles.notification_preferences is a jsonb column with
   opt-OUT semantics. Empty object = all categories enabled. Setting
   a key to `false` disables that one category.

   Category id rules:
   - snake_case
   - stable forever once shipped (changing the id strands existing
     user opt-outs — they'd silently start firing again)
   - one id per fundamentally different alert reason, NOT per UI
     surface or per content type
   ------------------------------------------------------------------ */

export const NOTIFICATION_CATEGORIES = {
  /* Daily aging-ready cron (/api/cron/aging-ready). Fires when a
     humidor item hits its aging_target_date. */
  aging_ready: {
    id:          "aging_ready",
    label:       "Cigar aging alerts",
    description: "Notify me when a cigar in my humidor reaches its aging target date.",
  },
  /* On-demand test notifications triggered by the user from /account
     (/api/push/test). Marked `internal: true` so the future per-
     category preference UI hides this from the toggle list — users
     don't think of "tests" as a notification category they'd want
     to opt out of, and the endpoint is rate-limited anyway. */
  test: {
    id:          "test",
    label:       "Test notifications",
    description: "On-demand test notifications you trigger yourself from the account page.",
    internal:    true,
  },
} as const;

export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES;

/** Returns true if the user has not explicitly opted out of this
    category. Default (missing key, null prefs object) is enabled. */
export function isCategoryEnabled(
  prefs:    Record<string, unknown> | null | undefined,
  category: NotificationCategory,
): boolean {
  if (!prefs) return true;
  return prefs[category] !== false;
}
