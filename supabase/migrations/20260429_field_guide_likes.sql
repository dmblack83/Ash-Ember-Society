-- Per-user likes on Field Guide volumes (one per user per volume)
CREATE TABLE IF NOT EXISTS field_guide_likes (
  vol_number smallint    NOT NULL CHECK (vol_number BETWEEN 1 AND 4),
  user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vol_number, user_id)
);

ALTER TABLE field_guide_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "field_guide_likes_select"
  ON field_guide_likes FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "field_guide_likes_insert"
  ON field_guide_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "field_guide_likes_delete"
  ON field_guide_likes FOR DELETE
  USING (auth.uid() = user_id);
