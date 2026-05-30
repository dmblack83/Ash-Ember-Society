-- Enforce free-tier humidor cap (10 unique cigars per user).
-- Wishlist inserts are exempt. Adding another batch of an already-owned
-- cigar (same cigar_id) is exempt — only NEW distinct cigar_id values
-- count against the cap.
--
-- NOTE: assigned_badges (founder / beta_tester → member) is NOT checked here.
-- Those accounts are rare and manually administered. If a real user is
-- affected, extend the trigger to also query assigned_badges. See
-- lib/membership.ts getMembershipTier() for the client-side rule.
--
-- NOTE: errcode P0001 is the generic plpgsql exception code. The caller
-- (lib/humidor/add-item.ts) disambiguates by matching the message text
-- 'humidor_free_tier_limit'. If another P0001 raise is added to this
-- table's trigger stack later, switch to a custom SQLSTATE.

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

  if v_distinct >= 10 then
    raise exception 'humidor_free_tier_limit'
      using errcode = 'P0001';
  end if;

  return new;
end
$$;

drop trigger if exists humidor_free_limit_check on humidor_items;
create trigger humidor_free_limit_check
  before insert on humidor_items
  for each row execute function enforce_humidor_free_limit();
