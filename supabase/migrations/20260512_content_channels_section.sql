-- Add a `section` column to content_channels so the Discover > Channels
-- page can render two distinct lists:
--
--   'partner'  — Community Partner Channels (existing rows, default)
--   'featured' — Featured Content (staff picks)
--
-- The UI already has both headers in place; this column is what lets
-- the client query for each list separately. The sync route accepts
-- a `?section=featured` query param when seeding a new channel.
--
-- Existing rows keep section='partner' via the DEFAULT, so the
-- Bad Hombre Cigars channel (and any other previously-seeded partner)
-- continues to render under Community Partner Channels with no
-- backfill needed.

ALTER TABLE content_channels
  ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'partner';

-- Constraint as a separate statement so it's safe to re-run if the
-- column was added in a prior failed migration attempt.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'content_channels_section_check'
  ) THEN
    ALTER TABLE content_channels
      ADD CONSTRAINT content_channels_section_check
      CHECK (section IN ('partner', 'featured'));
  END IF;
END $$;

-- Index for the per-section query. Small table (handful of rows),
-- so a btree index is overkill in absolute terms but the query is
-- cleaner with the planner using the index than a seq scan.
CREATE INDEX IF NOT EXISTS content_channels_section_idx
  ON content_channels(section)
  WHERE is_active = true;
