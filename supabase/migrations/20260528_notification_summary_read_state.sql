-- Migration: 20260528_notification_summary_read_state
-- Reworks get_notification_summary() so notifications are RETAINED
-- after they're read, instead of disappearing when last_seen_at is set.
--
-- Before: the function only returned threads with unseen comments
-- (HAVING on comments newer than last_seen_at), so tapping a row
-- (which sets last_seen_at = now()) made it vanish.
--
-- After: returns every thread with activity from others in the window
-- (HAVING total > 0), regardless of read state, newest-active first,
-- capped at 10. Per row it reports both:
--   unseen_count -> comments newer than the user's last view (unread
--                   when > 0; drives the ember dot + unread tally)
--   total_count  -> all comments from others in the window (shown once
--                   the row is read)
-- The card marks a row read by setting last_seen_at = now() (unchanged
-- dismiss route); the row stays in the list until newer threads push
-- it past the 10-row cap.
--
-- create-or-replace: forward-only function body change. The
-- notification_views table / RLS (20260527) are unchanged.

create or replace function get_notification_summary()
returns table (
  post_id      uuid,
  title        text,
  unseen_count bigint,
  total_count  bigint,
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
    count(c.id) filter (
      where c.created_at > coalesce(nv.last_seen_at, 'epoch'::timestamptz)
    )                  as unseen_count,
    count(c.id)        as total_count,
    mt.kind,
    max(c.created_at)  as latest_at
  from my_threads mt
  left join notification_views nv
    on nv.user_id = auth.uid() and nv.post_id = mt.id
  join forum_comments c
    on c.post_id = mt.id
   and c.user_id <> auth.uid()
   and c.created_at > now() - interval '60 days'
  group by mt.id, mt.title, mt.kind, nv.last_seen_at
  having count(c.id) > 0
  order by max(c.created_at) desc
  limit 10;
$$;
