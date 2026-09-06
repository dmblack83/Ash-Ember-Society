-- Brands index for the catalog landing page.
-- Ranked by member popularity (sum of usage_count, which increments on
-- humidor/wishlist adds); only the cigar count is exposed to the UI.
-- SECURITY INVOKER (default): cigar_catalog RLS applies, so anon
-- callers get zero rows, authenticated members get the full index.
create or replace function public.get_catalog_brands()
returns table (brand text, cigar_count bigint)
language sql
stable
as $$
  select
    brand,
    count(*)::bigint as cigar_count
  from public.cigar_catalog
  where brand is not null and brand <> ''
  group by brand
  order by coalesce(sum(usage_count), 0) desc, brand asc
$$;
