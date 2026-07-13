-- ------------------------------------------------------------------
-- International signup: profiles.country (ISO 3166-1 alpha-2).
--
-- Onboarding and the account location editor are now country-aware:
-- US members keep the ZIP flow (city/state auto-fill); everyone else
-- enters a city only, and location is optional for all (GDPR data
-- minimization). Existing members are all US signups, so the default
-- backfills them correctly.
--
-- MANUAL APPLY: run in the Supabase SQL editor.
-- ------------------------------------------------------------------

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'US';

-- Verify:
-- SELECT country, count(*) FROM profiles GROUP BY country;
