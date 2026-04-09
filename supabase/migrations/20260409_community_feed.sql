-- ============================================================
-- Community feed tables
-- Run in the Supabase SQL editor or via supabase db push
-- ============================================================

-- posts -------------------------------------------------------
create table if not exists posts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  content         text not null,
  image_url       text,
  cigar_name      text,
  cigar_brand     text,
  shop_id         uuid references shops(id) on delete set null,
  likes_count     integer not null default 0,
  comments_count  integer not null default 0,
  created_at      timestamptz not null default now()
);

alter table posts enable row level security;

create policy "authenticated users can read posts"
  on posts for select to authenticated using (true);

create policy "users can insert their own posts"
  on posts for insert to authenticated with check (auth.uid() = user_id);

create policy "users can update their own posts"
  on posts for update to authenticated using (auth.uid() = user_id);

create policy "users can delete their own posts"
  on posts for delete to authenticated using (auth.uid() = user_id);

-- post_likes --------------------------------------------------
create table if not exists post_likes (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references posts(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (post_id, user_id)
);

alter table post_likes enable row level security;

create policy "authenticated users can read likes"
  on post_likes for select to authenticated using (true);

create policy "users can manage their own likes"
  on post_likes for insert to authenticated with check (auth.uid() = user_id);

create policy "users can delete their own likes"
  on post_likes for delete to authenticated using (auth.uid() = user_id);

-- post_comments -----------------------------------------------
create table if not exists post_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references posts(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now()
);

alter table post_comments enable row level security;

create policy "authenticated users can read comments"
  on post_comments for select to authenticated using (true);

create policy "users can insert their own comments"
  on post_comments for insert to authenticated with check (auth.uid() = user_id);

create policy "users can delete their own comments"
  on post_comments for delete to authenticated using (auth.uid() = user_id);

-- Increment / decrement helpers (called via rpc) --------------
create or replace function increment_likes(post_id uuid)
returns void language sql security definer as $$
  update posts set likes_count = likes_count + 1 where id = post_id;
$$;

create or replace function decrement_likes(post_id uuid)
returns void language sql security definer as $$
  update posts set likes_count = greatest(likes_count - 1, 0) where id = post_id;
$$;

create or replace function increment_comments(post_id uuid)
returns void language sql security definer as $$
  update posts set comments_count = comments_count + 1 where id = post_id;
$$;
