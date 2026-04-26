-- Fix badge column: ensure it exists and the CHECK constraint includes
-- all user-selectable values ('none', 'member', 'premium') in addition to
-- admin-assigned special roles. The initial migration only had the special
-- roles, causing 400 errors when users tried to save their badge preference.

-- Step 1: create column if it doesn't exist yet
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS badge TEXT;

-- Step 2: drop old constraint (may or may not exist; ignore if absent)
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_badge_check;

-- Step 3: add full constraint
ALTER TABLE profiles
  ADD CONSTRAINT profiles_badge_check CHECK (
    badge IS NULL OR badge IN (
      'none',
      'member',
      'premium',
      'beta_tester',
      'top_contributor',
      'moderator',
      'partner',
      'founder'
    )
  );
