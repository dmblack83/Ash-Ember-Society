-- ============================================================
-- cigar_catalog.strength
--
-- Adds a strength column to the public catalog. Values use the
-- snake_case convention already adopted by the app's UI helpers
-- (components/ui/strength.tsx, app/(app)/humidor/stats/page.tsx):
--
--   mild | mild_medium | medium | medium_full | full
--
-- The column is nullable so cigars without a known strength stay
-- unset rather than being forced into a default bucket.
--
-- Run in the Supabase SQL editor.
-- After applying, run scripts/seed-cigar-strengths.ts to populate
-- existing rows from the CDB.json export.
-- ============================================================

ALTER TABLE cigar_catalog
  ADD COLUMN IF NOT EXISTS strength text;

-- Constrain to the five enum values used everywhere else in the app.
-- DROP + ADD wraps the IF NOT EXISTS pattern so re-running is safe.
ALTER TABLE cigar_catalog
  DROP CONSTRAINT IF EXISTS cigar_catalog_strength_check;

ALTER TABLE cigar_catalog
  ADD CONSTRAINT cigar_catalog_strength_check
  CHECK (
    strength IS NULL
    OR strength IN ('mild', 'mild_medium', 'medium', 'medium_full', 'full')
  );
