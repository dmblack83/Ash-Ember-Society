-- Add reply support to field_guide_comments
ALTER TABLE field_guide_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid
    REFERENCES field_guide_comments(id) ON DELETE CASCADE;
