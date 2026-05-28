-- Migration: 20260528_notification_summary_limit_10
-- Redefines get_notification_summary() to surface at most 10 threads
-- (was 20). The card shows the 10 most-recently-active threads; as new
-- activity arrives on other threads, older ones drop past the cutoff.
-- create-or-replace, so this is a forward-only change to the function
-- body — the 20260527_notification_views.sql table/RLS are unchanged.

create or replace function get_notification_summary()
returns table (
  post_id      uuid,
  title        text,
  unseen_count bigint,
  kind         text,          -- 'authored' | 'participated'
  latest_at    timestamptz
)
language sql
security invoker
stable
as $$
  with my_threads as (
    -- posts I authored
    select fp.id, fp.title, 'authored'::text as kind
    from forum_posts fp
    where fp.user_id = auth.uid()
    union
    -- posts I commented on but did not author (captures replies to me)
    select fp.id, fp.title, 'participated'::text as kind
    from forum_posts fp
    join forum_comments fc on fc.post_id = fp.id
    where fc.user_id = auth.uid()
      and fp.user_id <> auth.uid()
  )
  select
    mt.id,
    mt.title,
    count(c.id)        as unseen_count,
    mt.kind,
    max(c.created_at)  as latest_at
  from my_threads mt
  left join notification_views nv
    on nv.user_id = auth.uid() and nv.post_id = mt.id
  join forum_comments c
    on c.post_id = mt.id
   and c.user_id <> auth.uid()
   and c.created_at > coalesce(nv.last_seen_at, 'epoch'::timestamptz)
   and c.created_at > now() - interval '60 days'
  group by mt.id, mt.title, mt.kind
  having count(c.id) > 0
  order by max(c.created_at) desc
  limit 10;
$$;
