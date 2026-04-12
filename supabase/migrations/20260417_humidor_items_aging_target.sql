-- Migration: 20260417_humidor_items_aging_target
-- Adds aging_target_date to humidor_items so users can set a "ready to
-- smoke" target date for cigars they are aging. The Aging Alerts section
-- on the Home dashboard queries this column.

ALTER TABLE humidor_items
  ADD COLUMN IF NOT EXISTS aging_target_date date NULL;

COMMENT ON COLUMN humidor_items.aging_target_date IS
  'Optional date the user wants to smoke this cigar by / after aging.
   When set, the Home dashboard surfaces an alert as the date approaches.';
