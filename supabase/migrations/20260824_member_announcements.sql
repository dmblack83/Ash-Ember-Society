-- Weekly new-member digest: denormalized roster behind each digest post.
-- Spec: docs/superpowers/specs/2026-08-24-member-digest-design.md
-- MANUAL APPLY: run in the Supabase SQL editor before deploying the
-- member-digest cron (the feed embed tolerates the table's absence only
-- at the type level; the cron route requires it).

create table if not exists public.member_announcement_members (
  post_id      uuid    not null references public.forum_posts(id) on delete cascade,
  position     int     not null,
  user_id      uuid    not null,
  display_name text    not null,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  primary key (post_id, position)
);

alter table public.member_announcement_members enable row level security;

-- Read-only to everyone (the roster shows only already-public display
-- data); writes happen exclusively through the service role, which
-- bypasses RLS, so no insert/update/delete policies exist.
create policy "member_announcement_members_public_read"
  on public.member_announcement_members
  for select
  to anon, authenticated
  using (true);

-- Verify:
--   select policyname, roles from pg_policies
--   where tablename = 'member_announcement_members';
--   select count(*) from member_announcement_members;  -- 0, no error
