-- ============================================================
-- news_items RLS — widen read access to anon
--
-- The cached data layer (lib/data/news.ts → unstable_cache) cannot
-- use the cookie-bound server client (cookies() is a dynamic API
-- that disqualifies the function from being memoized). Instead it
-- reads with the anon-key client, which authenticates as the `anon`
-- role — not `authenticated`.
--
-- The original policy only allowed `authenticated` reads, so the
-- cached fetcher saw zero rows and the home + Discover surfaces
-- rendered the empty state even though the table had data.
--
-- News items are aggregated from public RSS feeds — there is no
-- privacy concern in serving them to unauthenticated visitors. (The
-- proxy already gates page access; this just unlocks reads at the
-- DB layer for the anon-key cached fetcher.)
--
-- Run in the Supabase SQL editor.
-- ============================================================

DROP POLICY IF EXISTS "news_items_select" ON news_items;

CREATE POLICY "news_items_select"
  ON news_items FOR SELECT
  TO authenticated, anon
  USING (true);
