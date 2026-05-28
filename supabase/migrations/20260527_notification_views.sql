-- Migration: 20260527_notification_views
-- Backs the Home "Notifications" card. Stores a per-(user, post)
-- last-seen timestamp; unseen comment counts are computed on demand
-- by get_notification_summary(). No stored counter, no triggers — the
-- card is read only on Home open, so we never pay a write cost on the
-- hot path (posting a comment stays exactly as fast as today).

create table if not exists notification_views (
  user_id      uuid        not null references profiles(id)    on delete cascade,
  post_id      uuid        not null references forum_posts(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

comment on table notification_views is
  'Per-(user, post) last-seen timestamp for the Home notifications
   card. A row is written/updated when the user taps a notification
   row (dismiss). Missing row = never viewed (all comments unseen).
   Composite PK doubles as the upsert conflict target and read index.';

alter table notification_views enable row level security;

-- Supports the hot join in get_notification_summary() below
-- (forum_comments filtered by post_id + created_at). The RPC introduces
-- this access pattern; no prior index covers it.
create index if not exists forum_comments_post_created_idx
  on forum_comments (post_id, created_at);

create policy "users read their own notification views"
  on notification_views for select to authenticated
  using (auth.uid() = user_id);

create policy "users insert their own notification views"
  on notification_views for insert to authenticated
  with check (auth.uid() = user_id);

create policy "users update their own notification views"
  on notification_views for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Read path. security invoker => runs as the caller, so existing RLS
-- on forum_posts / forum_comments still gates readability. auth.uid()
-- scopes every branch to the current user.
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
   -- Window applies to comment activity, not post age: a long-running
   -- thread with a recent comment still surfaces; a thread whose only
   -- new comments are older than 60 days does not.
   and c.created_at > now() - interval '60 days'
  group by mt.id, mt.title, mt.kind
  having count(c.id) > 0
  order by max(c.created_at) desc
  limit 20;
$$;
