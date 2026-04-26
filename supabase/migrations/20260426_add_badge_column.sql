-- Add badge column to profiles.
-- 'member' / 'premium' let users explicitly override their tier-derived badge.
-- 'none' lets users hide their badge entirely.
-- Special roles (beta_tester, top_contributor, etc.) are assigned by admins only.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS badge TEXT
  CHECK (
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
