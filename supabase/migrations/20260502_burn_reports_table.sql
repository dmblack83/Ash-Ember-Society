-- Migration: 20260502_burn_reports_table
-- Creates a `burn_reports` table to hold burn-report-only fields,
-- separate from `smoke_logs`. `smoke_logs` is the broad descriptive
-- log of "user smoked cigar X at time Y"; in the future it should
-- also accept quick / lightweight entries that don't include rich
-- review content. Burn-report-specific fields (starting with the
-- "Thirds" feature in this PR) live on this child table instead.
--
-- Relationship is 1:1 with smoke_logs via a UNIQUE FK. Cascade on
-- delete so removing a smoke log cleans up its burn_report row.
-- user_id is denormalized so RLS policies can filter without
-- joining through smoke_logs.

create table if not exists burn_reports (
  id            uuid primary key default gen_random_uuid(),
  smoke_log_id  uuid not null unique
                  references smoke_logs(id) on delete cascade,
  user_id       uuid not null
                  references profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),

  -- Thirds — opt-in phased review (first / second / final third).
  -- thirds_enabled is the persisted toggle state. It is intentionally
  -- separate from "any third field is non-empty" because the user may
  -- toggle off without clearing text (the UI hides but preserves it),
  -- and we want the Verdict Card to honor the toggle on read.
  thirds_enabled  boolean not null default false,
  third_beginning text    null,
  third_middle    text    null,
  third_end       text    null
);

comment on table burn_reports is
  'Burn-report-only fields (1:1 with smoke_logs). smoke_logs stays
   descriptive; rich review fields specific to the Burn Report flow
   land here.';

comment on column burn_reports.thirds_enabled is
  'True when the Burn Report was filed with the Thirds toggle on.
   When true, the Verdict Card renders any non-empty third_* columns
   above the pull-quote review.';

comment on column burn_reports.third_beginning is
  'Freeform notes for the first third of the smoke (opening / light).
   May be non-empty even when thirds_enabled is false — the Burn
   Report flow preserves user-entered text across toggle off→on.';

comment on column burn_reports.third_middle is
  'Freeform notes for the second third (developing flavor, draw, burn).';

comment on column burn_reports.third_end is
  'Freeform notes for the final third (finish, lingering notes).';

-- Lookup index on smoke_log_id is implicit via the UNIQUE constraint.
-- Add a user_id index to support per-user queries (e.g. "all my
-- burn reports") without scanning the table.
create index if not exists burn_reports_user_id_idx
  on burn_reports (user_id);

alter table burn_reports enable row level security;

create policy "users can read their own burn reports"
  on burn_reports for select to authenticated
  using (auth.uid() = user_id);

create policy "users can insert their own burn reports"
  on burn_reports for insert to authenticated
  with check (auth.uid() = user_id);

create policy "users can update their own burn reports"
  on burn_reports for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete their own burn reports"
  on burn_reports for delete to authenticated
  using (auth.uid() = user_id);
