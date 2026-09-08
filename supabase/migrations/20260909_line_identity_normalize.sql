-- ============================================================
-- line identity normalize: "chateau fuente" and "Chateau Fuente "
-- can no longer coexist as separate cigar_lines rows. Case and
-- surrounding whitespace stop being part of a line's identity;
-- the FIRST row to claim a normalized (brand, series) pair keeps
-- its casing as the line's canonical display text (children
-- attaching later adopt it via the sync trigger / insert RPC).
--
-- Manual-apply via the Supabase MANAGEMENT API (NOT the SQL
-- editor — the editor's parser mangles complex plpgsql bodies).
-- Body style constraints below are unchanged from the editor-safe
-- style used elsewhere (kept for portability, see the header of
-- 20260908_merge_catalog_vitolas.sql): one statement per line,
-- multi-line statements only, select into + if not found, no get
-- diagnostics, no subqueries inside if conditions, no single-line
-- statements.
--
-- ── PRE-APPLY PROBE (run this FIRST; collisions block the index
--    swap below) ──────────────────────────────────────────────
-- select lower(btrim(brand)), lower(btrim(coalesce(series, ''))), count(*)
-- from cigar_lines
-- group by 1, 2
-- having count(*) > 1;
-- Expect 0 rows. Any hits are case/whitespace-dupe lines — merge
-- them via the admin Edit Line → rename-onto-existing-line merge
-- flow BEFORE applying the rest of this migration.
-- ============================================================

-- 1. Unique index swap: drop the old exact-match index, replace
--    with one on the normalized identity.
drop index if exists cigar_lines_brand_series_key;

create unique index if not exists cigar_lines_brand_series_normalized_key
  on cigar_lines (lower(btrim(brand)), lower(btrim(coalesce(series, ''))));

-- 2. insert_cigar_to_catalog v5: same 11-param signature as v4
--    (20260908_blend_per_vitola.sql). Only the line lookup changes —
--    both comparisons now match case- and whitespace-insensitively.
--    The child still adopts the line's canonical casing via
--    v_line.brand / v_line.series (unchanged from v4).
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
  where lower(btrim(brand)) = lower(btrim(p_brand))
    and lower(btrim(coalesce(series, ''))) = lower(btrim(coalesce(p_series, '')));

  if not found then
    begin
      insert into cigar_lines (brand, series, community_added, approved)
      values (p_brand, p_series, true, false)
      returning * into v_line;
    exception when unique_violation then
      select * into v_line
      from cigar_lines
      where lower(btrim(brand)) = lower(btrim(p_brand))
        and lower(btrim(coalesce(series, ''))) = lower(btrim(coalesce(p_series, '')));
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
-- select indexname from pg_indexes
--   where tablename = 'cigar_lines' and indexname like 'cigar_lines_brand_series%';
--   -- expect only cigar_lines_brand_series_normalized_key
-- select has_function_privilege('authenticated', 'insert_cigar_to_catalog(text, text, text, numeric, numeric, text, text, text, text, text[], text)', 'execute');  -- t
-- select has_function_privilege('anon', 'insert_cigar_to_catalog(text, text, text, numeric, numeric, text, text, text, text, text[], text)', 'execute');  -- f
-- select lower(btrim(brand)), lower(btrim(coalesce(series, ''))), count(*)
--   from cigar_lines group by 1, 2 having count(*) > 1;  -- 0 rows (still true post-apply)

-- ── Rollback ────────────────────────────────────────────────
-- drop index if exists cigar_lines_brand_series_normalized_key;
-- create unique index if not exists cigar_lines_brand_series_key
--   on cigar_lines (brand, coalesce(series, ''));
-- Re-apply the insert_cigar_to_catalog v4 body from
-- 20260908_blend_per_vitola.sql (exact-match lookup, same signature).
