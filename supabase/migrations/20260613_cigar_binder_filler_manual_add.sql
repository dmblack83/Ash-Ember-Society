-- ============================================================
-- cigar_binder_filler_manual_add
--   Bring the manual "add cigar" write paths up to parity with
--   the "update cigar" flow by persisting binder_country and
--   filler_countries.
--
--   1. cigar_catalog_suggestions gains the two columns so a
--      community-submitted catalog row can carry them.
--   2. insert_cigar_to_catalog gains p_binder_country (text) and
--      p_filler_countries (text[]), written into the existing
--      cigar_catalog columns of the same name.
--
--   cigar_catalog itself is unchanged — both columns already
--   exist (the edit-approve path writes them).
--
--   Run in the Supabase SQL editor.
-- ============================================================

alter table cigar_catalog_suggestions
  add column if not exists binder_country   text,
  add column if not exists filler_countries text[];

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
    binder_country,
    filler_countries,
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
    p_binder_country,
    p_filler_countries,
    true,
    false,
    0
  )
  returning id into v_id;

  return v_id;
end;
$$;
