-- Migration: 20260531_burn_report_thirds
-- Adds rich per-third review storage. Child of burn_reports.
-- Adds flavor-tag join table. Widens smoke_logs rating columns to
-- numeric(3,2) so thirds-mode averaged headlines (e.g. 4.75) fit.
--
-- The legacy burn_reports.{thirds_enabled, third_beginning,
-- third_middle, third_end} columns stay in place; they continue to
-- be written as a denormalized notes-only mirror so legacy read paths
-- keep working. The new burn_report_thirds rows carry the full
-- per-third payload (ratings, tasting tags, photo).
--
-- Lounge-read pattern: mirrors 20260502_burn_reports_lounge_read.sql.
-- A burn report (and its child thirds) is visible to any authenticated
-- user when the parent smoke_log_id appears in forum_posts. PostgreSQL
-- evaluates SELECT policies as OR, so owners still see their own
-- private thirds under the owner policy.
--
-- Note: flavor_tags is an admin-managed reference table created
-- directly in the SQL editor (no migration file). The FK below is
-- valid against the live database.

create table if not exists burn_report_thirds (
  id              uuid     primary key default gen_random_uuid(),
  burn_report_id  uuid     not null references burn_reports(id) on delete cascade,
  user_id         uuid     not null references profiles(id)     on delete cascade,
  third_index     smallint not null check (third_index in (1,2,3)),
  notes           text     not null,
  draw_rating          smallint not null check (draw_rating         between 1 and 5),
  burn_rating          smallint not null check (burn_rating         between 1 and 5),
  construction_rating  smallint not null check (construction_rating between 1 and 5),
  flavor_rating        smallint not null check (flavor_rating       between 1 and 5),
  photo_url       text     null,
  created_at      timestamptz not null default now(),
  unique (burn_report_id, third_index)
);

comment on table burn_report_thirds is
  'Rich per-third review payload (3 rows per thirds-enabled burn report). Sister to legacy burn_reports.third_* notes columns which are kept for back-compat.';

create index if not exists burn_report_thirds_burn_report_id_idx
  on burn_report_thirds (burn_report_id);
create index if not exists burn_report_thirds_user_id_idx
  on burn_report_thirds (user_id);

alter table burn_report_thirds enable row level security;

create policy "users can read their own burn report thirds"
  on burn_report_thirds for select to authenticated
  using (auth.uid() = user_id);

create policy "users can insert their own burn report thirds"
  on burn_report_thirds for insert to authenticated
  with check (auth.uid() = user_id);

create policy "users can update their own burn report thirds"
  on burn_report_thirds for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete their own burn report thirds"
  on burn_report_thirds for delete to authenticated
  using (auth.uid() = user_id);

-- Lounge-read: any authenticated user may read a burn_report_thirds row
-- whose parent smoke_log is referenced by a forum_post. Mirrors the
-- pattern in 20260502_burn_reports_lounge_read.sql.
create policy "lounge readers can read shared burn report thirds"
  on burn_report_thirds for select to authenticated
  using (
    exists (
      select 1
        from burn_reports br
        join forum_posts fp on fp.smoke_log_id = br.smoke_log_id
       where br.id = burn_report_thirds.burn_report_id
    )
  );

-- ── Join: flavor tags per third ──────────────────────────────────
create table if not exists burn_report_third_flavor_tags (
  third_id       uuid not null references burn_report_thirds(id) on delete cascade,
  flavor_tag_id  uuid not null references flavor_tags(id)        on delete restrict,
  primary key (third_id, flavor_tag_id)
);

create index if not exists burn_report_third_flavor_tags_tag_idx
  on burn_report_third_flavor_tags (flavor_tag_id);

alter table burn_report_third_flavor_tags enable row level security;

create policy "users can read their own per-third flavor tag joins"
  on burn_report_third_flavor_tags for select to authenticated
  using (
    exists (
      select 1 from burn_report_thirds t
       where t.id = burn_report_third_flavor_tags.third_id
         and t.user_id = auth.uid()
    )
  );

create policy "users can insert their own per-third flavor tag joins"
  on burn_report_third_flavor_tags for insert to authenticated
  with check (
    exists (
      select 1 from burn_report_thirds t
       where t.id = burn_report_third_flavor_tags.third_id
         and t.user_id = auth.uid()
    )
  );

create policy "users can delete their own per-third flavor tag joins"
  on burn_report_third_flavor_tags for delete to authenticated
  using (
    exists (
      select 1 from burn_report_thirds t
       where t.id = burn_report_third_flavor_tags.third_id
         and t.user_id = auth.uid()
    )
  );

create policy "lounge readers can read shared per-third flavor tag joins"
  on burn_report_third_flavor_tags for select to authenticated
  using (
    exists (
      select 1
        from burn_report_thirds t
        join burn_reports br on br.id = t.burn_report_id
        join forum_posts fp  on fp.smoke_log_id = br.smoke_log_id
       where t.id = burn_report_third_flavor_tags.third_id
    )
  );

-- ── Widen smoke_logs rating columns to numeric(3,2) ───────────────
-- Thirds-mode averaged headlines need 0.25 precision (e.g. 4.75).
-- Integer values cast cleanly.
alter table smoke_logs
  alter column draw_rating         type numeric(3,2) using draw_rating::numeric(3,2),
  alter column burn_rating         type numeric(3,2) using burn_rating::numeric(3,2),
  alter column construction_rating type numeric(3,2) using construction_rating::numeric(3,2),
  alter column flavor_rating       type numeric(3,2) using flavor_rating::numeric(3,2);
