-- Safety migration: ensure all blog_posts columns exist even if the
-- table was created before the 20260418 migration (which uses
-- CREATE TABLE IF NOT EXISTS and silently skips on existing tables).

alter table blog_posts
  add column if not exists cover_image_url text,
  add column if not exists excerpt         text,
  add column if not exists body            text,
  add column if not exists synopsis        text,
  add column if not exists source_name     text,
  add column if not exists source_url      text;

-- Ensure the type column exists and has the right constraint.
-- Can't add a check constraint with ADD COLUMN IF NOT EXISTS, so we
-- do it in two safe steps.
alter table blog_posts
  add column if not exists type text not null default 'blog';

-- Add the check constraint only if it doesn't already exist.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'blog_posts_type_check'
      and conrelid = 'blog_posts'::regclass
  ) then
    alter table blog_posts
      add constraint blog_posts_type_check
      check (type in ('blog', 'news_link'));
  end if;
end $$;
