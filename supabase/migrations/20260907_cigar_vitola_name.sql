-- ============================================================
-- Vitola name: bring back cigar_catalog.name as a CHILD-level
-- field (the marketing name of one vitola: "King B", "Queen B",
-- "Short Story"). The old name column was dropped in 20260421 as
-- unused; the seed then stuffed these names into format/series,
-- which is the pollution the admin editor cleans up. Model:
--   line  (parent) = brand + series ("Chateau Fuente Sun Grown")
--   child (vitola) = name? + format/shape + ring x length
--
-- Also: search_text must cover the name (searching "king b" should
-- find the vitola). Generated columns can't be altered, so it is
-- dropped and recreated with name included; its trigram index goes
-- with it and is recreated. And insert_cigar_to_catalog gains
-- p_name (11th param, default null - existing callers unaffected).
-- Manual-apply in the Supabase SQL editor.
-- ============================================================

alter table cigar_catalog
  add column if not exists name text;

-- Recreate search_text with name included (immutable exprs only:
-- || + coalesce, NOT concat_ws - see 20260627).
alter table cigar_catalog drop column if exists search_text;
alter table cigar_catalog
  add column search_text text
  generated always as (
    lower(
      coalesce(brand, '')           || ' ' ||
      coalesce(series, '')          || ' ' ||
      coalesce(name, '')            || ' ' ||
      coalesce(format, '')          || ' ' ||
      coalesce(wrapper, '')         || ' ' ||
      coalesce(wrapper_country, '') || ' ' ||
      coalesce(shade, '')           || ' ' ||
      coalesce(ring_gauge::text, '')    || ' ' ||
      coalesce(length_inches::text, '')
    )
  ) stored;

create index if not exists cigar_catalog_search_text_trgm
  on cigar_catalog using gin (search_text gin_trgm_ops);

-- insert v3: same as v2 plus p_name written to the child row.
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
      insert into cigar_lines
        (brand, series, wrapper, shade, wrapper_country,
         binder_country, filler_countries, community_added, approved)
      values
        (p_brand, p_series, p_wrapper, p_shade, p_wrapper_country,
         p_binder_country, p_filler_countries, true, false)
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
    v_line.wrapper, v_line.wrapper_country, v_line.shade,
    v_line.binder_country, v_line.filler_countries,
    true, false, 0, v_line.id
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- The 10-param v2 signature is replaced by this 11-param one only
-- if the arg types differ; they do (extra text param), so drop the
-- old overload and re-secure the new one.
drop function if exists insert_cigar_to_catalog(text, text, text, numeric, numeric, text, text, text, text, text[]);

revoke execute on function insert_cigar_to_catalog(text, text, text, numeric, numeric, text, text, text, text, text[], text) from public, anon;
grant execute on function insert_cigar_to_catalog(text, text, text, numeric, numeric, text, text, text, text, text[], text) to authenticated, service_role;

-- ── Verify ──────────────────────────────────────────────────
-- select count(*) from cigar_catalog where search_text is null;  -- 0 (regenerated)
-- select oidvectortypes(proargtypes) from pg_proc where proname = 'insert_cigar_to_catalog';
--   -- exactly ONE row: text, text, text, numeric, numeric, text, text, text, text, text[], text
-- select has_function_privilege('anon', 'insert_cigar_to_catalog(text,text,text,numeric,numeric,text,text,text,text,text[],text)', 'execute');
--   -- expect f
-- select search_text from cigar_catalog limit 1;  -- includes the name slot

-- ── Rollback ────────────────────────────────────────────────
-- (recreate v2 from 20260906_insert_cigar_to_catalog_v2.sql, then:)
-- drop function if exists insert_cigar_to_catalog(text, text, text, numeric, numeric, text, text, text, text, text[], text);
-- alter table cigar_catalog drop column if exists search_text;
-- alter table cigar_catalog drop column if exists name;
-- (then re-add search_text from 20260627_cigar_catalog_search_text.sql)
