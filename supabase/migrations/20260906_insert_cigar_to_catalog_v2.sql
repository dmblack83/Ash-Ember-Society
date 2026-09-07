-- ============================================================
-- insert_cigar_to_catalog v2: create-or-attach line. Same
-- signature as v1 (10 params) so existing clients keep working.
--  - Finds the line by (brand, coalesce(series,'')); creates it
--    from the caller's blend when absent (community, unapproved).
--  - The child copies the LINE's blend, not the caller's — the
--    line is the blend authority. Size fields come from the call.
--  - Never blocks creation. Requires 20260906_cigar_lines.sql.
-- ============================================================

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
  p_filler_countries text[]  default null
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
      -- concurrent create of the same line: attach to the winner
      select * into v_line
      from cigar_lines
      where brand = p_brand
        and coalesce(series, '') = coalesce(p_series, '');
    end;
  end if;

  insert into cigar_catalog (
    source_id, brand, series, format, ring_gauge, length_inches,
    wrapper, wrapper_country, shade, binder_country, filler_countries,
    community_added, approved, usage_count, line_id
  ) values (
    'community-' || gen_random_uuid()::text,
    v_line.brand, v_line.series, p_format, p_ring_gauge, p_length_inches,
    v_line.wrapper, v_line.wrapper_country, v_line.shade,
    v_line.binder_country, v_line.filler_countries,
    true, false, 0, v_line.id
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- New functions grant EXECUTE to PUBLIC by default; this write RPC
-- must not be callable with the anon key. Earlier versions never
-- revoked it either — this closes that hole for the live signature.
revoke execute on function insert_cigar_to_catalog(text, text, text, numeric, numeric, text, text, text, text, text[]) from anon;

-- Stale overloads from earlier migrations (different signatures, so
-- CREATE OR REPLACE never collapsed them) may survive in prod with
-- weaker guards. Drop the two known historical signatures:
drop function if exists insert_cigar_to_catalog(text, text, text, numeric, numeric, text, text);
drop function if exists insert_cigar_to_catalog(text, text, text, text, text, numeric, numeric);

-- ── Verify ──────────────────────────────────────────────────
-- (run as an authenticated test, or inspect after a manual add)
-- select l.brand, l.series, count(c.id) from cigar_lines l
--   join cigar_catalog c on c.line_id = l.id
--   where l.community_added group by 1,2 order by max(l.created_at) desc limit 5;
-- select oidvectortypes(proargtypes) from pg_proc where proname = 'insert_cigar_to_catalog';
--   -- expect exactly ONE row (the 10-param signature)
