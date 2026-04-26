-- Add badge column to profiles for special role assignments.
-- membership_tier handles member/premium frames automatically.
-- This column is only for manually assigned roles.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS badge TEXT
  CHECK (
    badge IS NULL OR badge IN (
      'beta_tester', 'top_contributor', 'moderator', 'partner', 'founder'
    )
  );
