-- ================================================================
-- moderation_log
-- Stores every Vision API call result for audit purposes.
-- The image itself is NEVER stored — only metadata and scores.
-- ================================================================

create table if not exists moderation_log (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  type          text        not null check (type in ('cigar_band', 'profile_image', 'blog_image')),
  passed        boolean     not null,
  safety_scores jsonb       not null default '{}',
  reason        text,
  created_at    timestamptz not null default now()
);

-- Index for per-user audit queries
create index if not exists moderation_log_user_id_idx on moderation_log (user_id);
create index if not exists moderation_log_created_at_idx on moderation_log (created_at desc);

-- RLS: enable but add no user-facing policies.
-- All writes go through the service role key (bypasses RLS).
-- Users cannot read their own rows — this is an internal audit table.
alter table moderation_log enable row level security;
