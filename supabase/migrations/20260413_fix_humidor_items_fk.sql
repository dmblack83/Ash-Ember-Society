-- ============================================================
-- Fix humidor_items.cigar_id foreign key
--
-- The existing FK references the old `cigars` table.
-- All app code now uses cigar_catalog, so we move the FK there.
-- ============================================================

-- 1. Drop the old constraint (name matches what Supabase generated)
ALTER TABLE humidor_items
  DROP CONSTRAINT IF EXISTS humidor_items_cigar_id_fkey;

-- 2. Add the correct constraint pointing to cigar_catalog
ALTER TABLE humidor_items
  ADD CONSTRAINT humidor_items_cigar_id_fkey
  FOREIGN KEY (cigar_id)
  REFERENCES cigar_catalog(id)
  ON DELETE CASCADE;

-- 3. Smoke test — insert a row using a real cigar_catalog id and roll back
DO $$
DECLARE
  v_catalog_id uuid;
BEGIN
  SELECT id INTO v_catalog_id FROM cigar_catalog LIMIT 1;
  IF v_catalog_id IS NULL THEN
    RAISE NOTICE 'cigar_catalog is empty — skipping smoke test';
    RETURN;
  END IF;

  INSERT INTO humidor_items (user_id, cigar_id, quantity, is_wishlist)
  VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    v_catalog_id,
    1,
    false
  );

  -- If we got here the FK is wired correctly; roll back the test row
  RAISE EXCEPTION 'smoke_test_rollback';
EXCEPTION
  WHEN RAISE_EXCEPTION THEN
    IF SQLERRM = 'smoke_test_rollback' THEN
      RAISE NOTICE 'FK smoke test passed — cigar_catalog id accepted, test row rolled back.';
    ELSE
      RAISE;  -- re-raise real errors
    END IF;
END;
$$;
