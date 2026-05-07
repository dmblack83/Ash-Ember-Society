-- ============================================================
-- cigar_shade_part2 — extend suggestions + RPC for new shade column
--
-- Builds on 20260506_cigar_shade.sql which added cigar_catalog.shade.
-- This migration:
--   1. Adds shade to cigar_catalog_suggestions so user-submitted
--      catalog rows can carry a shade.
--   2. Recreates insert_cigar_to_catalog with a p_shade parameter,
--      writing into the new column.
--
-- Run in the Supabase SQL editor.
-- ============================================================

alter table cigar_catalog_suggestions
  add column if not exists shade text;

create or replace function insert_cigar_to_catalog(
  p_brand           text,
  p_series          text    default null,
  p_format          text    default null,
  p_ring_gauge      numeric default null,
  p_length_inches   numeric default null,
  p_wrapper         text    default null,
  p_wrapper_country text    default null,
  p_shade           text    default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into cigar_catalog (
    source_id,
    brand,
    series,
    format,
    ring_gauge,
    length_inches,
    wrapper,
    wrapper_country,
    shade,
    community_added,
    approved,
    usage_count
  ) values (
    'community-' || gen_random_uuid()::text,
    p_brand,
    p_series,
    p_format,
    p_ring_gauge,
    p_length_inches,
    p_wrapper,
    p_wrapper_country,
    p_shade,
    true,
    false,
    0
  )
  returning id into v_id;

  return v_id;
end;
$$;
