-- Migration: 20260506_notification_preferences
-- Per-category push notification opt-out, stored as JSONB on profiles.
--
-- Why now: today there's a single push trigger (aging-ready), so the
-- existing binary opt-in flow in /account is fine. But more triggers
-- are inbound (lounge mentions, partner content, etc.) — without per-
-- category preferences, a user who finds one category annoying has
-- only the binary "disable all push" option. Once users learn that
-- disabling-all is the only way to stop a noisy category, retraining
-- them on per-category controls is much harder than designing for it
-- now.
--
-- Schema choice: JSONB on profiles vs separate notification_preferences
-- table. Going with JSONB because:
--   - Preferences are read together (one query for "all of user X's
--     prefs"), never individually
--   - Adding a new category is a code-only change (new key in the
--     jsonb), no schema migration
--   - Simpler than maintaining a separate table with its own RLS
-- Trade-off: no DB-level validation of category names. Mitigated by
-- centralizing the canonical list in lib/notification-categories.ts.
--
-- Semantics: OPT-OUT (false = explicitly disabled, missing = enabled).
--   - Empty {} = all categories enabled (preserves current binary
--     opt-in behavior)
--   - {"aging_ready": false} = user disabled this one category;
--     others still fire
--   - Adding a new category in code doesn't surprise existing users
--     with "you have to opt in to this new thing" — they're opted-in
--     by default, can disable later
-- Opt-OUT was chosen over opt-IN because users who said "yes" to push
-- consent should keep getting all push types unless they explicitly
-- decline a specific one.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN profiles.notification_preferences IS
  'Per-category push notification opt-out. Empty object = all categories enabled. Schema: { "<category>": false } means disabled. Categories are defined in lib/notification-categories.ts; only those values are valid keys.';
