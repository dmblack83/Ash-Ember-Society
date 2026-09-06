-- Brands index for the catalog landing page, v2.
--
-- v1 ranked by sum(usage_count), but usage_count is flat in prod (seeded
-- at zero; the client-side best-effort bump is blocked by RLS), which
-- degenerated the ordering to alphabetical. v2 ranks by actual member
-- adds: humidor_items rows per brand (humidor + wishlist), which is live
-- data that updates itself on every add.
--
-- SECURITY DEFINER: aggregating across ALL users' humidor_items requires
-- bypassing the own-rows RLS policy. The function exposes only brand
-- names + catalog cigar counts (ordering is popularity; no per-user or
-- per-brand numbers leave the database). Execution is revoked from anon
-- to match the catalog's anon-read hardening.
create or replace function public.get_catalog_brands()
returns table (brand text, cigar_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.brand,
    count(distinct c.id)::bigint as cigar_count
  from public.cigar_catalog c
  left join public.humidor_items h on h.cigar_id = c.id
  where c.brand is not null and c.brand <> ''
  group by c.brand
  order by count(h.id) desc, c.brand asc
$$;

revoke execute on function public.get_catalog_brands() from anon;
