-- ============================================================
-- Add extended profile fields
--
-- Adds first_name, last_name, phone, city, state, avatar_url
-- to the profiles table. All nullable, safe to add to existing rows.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS first_name  TEXT,
  ADD COLUMN IF NOT EXISTS last_name   TEXT,
  ADD COLUMN IF NOT EXISTS phone       TEXT,
  ADD COLUMN IF NOT EXISTS city        TEXT,
  ADD COLUMN IF NOT EXISTS state       TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url  TEXT;
