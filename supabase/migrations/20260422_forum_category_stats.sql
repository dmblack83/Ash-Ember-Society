-- Returns per-category post count and last post timestamp.
-- Excludes system posts (is_system = true).
create or replace function get_forum_category_stats()
returns table (
  category_id  uuid,
  post_count   bigint,
  last_post_at timestamptz
)
language sql
stable
security definer
as $$
  select
    category_id,
    count(*)        as post_count,
    max(created_at) as last_post_at
  from  forum_posts
  where is_system = false
  group by category_id;
$$;
