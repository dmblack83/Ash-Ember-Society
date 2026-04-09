-- ============================================================
-- Shop check-ins table
-- Run in the Supabase SQL editor or via supabase db push
-- ============================================================

create table if not exists shop_checkins (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references shops(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

alter table shop_checkins enable row level security;

create policy "authenticated users can read all checkins"
  on shop_checkins for select to authenticated using (true);

create policy "users can insert their own checkins"
  on shop_checkins for insert to authenticated with check (auth.uid() = user_id);

create policy "users can delete their own checkins"
  on shop_checkins for delete to authenticated using (auth.uid() = user_id);
