-- ============================================================
-- cigar_catalog.shade
--
-- Adds a shade column for the wrapper color classification
-- (Maduro, Colorado, Oscuro, etc.). Previously these values
-- were mixed into the `wrapper` column.
--
-- Going forward:
--   wrapper -> leaf varietal (Habano, Corojo, Connecticut Shade, ...)
--   shade   -> color (Maduro, Colorado Claro, Oscuro, ...)
--
-- Allowed values are enforced in the UI (manual Add Cigar form),
-- not the DB, so the list can evolve without migrations.
--
-- Run in the Supabase SQL editor.
-- After applying, run scripts/migrate-wrapper-to-shade.ts to
-- move shade-like values out of `wrapper` into `shade`.
-- ============================================================

ALTER TABLE cigar_catalog
  ADD COLUMN IF NOT EXISTS shade text;
