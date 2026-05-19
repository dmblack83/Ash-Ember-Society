-- ============================================================
-- cigar_edit_suggestions
--   User-suggested edits to cigar_catalog rows. Admin reviews
--   pending suggestions on the admin dashboard and approves or
--   rejects them. Approval writes the suggested values back into
--   cigar_catalog.
--
--   Mirrors the cigar_image_submissions pattern: per-user RLS for
--   insert/read; service-role for admin moderation.
--
--   Run in the Supabase SQL editor.
-- ============================================================

create table if not exists cigar_edit_suggestions (
  id              uuid primary key default gen_random_uuid(),
  cigar_id        uuid not null references cigar_catalog(id) on delete cascade,
  suggested_by    uuid not null references profiles(id)      on delete cascade,
  -- Snapshot of all editable fields at the moment of submission. Lets
  -- the admin see "what the user saw" even if the catalog changes
  -- between submission and review.
  current         jsonb not null,
  -- Only the fields the user proposed to change. Approval writes
  -- these back into cigar_catalog.
  suggested       jsonb not null,
  status          text  not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected')),
  reviewed_by     uuid references profiles(id) on delete set null,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- Per-cigar pending lookup (button-hide check + admin queue)
create index if not exists cigar_edit_suggestions_cigar_status_idx
  on cigar_edit_suggestions (cigar_id, status);

-- Per-user pending lookup (one-per-(user,cigar) rule enforcement)
create unique index if not exists cigar_edit_suggestions_one_pending_per_user_cigar
  on cigar_edit_suggestions (suggested_by, cigar_id)
  where status = 'pending';

alter table cigar_edit_suggestions enable row level security;

-- Users can insert their own suggestions
create policy "users can insert their own edit suggestions"
  on cigar_edit_suggestions for insert
  to authenticated
  with check (auth.uid() = suggested_by);

-- Users can read their own suggestions
create policy "users can read their own edit suggestions"
  on cigar_edit_suggestions for select
  to authenticated
  using (auth.uid() = suggested_by);

-- No update/delete policies for users — moderation flows through
-- the admin API route under service-role, which bypasses RLS.
