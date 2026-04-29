-- Field Guide Comments
-- Flat (no replies) — editorial content, one level of discussion per volume.

CREATE TABLE IF NOT EXISTS field_guide_comments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vol_number smallint    NOT NULL CHECK (vol_number BETWEEN 1 AND 4),
  user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    text        NOT NULL CHECK (char_length(content) >= 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS field_guide_comments_vol_idx
  ON field_guide_comments (vol_number, created_at ASC);

ALTER TABLE field_guide_comments ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all comments
CREATE POLICY "field_guide_comments_select"
  ON field_guide_comments FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can insert their own comments
CREATE POLICY "field_guide_comments_insert"
  ON field_guide_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own comments
CREATE POLICY "field_guide_comments_update"
  ON field_guide_comments FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own comments
CREATE POLICY "field_guide_comments_delete"
  ON field_guide_comments FOR DELETE
  USING (auth.uid() = user_id);
