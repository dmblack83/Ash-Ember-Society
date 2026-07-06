-- ============================================================
-- Lounge unified feed (2026-07-05)
-- Manual-apply in the Supabase SQL editor. Safe to re-run.
--
-- 1. Fold Welcome/Introductions posts into General Discussion
-- 2. Delete the welcome category row (rules post lives in the
--    lounge-rules gate category and is looked up by
--    is_system + is_pinned, so this row anchors nothing)
-- 3. get_hot_posts RPC: posts ranked by comment count over the
--    trailing 7 days, tie-break created_at desc
-- 4. Indexes for the unfiltered newest-first feed and the hot join
-- ============================================================

-- 1. Reassign Welcome posts to General Discussion
update forum_posts
set category_id = (select id from forum_categories where slug = 'general-discussion')
where category_id = (select id from forum_categories where slug = 'welcome');

-- 2. Remove the Welcome category (no posts reference it after step 1)
delete from forum_categories where slug = 'welcome';

-- 3. Hot ranking RPC. Invoker rights + STABLE, so forum_posts RLS
--    applies to the caller as normal.
create or replace function get_hot_posts(
  p_category_id uuid    default null,
  p_limit       integer default 15,
  p_offset      integer default 0
)
returns table (post_id uuid)
language sql
stable
as $$
  select p.id
  from forum_posts p
  left join forum_comments c
    on c.post_id = p.id
   and c.created_at >= now() - interval '7 days'
  where p.is_system = false
    and p.is_pinned is distinct from true
    and (p_category_id is null or p.category_id = p_category_id)
  group by p.id
  order by count(c.id) desc, p.created_at desc
  limit p_limit offset p_offset;
$$;

grant execute on function get_hot_posts(uuid, integer, integer) to authenticated;

-- 4. Indexes
create index if not exists forum_posts_created_at_idx
  on forum_posts (created_at desc);

create index if not exists forum_comments_post_created_idx
  on forum_comments (post_id, created_at desc);
