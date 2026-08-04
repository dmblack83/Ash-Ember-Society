-- Lounge multi-image support.
--
-- forum_posts.image_urls: up to 3 images per standard post. The legacy
-- single image_url column STAYS and new writes keep it in sync with
-- image_urls[1] so clients running older cached bundles keep rendering
-- one image. Readers normalize via lib/lounge/post-images.ts.
--
-- forum_comments.image_url: one optional image per comment/reply.
--
-- MANUAL APPLY in the Supabase SQL editor (pre-deploy gate for the
-- feature PR). No backfill needed: code falls back to image_url when
-- image_urls is null.

alter table forum_posts    add column if not exists image_urls text[];
alter table forum_comments add column if not exists image_url  text;

-- Verify:
--   select column_name, data_type from information_schema.columns
--   where (table_name = 'forum_posts'    and column_name = 'image_urls')
--      or (table_name = 'forum_comments' and column_name = 'image_url');
-- Expect 2 rows: image_urls/ARRAY and image_url/text.
