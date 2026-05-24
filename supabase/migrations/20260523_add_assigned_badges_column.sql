-- Durable admin-assigned badges
--
-- The `profiles.badge` column conflates two concepts:
--   1. Which admin-assigned role the user OWNS (beta_tester, moderator, etc.)
--   2. Which badge the user has CHOSEN to display
--
-- Result: when a user opens the badge picker and selects "No Badge" or
-- "Premium", their admin-assigned role gets overwritten and lost. The
-- membership override (beta_tester -> premium access) then silently
-- expires the moment the user touches the picker.
--
-- This migration splits the two concepts:
--   - `assigned_badges text[]`  — admin-granted roles the user owns
--   - `badge` (existing column) — display choice only
--
-- Grants are done by appending to `assigned_badges`. Revocations remove
-- from the array. The picker unlocks admin badges based on what the user
-- owns. Permission checks (founder, beta_tester) read `assigned_badges`
-- so display choice can never accidentally revoke access.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS assigned_badges text[] NOT NULL DEFAULT '{}';

-- Backfill: any current `badge` value that is admin-assigned becomes
-- the user's first assigned badge. Tier-derived badges (member, premium)
-- and "none" are left out — those are display choices, not assignments.
UPDATE profiles
SET assigned_badges = ARRAY[badge]
WHERE badge IN ('beta_tester', 'top_contributor', 'moderator', 'partner', 'founder')
  AND NOT (badge = ANY(assigned_badges));

-- Index for the membership override path. Permission checks run on every
-- request that reads a profile, so the GIN index on the array makes
-- `assigned_badges @> ARRAY['beta_tester']` fast.
CREATE INDEX IF NOT EXISTS profiles_assigned_badges_gin
  ON profiles USING GIN (assigned_badges);
