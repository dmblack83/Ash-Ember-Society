-- ============================================================
-- Performance indexes
--
-- Adds composite indexes on the filter columns hit most often in
-- app/(app)/**/page.tsx queries. Each is keyed to a known query
-- pattern from the audit:
--
--   humidor_items: every humidor / wishlist / stats / item-detail
--     page filters on user_id, frequently combined with is_wishlist.
--
--   smoke_logs: stats, burn-reports, and humidor item detail filter
--     on user_id and (user_id, cigar_id) pairs.
--
--   forum_posts: every category-feed page filters on category_id
--     and orders by created_at DESC. The composite serves the
--     filter and the sort with a single index walk.
--
-- All three are CREATE INDEX IF NOT EXISTS and idempotent.
-- ============================================================

CREATE INDEX IF NOT EXISTS humidor_items_user_wishlist_idx
  ON humidor_items (user_id, is_wishlist);

CREATE INDEX IF NOT EXISTS smoke_logs_user_cigar_idx
  ON smoke_logs (user_id, cigar_id);

CREATE INDEX IF NOT EXISTS forum_posts_category_created_idx
  ON forum_posts (category_id, created_at DESC);
