-- Migration: blog post reactions (likes) and comments

/* ------------------------------------------------------------------
   blog_post_reactions
   One row per user per post per type (type = 'like' for now).
   ------------------------------------------------------------------ */
create table if not exists blog_post_reactions (
  id         uuid        primary key default gen_random_uuid(),
  post_id    uuid        not null references blog_posts(id) on delete cascade,
  user_id    uuid        not null references profiles(id) on delete cascade,
  type       text        not null default 'like',
  created_at timestamptz not null default now(),
  unique (post_id, user_id, type)
);

alter table blog_post_reactions enable row level security;

create policy "Authenticated users can read all reactions"
  on blog_post_reactions for select
  to authenticated
  using (true);

create policy "Users can insert own reactions"
  on blog_post_reactions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete own reactions"
  on blog_post_reactions for delete
  to authenticated
  using (auth.uid() = user_id);

create index if not exists blog_post_reactions_post_idx on blog_post_reactions (post_id);

/* ------------------------------------------------------------------
   blog_post_comments
   ------------------------------------------------------------------ */
create table if not exists blog_post_comments (
  id         uuid        primary key default gen_random_uuid(),
  post_id    uuid        not null references blog_posts(id) on delete cascade,
  user_id    uuid        not null references profiles(id) on delete cascade,
  content    text        not null,
  created_at timestamptz not null default now()
);

alter table blog_post_comments enable row level security;

create policy "Authenticated users can read all comments"
  on blog_post_comments for select
  to authenticated
  using (true);

create policy "Users can insert own comments"
  on blog_post_comments for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete own comments"
  on blog_post_comments for delete
  to authenticated
  using (auth.uid() = user_id);

create index if not exists blog_post_comments_post_idx on blog_post_comments (post_id);
