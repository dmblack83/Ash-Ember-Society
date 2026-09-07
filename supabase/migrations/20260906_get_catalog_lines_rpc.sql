-- ============================================================
-- get_catalog_lines: line-grouped catalog browse. Groups
-- cigar_catalog by (brand, coalesce(series,'')). A line matches
-- a search when ANY single child matches ALL tokens against
-- search_text (same AND semantics as today's client fetcher).
-- size_count counts ALL children of the line, not just matching
-- ones (the "N vitolas" chip is the line's true size count).
-- rep_id = the top-usage MATCHING child, so tapping a search
-- result preselects a size that matched.
-- ============================================================

create or replace function get_catalog_lines(
  p_search text    default null,
  p_brand  text    default null,
  p_offset integer default 0,
  p_limit  integer default 20
)
returns table (
  brand       text,
  series      text,
  wrapper     text,
  shade       text,
  size_count  bigint,
  rep_id      uuid,
  image_url   text,
  total_usage bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with kids as (
    select c.*
    from cigar_catalog c
    where c.brand is not null
      and (p_brand is null or c.brand = p_brand)
      and (
        p_search is null or trim(p_search) = '' or
        (select bool_and(c.search_text ilike '%' || t.tok || '%')
         from unnest(regexp_split_to_array(lower(trim(p_search)), '\s+')) as t(tok))
      )
  ),
  grouped as (
    select
      k.brand,
      coalesce(k.series, '') as gseries,
      (array_agg(k.id        order by k.usage_count desc, k.id))[1] as rep_id,
      (array_agg(k.wrapper   order by k.usage_count desc, k.id))[1] as wrapper,
      (array_agg(k.shade     order by k.usage_count desc, k.id))[1] as shade,
      (array_agg(k.image_url order by (k.image_url is null), k.usage_count desc, k.id))[1] as image_url,
      sum(k.usage_count) as total_usage
    from kids k
    group by k.brand, coalesce(k.series, '')
  )
  select
    g.brand,
    nullif(g.gseries, '') as series,
    g.wrapper,
    g.shade,
    (select count(*) from cigar_catalog c2
      where c2.brand = g.brand and coalesce(c2.series, '') = g.gseries) as size_count,
    g.rep_id,
    g.image_url,
    g.total_usage
  from grouped g
  order by g.total_usage desc, g.brand asc, g.gseries asc
  offset p_offset limit p_limit
$$;

revoke execute on function get_catalog_lines(text, text, integer, integer) from anon;

-- ── Verify ──────────────────────────────────────────────────
-- select count(*) from get_catalog_lines(null, null, 0, 2000);
--   -- ≈ distinct (brand, coalesce(series,'')) count (~1,717 on seed)
-- select * from get_catalog_lines('hemingway', null, 0, 5);
-- select * from get_catalog_lines(null, 'Arturo Fuente', 0, 50);
