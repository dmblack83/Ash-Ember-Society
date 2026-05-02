-- ============================================================
-- Cascade forum_posts on auth user delete.
-- Was ON DELETE SET NULL, leaving orphaned threads with user_id=NULL.
-- Switching to CASCADE so deleting a user fully removes their threads
-- (and forum_comments cascade off forum_posts in turn).
-- Already applied manually via the Supabase SQL editor; checking in
-- so the schema change is tracked in version control.
-- ============================================================

ALTER TABLE forum_posts
  DROP CONSTRAINT forum_posts_user_id_fkey,
  ADD CONSTRAINT forum_posts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
