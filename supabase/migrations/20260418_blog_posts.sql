-- Migration: blog_posts table
-- Stores both editorial blog posts (full markdown body) and
-- curated news links (synopsis + external source URL).

create table if not exists blog_posts (
  id              uuid primary key default gen_random_uuid(),

  -- "blog" = full markdown article   |   "news_link" = curated external link
  type            text not null default 'blog'
                    check (type in ('blog', 'news_link')),

  title           text not null,
  cover_image_url text,

  -- Blog-post fields
  excerpt         text,    -- 1-2 sentence teaser shown on card
  body            text,    -- full markdown body

  -- News-link fields
  synopsis        text,    -- multi-sentence summary shown in sheet
  source_name     text,    -- e.g. "Cigar Aficionado"
  source_url      text,    -- external URL opened in new tab

  published_at    timestamptz,    -- null = draft (not visible to users)
  created_at      timestamptz not null default now()
);

-- Row-level security
alter table blog_posts enable row level security;

-- Anyone (including anonymous visitors) can read published posts
create policy "Published blog posts are publicly readable"
  on blog_posts
  for select
  using (
    published_at is not null
    and published_at <= now()
  );

-- Indexes
create index if not exists blog_posts_published_at_idx
  on blog_posts (published_at desc)
  where published_at is not null;
