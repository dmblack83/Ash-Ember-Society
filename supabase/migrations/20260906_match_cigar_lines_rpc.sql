-- ============================================================
-- match_cigar_lines: fuzzy line match for the manual-add dupe
-- check. Trigram similarity of "brand series" against grouped
-- cigar_catalog (works pre- and post-backfill; groups ≡ lines).
-- Returns the single best group above threshold as one row per
-- child, with line meta duplicated per row (client reshapes).
-- Threshold 0.5 is a starting point — tune against prod via the
-- audit script's near-match table. Must catch
-- "Gran Reserve" -> "Gran Reserva".
-- ============================================================

create or replace function match_cigar_lines(
  p_brand  text,
  p_series text default null
)
returns table (
  similarity           real,
  brand                text,
  series               text,
  wrapper              text,
  shade                text,
  wrapper_country      text,
  binder_country       text,
  filler_countries     text[],
  child_id             uuid,
  child_format         text,
  child_ring_gauge     numeric,
  child_length_inches  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    select distinct
      c.brand,
      coalesce(c.series, '') as gseries,
      similarity(
        lower(c.brand || ' ' || coalesce(c.series, '')),
        lower(trim(p_brand || ' ' || coalesce(p_series, '')))
      ) as sim
    from cigar_catalog c
    where c.brand is not null
    order by sim desc
    limit 1
  ),
  meta as (
    select c.wrapper, c.shade, c.wrapper_country, c.binder_country,
           c.filler_countries
    from cigar_catalog c
    join best b on c.brand = b.brand and coalesce(c.series, '') = b.gseries
    order by c.usage_count desc, c.id
    limit 1
  )
  select b.sim, b.brand, nullif(b.gseries, ''),
         m.wrapper, m.shade, m.wrapper_country, m.binder_country,
         m.filler_countries,
         c.id, c.format, c.ring_gauge, c.length_inches
  from best b
  cross join meta m
  join cigar_catalog c
    on c.brand = b.brand and coalesce(c.series, '') = b.gseries
  where b.sim >= 0.5
  order by c.ring_gauge nulls last, c.length_inches nulls last, c.id
$$;

revoke execute on function match_cigar_lines(text, text) from anon;

-- ── Verify ──────────────────────────────────────────────────
-- select distinct brand, series, similarity
--   from match_cigar_lines('Arturo Fuente', 'Gran Reserve');
--   -- expect the Gran Reserva line with similarity > 0.5
-- select count(*) from match_cigar_lines('Zzzz', 'Qqqq');  -- 0
