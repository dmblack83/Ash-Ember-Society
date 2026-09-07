-- ============================================================
-- cigar_lines: parent table (shared DNA per brand+series line).
-- cigar_catalog stays the child table (one row per size); child
-- blend columns become database-maintained copies of the line.
-- Manual-apply in the Supabase SQL editor. Rollback at bottom.
-- ============================================================

create table if not exists cigar_lines (
  id               uuid primary key default gen_random_uuid(),
  brand            text not null,
  series           text,                -- null = brand-only line
  wrapper          text,
  shade            text,
  wrapper_country  text,
  binder_country   text,
  filler_countries text[],
  community_added  boolean not null default false,
  approved         boolean not null default true,
  created_at       timestamptz not null default now()
);

create unique index if not exists cigar_lines_brand_series_key
  on cigar_lines (brand, coalesce(series, ''));

alter table cigar_lines enable row level security;

-- Authenticated read only; NO write policies (writes go through
-- security-definer RPCs / the sync trigger / service role). Anon
-- gets nothing, matching the catalog anon-read hardening.
drop policy if exists cigar_lines_authenticated_read on cigar_lines;
create policy cigar_lines_authenticated_read
  on cigar_lines for select to authenticated using (true);

-- Child link. on delete restrict: a line with children can't be
-- deleted; existing FKs already block deleting referenced children.
alter table cigar_catalog
  add column if not exists line_id uuid references cigar_lines(id) on delete restrict;

create index if not exists cigar_catalog_line_id_idx
  on cigar_catalog (line_id);
-- Sibling lookups group by (brand, series) — cheap btree.
create index if not exists cigar_catalog_brand_series_idx
  on cigar_catalog (brand, series);

-- Sync contract: cigar_lines is the ONLY writable home of blend
-- fields. This trigger propagates line edits to children's copies.
-- UPDATE only — it can never delete rows or touch ids/format/
-- ring_gauge/length_inches. search_text regenerates automatically
-- (it computes from child columns).
create or replace function sync_cigar_line_children()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update cigar_catalog set
    brand            = new.brand,
    series           = new.series,
    wrapper          = new.wrapper,
    shade            = new.shade,
    wrapper_country  = new.wrapper_country,
    binder_country   = new.binder_country,
    filler_countries = new.filler_countries
  where line_id = new.id;
  return new;
end;
$$;

drop trigger if exists cigar_lines_sync_children on cigar_lines;
create trigger cigar_lines_sync_children
  after update of brand, series, wrapper, shade, wrapper_country,
                  binder_country, filler_countries
  on cigar_lines
  for each row execute function sync_cigar_line_children();

-- ── Verify ──────────────────────────────────────────────────
-- select count(*) from cigar_lines;                          -- 0 (backfill comes next)
-- select column_name from information_schema.columns
--   where table_name = 'cigar_catalog' and column_name = 'line_id';  -- 1 row
-- select tgname from pg_trigger where tgname = 'cigar_lines_sync_children'; -- 1 row

-- ── Rollback (byte-identical to today) ──────────────────────
-- drop trigger if exists cigar_lines_sync_children on cigar_lines;
-- drop function if exists sync_cigar_line_children();
-- alter table cigar_catalog drop column if exists line_id;
-- drop table if exists cigar_lines;
