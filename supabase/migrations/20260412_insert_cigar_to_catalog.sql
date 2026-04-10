-- ============================================================
-- RPC: insert_cigar_to_catalog
-- Inserts a community-added cigar into cigar_catalog and
-- returns its uuid. Security definer so it bypasses RLS.
-- ============================================================

create or replace function insert_cigar_to_catalog(
  p_brand           text,
  p_series          text    default null,
  p_format          text    default null,
  p_ring_gauge      numeric default null,
  p_length_inches   numeric default null,
  p_wrapper         text    default null,
  p_wrapper_country text    default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id   uuid;
  v_name text;
begin
  v_name := array_to_string(
    array_remove(array[p_brand, p_series, p_format], null),
    ' — '
  );

  insert into cigar_catalog (
    source_id,
    brand,
    series,
    name,
    format,
    ring_gauge,
    length_inches,
    wrapper,
    wrapper_country,
    community_added,
    approved,
    usage_count
  ) values (
    'community-' || gen_random_uuid()::text,
    p_brand,
    p_series,
    v_name,
    p_format,
    p_ring_gauge,
    p_length_inches,
    p_wrapper,
    p_wrapper_country,
    true,
    false,
    0
  )
  returning id into v_id;

  return v_id;
end;
$$;
