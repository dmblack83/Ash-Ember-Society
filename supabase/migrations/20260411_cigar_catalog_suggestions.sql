-- ============================================================
-- Cigar catalog suggestions + find_or_create_cigar helper
-- Run in the Supabase SQL editor
-- ============================================================

-- cigar_catalog_suggestions ----------------------------------
create table if not exists cigar_catalog_suggestions (
  id              uuid primary key default gen_random_uuid(),
  suggested_by    uuid not null references profiles(id) on delete cascade,
  brand           text,
  series          text,
  name            text not null,
  format          text,
  ring_gauge      numeric,
  length_inches   numeric,
  wrapper         text,
  wrapper_country text,
  status          text not null default 'pending',
  created_at      timestamptz not null default now()
);

alter table cigar_catalog_suggestions enable row level security;

-- Users can insert their own suggestions
create policy "users can insert their own suggestions"
  on cigar_catalog_suggestions for insert
  to authenticated
  with check (auth.uid() = suggested_by);

-- Users can read their own suggestions
create policy "users can read their own suggestions"
  on cigar_catalog_suggestions for select
  to authenticated
  using (auth.uid() = suggested_by);

-- find_or_create_cigar ---------------------------------------
-- Security definer so it can insert into cigars regardless of
-- the caller's RLS context.
create or replace function find_or_create_cigar(
  p_brand         text,
  p_line          text    default null,
  p_vitola        text    default null,
  p_wrapper       text    default null,
  p_wrapper_country text  default null,
  p_ring_gauge    numeric default null,
  p_length_inches numeric default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id   uuid;
  v_name text;
begin
  -- Try to find existing cigar by brand + line + vitola
  select id into v_id
  from cigars
  where brand   = p_brand
    and line    = coalesce(p_line,   '')
    and vitola  = coalesce(p_vitola, '')
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  -- Build a display name
  v_name := array_to_string(
    array_remove(array[p_brand, p_line, p_vitola], null),
    ' — '
  );

  -- Create new cigar row
  insert into cigars (
    brand, line, name, vitola, strength,
    wrapper, country, ring_gauge, length_inches
  ) values (
    p_brand,
    coalesce(p_line,   ''),
    v_name,
    coalesce(p_vitola, ''),
    'medium',
    p_wrapper,
    p_wrapper_country,
    p_ring_gauge,
    p_length_inches
  )
  returning id into v_id;

  return v_id;
end;
$$;
