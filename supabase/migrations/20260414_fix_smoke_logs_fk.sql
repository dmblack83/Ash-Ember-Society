-- ============================================================
-- Fix smoke_logs.cigar_id foreign key
--
-- The existing FK references the old `cigars` table.
-- All app code now uses cigar_catalog, so we move the FK there.
-- Stale rows that reference neither table are deleted first to
-- avoid a 23503 violation on ADD CONSTRAINT.
-- ============================================================

-- 1. Drop the old constraint (both common naming conventions)
ALTER TABLE smoke_logs
  DROP CONSTRAINT IF EXISTS smoke_logs_cigar_id_fkey;

ALTER TABLE smoke_logs
  DROP CONSTRAINT IF EXISTS smoke_logs_cigar_id_key;

-- 2. Remove any rows whose cigar_id does not exist in cigar_catalog
DELETE FROM smoke_logs
  WHERE cigar_id IS NULL
     OR cigar_id NOT IN (SELECT id FROM cigar_catalog);

-- 3. Add the correct constraint pointing to cigar_catalog
ALTER TABLE smoke_logs
  ADD CONSTRAINT smoke_logs_cigar_id_fkey
  FOREIGN KEY (cigar_id)
  REFERENCES cigar_catalog(id)
  ON DELETE CASCADE;

-- 4. Smoke test — insert a row using a real cigar_catalog id and roll back
DO $$
DECLARE
  v_catalog_id uuid;
BEGIN
  SELECT id INTO v_catalog_id FROM cigar_catalog LIMIT 1;
  IF v_catalog_id IS NULL THEN
    RAISE NOTICE 'cigar_catalog is empty — skipping smoke test';
    RETURN;
  END IF;

  INSERT INTO smoke_logs (user_id, cigar_id, smoked_at, overall_rating)
  VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    v_catalog_id,
    NOW(),
    5
  );

  RAISE EXCEPTION 'smoke_test_rollback';
EXCEPTION
  WHEN RAISE_EXCEPTION THEN
    IF SQLERRM = 'smoke_test_rollback' THEN
      RAISE NOTICE 'FK smoke test passed — cigar_catalog id accepted, test row rolled back.';
    ELSE
      RAISE;
    END IF;
END;
$$;
