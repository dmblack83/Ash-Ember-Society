-- ============================================================
-- Blend is vitola-owned (Dave, 2026-09-07): vitolas in one
-- series can smoke different blends. cigar_lines becomes pure
-- identity (brand + series + community flags). Children already
-- store blend — their copies simply become the single source of
-- truth; NO data moves and NO catalog row changes.
--   1. Trigger propagates brand/series only.
--   2. Line blend columns dropped.
--   3. Insert RPC keeps the CALLER's blend on the child.
-- Manual-apply in the Supabase SQL editor.
-- ============================================================

-- 1. Identity-only sync trigger.
create or replace function sync_cigar_line_children()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update cigar_catalog set
    brand  = new.brand,
    series = new.series
  where line_id = new.id;
  return new;
end;
$$;

drop trigger if exists cigar_lines_sync_children on cigar_lines;
create trigger cigar_lines_sync_children
  after update of brand, series
  on cigar_lines
  for each row execute function sync_cigar_line_children();

-- 2. Drop the line blend columns (children own blend now).
alter table cigar_lines
  drop column if exists wrapper,
  drop column if exists shade,
  drop column if exists wrapper_country,
  drop column if exists binder_country,
  drop column if exists filler_countries;

-- 3. Insert RPC v4: same 11-param signature; the line is created
--    with identity only and the CHILD carries the caller's blend.
create or replace function insert_cigar_to_catalog(
  p_brand            text,
  p_series           text    default null,
  p_format           text    default null,
  p_ring_gauge       numeric default null,
  p_length_inches    numeric default null,
  p_wrapper          text    default null,
  p_wrapper_country  text    default null,
  p_shade            text    default null,
  p_binder_country   text    default null,
  p_filler_countries text[]  default null,
  p_name             text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line cigar_lines%rowtype;
  v_id   uuid;
begin
  if p_brand is null or trim(p_brand) = '' then
    raise exception 'brand is required';
  end if;

  select * into v_line
  from cigar_lines
  where brand = p_brand
    and coalesce(series, '') = coalesce(p_series, '');

  if not found then
    begin
      insert into cigar_lines (brand, series, community_added, approved)
      values (p_brand, p_series, true, false)
      returning * into v_line;
    exception when unique_violation then
      select * into v_line
      from cigar_lines
      where brand = p_brand
        and coalesce(series, '') = coalesce(p_series, '');
    end;
  end if;

  insert into cigar_catalog (
    source_id, brand, series, name, format, ring_gauge, length_inches,
    wrapper, wrapper_country, shade, binder_country, filler_countries,
    community_added, approved, usage_count, line_id
  ) values (
    'community-' || gen_random_uuid()::text,
    v_line.brand, v_line.series, nullif(trim(coalesce(p_name, '')), ''),
    p_format, p_ring_gauge, p_length_inches,
    p_wrapper, p_wrapper_country, p_shade, p_binder_country, p_filler_countries,
    true, false, 0, v_line.id
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function insert_cigar_to_catalog(text, text, text, numeric, numeric, text, text, text, text, text[], text) from public, anon;
grant execute on function insert_cigar_to_catalog(text, text, text, numeric, numeric, text, text, text, text, text[], text) to authenticated, service_role;

-- ── Verify ──────────────────────────────────────────────────
-- select column_name from information_schema.columns
--   where table_name = 'cigar_lines' order by ordinal_position;
--   -- expect: id, brand, series, community_added, approved, created_at
-- select count(*) from cigar_catalog;      -- unchanged
-- select count(*) from cigar_catalog where wrapper is not null;  -- unchanged vs before

-- ── Rollback ────────────────────────────────────────────────
-- Re-add the five columns (nullable), re-apply the trigger and RPC
-- bodies from 20260906_cigar_lines.sql / 20260907_cigar_vitola_name.sql,
-- and repopulate line blend from each line's top-usage child.
