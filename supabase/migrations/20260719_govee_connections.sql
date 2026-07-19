-- Govee sensor connections. One row per user. SERVICE-ROLE ONLY:
-- RLS is enabled with zero policies, so anon/authenticated clients
-- can never read api_key. All access goes through /api/govee/*
-- route handlers and the govee-poll cron via the service client.
create table if not exists govee_connections (
  user_id         uuid primary key references profiles(id) on delete cascade,
  api_key         text not null,
  device_id       text not null,
  sku             text not null,
  device_name     text,
  humidity_min    int  not null default 62,
  humidity_max    int  not null default 72,
  temp_min_f      int  not null default 60,
  temp_max_f      int  not null default 72,
  last_temp_f     numeric,
  last_humidity   numeric,
  last_reading_at timestamptz,
  status          text not null default 'active'
                  check (status in ('active','auth_error','device_missing')),
  alert_state     jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

alter table govee_connections enable row level security;
-- Intentionally NO policies: service-role only.
