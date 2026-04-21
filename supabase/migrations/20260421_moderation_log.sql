-- Moderation log: records every Vision API safety check result.
-- Written by the service-role client (bypasses RLS) so users
-- cannot read or modify their own moderation history.

create table if not exists moderation_log (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  type          text        not null check (type in ('cigar_band', 'profile_image', 'blog_image')),
  passed        boolean     not null,
  safety_scores jsonb       not null default '{}',
  reason        text,
  created_at    timestamptz not null default now()
);

alter table moderation_log enable row level security;

-- No SELECT policy — users cannot read moderation records.
-- Only the service role (used by the API route) can insert rows.
