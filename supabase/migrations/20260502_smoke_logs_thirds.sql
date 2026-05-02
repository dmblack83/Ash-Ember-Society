-- Migration: 20260502_smoke_logs_thirds
-- Adds the "Enable Thirds" feature on the Burn Report flow. Cigar
-- reviewers conventionally evaluate a smoke in three phases (first /
-- second / final third). When the toggle on Step 5 is on, the user
-- can capture freeform notes per phase; the Verdict Card on Step 6
-- renders those notes above the pull-quote review when at least one
-- has content.
--
-- thirds_enabled is the persisted toggle state. It is intentionally
-- separate from "any third field is non-empty" because the user may
-- toggle off without clearing text (the UI hides but preserves it),
-- and we want the Verdict Card to honor the toggle on read.

ALTER TABLE smoke_logs
  ADD COLUMN IF NOT EXISTS thirds_enabled  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS third_beginning text    NULL,
  ADD COLUMN IF NOT EXISTS third_middle    text    NULL,
  ADD COLUMN IF NOT EXISTS third_end       text    NULL;

COMMENT ON COLUMN smoke_logs.thirds_enabled IS
  'True when the Burn Report was filed with the Thirds toggle on.
   When true, the Verdict Card renders any non-empty third_*
   columns above the pull-quote review.';

COMMENT ON COLUMN smoke_logs.third_beginning IS
  'Freeform notes for the first third of the smoke (opening / light).
   May be non-empty even when thirds_enabled is false — the Burn
   Report flow preserves user-entered text across toggle off→on.';

COMMENT ON COLUMN smoke_logs.third_middle IS
  'Freeform notes for the second third (developing flavor, draw, burn).';

COMMENT ON COLUMN smoke_logs.third_end IS
  'Freeform notes for the final third (finish, lingering notes).';
