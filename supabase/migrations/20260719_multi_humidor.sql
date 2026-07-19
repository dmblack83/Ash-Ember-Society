-- Multi-humidor: containers table + per-humidor sensor block.
-- ORDERED manual-apply. Steps 1-5 are additive/reversible; step 6
-- (govee_connections column drop) is the ONLY destructive step and
-- runs LAST, after the verify queries at the bottom pass.

-- 1. humidors ------------------------------------------------------
create table if not exists humidors (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  name            text not null,
  type            text not null default 'humidor'
                  check (type in ('humidor','tupperdor','cooler','travel')),
  is_default      boolean not null default false,
  -- sensor block (no secrets; api key stays in govee_connections)
  device_id       text,
  sku             text,
  device_name     text,
  humidity_min    int  not null default 62,
  humidity_max    int  not null default 72,
  temp_min_f      int  not null default 60,
  temp_max_f      int  not null default 72,
  last_temp_f     numeric,
  last_humidity   numeric,
  last_reading_at timestamptz,
  sensor_status   text check (sensor_status in ('active','auth_error','device_missing')),
  alert_state     jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  constraint humidors_humidity_range check (
    humidity_min >= 30 and humidity_max <= 90 and humidity_min < humidity_max),
  constraint humidors_temp_range check (
    temp_min_f >= 40 and temp_max_f <= 90 and temp_min_f < temp_max_f)
);

create unique index if not exists humidors_one_default_per_user
  on humidors (user_id) where is_default;
create index if not exists humidors_user_idx on humidors (user_id);

alter table humidors enable row level security;
drop policy if exists humidors_select on humidors;
create policy humidors_select on humidors for select using (auth.uid() = user_id);
drop policy if exists humidors_insert on humidors;
create policy humidors_insert on humidors for insert with check (auth.uid() = user_id);
drop policy if exists humidors_update on humidors;
create policy humidors_update on humidors for update using (auth.uid() = user_id);
drop policy if exists humidors_delete on humidors;
create policy humidors_delete on humidors for delete using (auth.uid() = user_id);

-- 2. backfill: one default humidor per existing user, copying the
--    sensor block from govee_connections where present -------------
insert into humidors (user_id, name, is_default,
                      device_id, sku, device_name,
                      humidity_min, humidity_max, temp_min_f, temp_max_f,
                      last_temp_f, last_humidity, last_reading_at,
                      sensor_status, alert_state)
select u.user_id, 'My Humidor', true,
       g.device_id, g.sku, g.device_name,
       coalesce(g.humidity_min, 62), coalesce(g.humidity_max, 72),
       coalesce(g.temp_min_f, 60),  coalesce(g.temp_max_f, 72),
       g.last_temp_f, g.last_humidity, g.last_reading_at,
       g.status, coalesce(g.alert_state, '{}'::jsonb)
from (
  select distinct user_id from humidor_items
  union
  select user_id from govee_connections
) u
left join govee_connections g on g.user_id = u.user_id
where not exists (
  select 1 from humidors h2 where h2.user_id = u.user_id and h2.is_default
)
on conflict do nothing;

-- 3. humidor_items.humidor_id + backfill non-wishlist rows ---------
alter table humidor_items
  add column if not exists humidor_id uuid references humidors(id) on delete restrict;

update humidor_items hi
set humidor_id = h.id
from humidors h
where h.user_id = hi.user_id and h.is_default
  and hi.is_wishlist = false and hi.humidor_id is null;

create index if not exists humidor_items_humidor_idx
  on humidor_items (humidor_id) where humidor_id is not null;

-- 4. free-tier limit: 1 humidor (mirrors enforce_humidor_free_limit)
create or replace function enforce_humidors_free_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tier text;
  v_count int;
begin
  select coalesce(membership_tier, 'free') into v_tier
    from profiles where id = new.user_id;
  if v_tier <> 'free' then return new; end if;
  select count(*) into v_count from humidors where user_id = new.user_id;
  if v_count >= 1 then
    raise exception 'humidors_free_tier_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists humidors_free_limit_check on humidors;
create trigger humidors_free_limit_check
  before insert on humidors for each row
  execute function enforce_humidors_free_limit();

-- default humidor is never deletable, even via direct client DELETE
create or replace function prevent_default_humidor_delete()
returns trigger language plpgsql as $$
begin
  if old.is_default then
    raise exception 'cannot_delete_default' using errcode = 'P0001';
  end if;
  return old;
end $$;

drop trigger if exists humidors_protect_default on humidors;
create trigger humidors_protect_default
  before delete on humidors for each row
  execute function prevent_default_humidor_delete();

-- 5. atomic move-then-delete (SECURITY INVOKER: caller's RLS applies)
create or replace function delete_humidor(p_humidor_id uuid, p_dest_id uuid)
returns void language plpgsql security invoker as $$
declare
  v_user uuid;
  v_default boolean;
begin
  select user_id, is_default into v_user, v_default
    from humidors where id = p_humidor_id;
  if v_user is null then raise exception 'humidor_not_found' using errcode = 'P0001'; end if;
  if v_default then raise exception 'cannot_delete_default' using errcode = 'P0001'; end if;
  if p_dest_id = p_humidor_id
     or not exists (select 1 from humidors where id = p_dest_id and user_id = v_user) then
    raise exception 'invalid_destination' using errcode = 'P0001';
  end if;
  update humidor_items set humidor_id = p_dest_id where humidor_id = p_humidor_id;
  delete from humidors where id = p_humidor_id;
end $$;

-- ==================================================================
-- VERIFY before running step 6 (all must look right):
--   select count(*) from humidors;                          -- one per active user
--   select count(*) from humidors where is_default;         -- same number
--   select count(*) from humidor_items
--     where is_wishlist = false and humidor_id is null;     -- 0
--   select user_id, device_id, last_humidity from humidors
--     where device_id is not null;                          -- Dave's sensor moved
-- ==================================================================

-- 6. govee_connections slims to the account key (DESTRUCTIVE, LAST)
alter table govee_connections
  drop column if exists device_id,
  drop column if exists sku,
  drop column if exists device_name,
  drop column if exists humidity_min,
  drop column if exists humidity_max,
  drop column if exists temp_min_f,
  drop column if exists temp_max_f,
  drop column if exists last_temp_f,
  drop column if exists last_humidity,
  drop column if exists last_reading_at,
  drop column if exists alert_state;
-- keep: user_id, api_key, status, created_at
