-- ============================================================
-- news_items
--
-- Cigar-news articles ingested from RSS feeds and surfaced on the
-- home dashboard + Discover. Each row points at an external article;
-- there's no in-app reading sheet (the user always link-outs).
--
-- Populated by the cron-driven sync route (/api/news/sync), which
-- upserts on guid (RSS items have a stable per-article identifier).
--
-- All authenticated users can read; only the service role writes.
-- ============================================================

CREATE TABLE IF NOT EXISTS news_items (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guid          text        NOT NULL UNIQUE,
  source_name   text        NOT NULL,
  source_slug   text        NOT NULL,
  title         text        NOT NULL,
  link          text        NOT NULL,
  summary       text,
  image_url     text,
  published_at  timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_items_published_at_idx
  ON news_items (published_at DESC);

ALTER TABLE news_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "news_items_select" ON news_items;

CREATE POLICY "news_items_select"
  ON news_items FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies for authenticated — the sync route
-- uses the service role client which bypasses RLS.
