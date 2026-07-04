-- Free-tier humidor cap: 10 → 20 unique cigars (product decision
-- 2026-07-03: free = 20 unique cigars with unlimited quantity each,
-- full lounge access, unlimited burn reports).
--
-- Same trigger as 20260529_humidor_free_tier_limit.sql, threshold
-- only. Wishlist inserts and re-buys of an already-owned cigar_id
-- remain exempt; only NEW distinct cigar_id values count.
--
-- MANUAL APPLY REQUIRED: run in the Supabase SQL editor BEFORE the
-- code change deploys. Order is safe either way but SQL-first means
-- the server is never stricter than the client (in the gap, free
-- users are simply still capped at 10 by the client check).

create or replace function enforce_humidor_free_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_distinct int;
begin
  -- Wishlist inserts bypass the cap entirely.
  if new.is_wishlist then
    return new;
  end if;

  select coalesce(membership_tier, 'free')
    into v_tier
    from profiles
    where id = new.user_id;

  -- Anything other than the literal string 'free' is treated as paid.
  -- This includes the legacy 'premium' tier (now an alias for member).
  if v_tier <> 'free' then
    return new;
  end if;

  select count(distinct cigar_id)
    into v_distinct
    from humidor_items
    where user_id = new.user_id
      and is_wishlist = false
      and cigar_id <> new.cigar_id;

  if v_distinct >= 20 then
    raise exception 'humidor_free_tier_limit'
      using errcode = 'P0001';
  end if;

  return new;
end
$$;

-- Trigger already exists from 20260529; create or replace of the
-- function is sufficient. Verify:
--   select prosrc from pg_proc where proname = 'enforce_humidor_free_limit';
-- Expect: v_distinct >= 20.
