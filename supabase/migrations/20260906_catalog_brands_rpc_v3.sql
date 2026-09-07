-- ============================================================
-- get_catalog_brands v3: cigar_count now counts LINES per brand
-- (distinct coalesce(series,'')), matching the consolidated
-- catalog. Ranking by member adds (humidor_items) unchanged
-- from v2. Same name/signature — clients need no change.
-- ============================================================

create or replace function public.get_catalog_brands()
returns table (brand text, cigar_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.brand,
    count(distinct coalesce(c.series, ''))::bigint as cigar_count
  from public.cigar_catalog c
  left join public.humidor_items h on h.cigar_id = c.id
  where c.brand is not null and c.brand <> ''
  group by c.brand
  order by count(h.id) desc, c.brand asc
$$;

-- Default EXECUTE goes to PUBLIC — revoking only anon leaves that
-- path open. Revoke both, then grant back the intended callers.
revoke execute on function public.get_catalog_brands() from public, anon;
grant execute on function public.get_catalog_brands() to authenticated, service_role;

-- ── Verify ──────────────────────────────────────────────────
-- select * from get_catalog_brands() limit 5;
--   -- cigar_count per brand should drop vs v2 (lines, not sizes)
