-- CRIT-4 + HIGH-5: Add auth.uid() guards to SECURITY DEFINER RPCs
--
-- increment_likes / decrement_likes / increment_comments previously
-- accepted any call without checking the caller's identity. Any
-- authenticated user could inflate or deflate counts on any post.
--
-- find_or_create_cigar and insert_cigar_to_catalog previously had no
-- caller identity check, allowing any authenticated user to insert
-- arbitrary rows into cigar_catalog.
--
-- MANUAL APPLY REQUIRED: run this in the Supabase SQL editor on prod.

-- ── Lounge post like/comment counters ────────────────────────────────

create or replace function increment_likes(post_id uuid)
returns void language plpgsql security definer as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update posts p set likes_count = p.likes_count + 1
  where p.id = increment_likes.post_id;
end;
$$;

create or replace function decrement_likes(post_id uuid)
returns void language plpgsql security definer as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  -- Only decrement if this user actually liked the post, to prevent
  -- count manipulation by users who never liked it.
  if not exists (
    select 1 from forum_post_likes fpl
    where fpl.post_id = decrement_likes.post_id
      and fpl.user_id = auth.uid()
  ) then
    raise exception 'like not found';
  end if;
  update posts p set likes_count = greatest(p.likes_count - 1, 0)
  where p.id = decrement_likes.post_id;
end;
$$;

create or replace function increment_comments(post_id uuid)
returns void language plpgsql security definer as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update posts p set comments_count = p.comments_count + 1
  where p.id = increment_comments.post_id;
end;
$$;

-- ── Cigar catalog insert helpers ──────────────────────────────────────
-- NOTE: insert_cigar_to_catalog has two live overloads (p_name was
-- dropped in 20260502; p_shade was added in 20260506_cigar_shade_part2).
-- Both need the auth guard.

create or replace function insert_cigar_to_catalog(
  p_brand           text,
  p_series          text    default null,
  p_format          text    default null,
  p_ring_gauge      numeric default null,
  p_length_inches   numeric default null,
  p_wrapper         text    default null,
  p_wrapper_country text    default null
)
returns uuid language plpgsql security definer as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into cigar_catalog (
    source_id, brand, series, format, ring_gauge, length_inches,
    wrapper, wrapper_country, community_added, approved, usage_count
  ) values (
    'community-' || gen_random_uuid()::text,
    p_brand, p_series, p_format, p_ring_gauge, p_length_inches,
    p_wrapper, p_wrapper_country, true, false, 0
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function insert_cigar_to_catalog(
  p_brand           text,
  p_series          text    default null,
  p_format          text    default null,
  p_ring_gauge      numeric default null,
  p_length_inches   numeric default null,
  p_wrapper         text    default null,
  p_wrapper_country text    default null,
  p_shade           text    default null
)
returns uuid language plpgsql security definer as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into cigar_catalog (
    source_id, brand, series, format, ring_gauge, length_inches,
    wrapper, wrapper_country, shade, community_added, approved, usage_count
  ) values (
    'community-' || gen_random_uuid()::text,
    p_brand, p_series, p_format, p_ring_gauge, p_length_inches,
    p_wrapper, p_wrapper_country, p_shade, true, false, 0
  )
  returning id into v_id;
  return v_id;
end;
$$;
