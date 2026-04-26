-- Add is_feedback flag to forum_categories
ALTER TABLE forum_categories
  ADD COLUMN IF NOT EXISTS is_feedback boolean NOT NULL DEFAULT false;

-- Insert the Product Feedback category at the bottom (sort_order 99)
INSERT INTO forum_categories (name, slug, description, sort_order, is_gate, is_locked, is_feedback)
VALUES (
  'Product Feedback',
  'product-feedback',
  'Share ideas, report bugs, and vote on what we build next.',
  99,
  false,
  false,
  true
)
ON CONFLICT (slug) DO NOTHING;

-- Votes table — one row per user per post, value is +1 or -1
CREATE TABLE IF NOT EXISTS forum_post_votes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  post_id    uuid        NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  value      smallint    NOT NULL CHECK (value IN (1, -1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);

ALTER TABLE forum_post_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forum_post_votes_select"
  ON forum_post_votes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "forum_post_votes_insert"
  ON forum_post_votes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "forum_post_votes_update"
  ON forum_post_votes FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "forum_post_votes_delete"
  ON forum_post_votes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
