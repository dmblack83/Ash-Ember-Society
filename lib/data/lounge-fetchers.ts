"use client";

/*
 * Client-side fetcher for the Lounge category feed.
 *
 * Mirrors the composite query previously inline in CategoryFeed's
 * `loadMore` callback (posts + author profiles + liked status +
 * smoke logs + flavor tags + votes). Used by useSWRInfinite — each
 * page index becomes one cache entry; mutations target individual
 * pages or the full slice as needed.
 *
 * Note: the SERVER-side initial-page query in
 * app/(app)/lounge/rooms/[slug]/page.tsx additionally computes
 * `report_number` per smoke log (lifetime author count). That field
 * is intentionally absent here — matching the existing client
 * behaviour where pages 1+ never had it. If it ever needs to be
 * present on dynamically-loaded pages, port `computeReportNumbers`
 * to a client-callable function.
 */

import { createClient }            from "@/utils/supabase/client";
import type { PostItem }           from "@/components/lounge/InlinePost";
import type { SmokeLogData }       from "@/components/lounge/PostDetailClient";

export interface CategoryFeedPage {
  posts:    PostItem[];
  likedIds: string[];
  hasMore:  boolean;
}

interface FetchArgs {
  categoryId: string;
  userId:     string;
  isFeedback: boolean;
  pageIndex:  number;
  pageSize:   number;
}

export async function fetchCategoryFeedPage({
  categoryId,
  userId,
  isFeedback,
  pageIndex,
  pageSize,
}: FetchArgs): Promise<CategoryFeedPage> {
  const supabase = createClient();
  const offset   = pageIndex * pageSize;

  /* ── 1. Posts (excluding pinned) ──────────────────────────────── */
  const { data: rawPosts, error: postsError } = await supabase
    .from("forum_posts")
    .select(
      "id, title, content, created_at, user_id, image_url, is_locked, is_system, smoke_log_id, " +
      "forum_post_likes(count), forum_comments(count)"
    )
    .eq("category_id", categoryId)
    .eq("is_system",   false)
    .neq("is_pinned",  true)
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (postsError) throw new Error(postsError.message);

  type RawPost = {
    id:                string;
    title:             string;
    content:           string;
    created_at:        string;
    user_id:           string | null;
    image_url:         string | null;
    is_locked:         boolean;
    is_system:         boolean;
    smoke_log_id:      string | null;
    forum_post_likes:  { count: number }[];
    forum_comments:    { count: number }[];
  };

  const batch = (rawPosts ?? []) as unknown as RawPost[];
  if (batch.length === 0) {
    return { posts: [], likedIds: [], hasMore: false };
  }

  /* ── 2. Author profiles (city included for verdict-card byline) ─ */
  const authorIds = [...new Set(batch.map((p) => p.user_id).filter(Boolean) as string[])];
  type AuthorEntry = {
    display_name:    string | null;
    avatar_url:      string | null;
    badge:           string | null;
    membership_tier: string | null;
    city:            string | null;
  };
  const nameMap: Record<string, AuthorEntry> = {};
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, badge, membership_tier, city")
      .in("id", authorIds);
    for (const p of (profiles ?? []) as Array<{ id: string } & AuthorEntry>) {
      nameMap[p.id] = {
        display_name:    p.display_name,
        avatar_url:      p.avatar_url,
        badge:           p.badge           ?? null,
        membership_tier: p.membership_tier ?? null,
        city:            p.city            ?? null,
      };
    }
  }

  /* ── 3. Liked status for the viewer ───────────────────────────── */
  const newPostIds = batch.map((p) => p.id);
  const likedSet   = new Set<string>();
  if (newPostIds.length > 0) {
    const { data: likes } = await supabase
      .from("forum_post_likes")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", newPostIds);
    for (const l of (likes ?? []) as { post_id: string }[]) likedSet.add(l.post_id);
  }

  /* ── 4. Smoke logs + flavor tags (verdict card data) ──────────── */
  const smokeLogIds = batch.map((p) => p.smoke_log_id).filter(Boolean) as string[];
  const smokeLogMap: Record<string, SmokeLogData> = {};
  if (smokeLogIds.length > 0) {
    const { data: logs } = await supabase
      .from("smoke_logs")
      .select(`
        id, smoked_at, overall_rating, draw_rating, burn_rating,
        construction_rating, flavor_rating, pairing_drink, pairing_food,
        location, occasion, smoke_duration_minutes, review_text, photo_urls,
        content_video_id, flavor_tag_ids, user_id,
        cigar:cigar_catalog(brand, series, format),
        burn_report:burn_reports(thirds_enabled, third_beginning, third_middle, third_end)
      `)
      .in("id", smokeLogIds);

    const rawLogs = (logs ?? []) as Array<
      Record<string, unknown> & {
        id:               string;
        flavor_tag_ids:   string[] | null;
        user_id:          string | null;
        burn_report:      Array<Record<string, unknown>> | null;
      }
    >;

    const allTagIds = [...new Set(rawLogs.flatMap((l) => l.flavor_tag_ids ?? []))];
    const tagNameMap: Record<string, string> = {};
    if (allTagIds.length > 0) {
      const { data: tags } = await supabase
        .from("flavor_tags")
        .select("id, name")
        .in("id", allTagIds);
      for (const t of (tags ?? []) as { id: string; name: string }[]) tagNameMap[t.id] = t.name;
    }

    for (const log of rawLogs) {
      const author = log.user_id ? nameMap[log.user_id as string] : null;
      smokeLogMap[log.id] = {
        ...(log as unknown as SmokeLogData),
        flavor_tag_names: (log.flavor_tag_ids ?? [])
          .map((id) => tagNameMap[id])
          .filter(Boolean) as string[],
        author_display_name: author?.display_name ?? null,
        author_city:         author?.city         ?? null,
      };
    }
  }

  /* ── 5. Vote tallies (only meaningful for feedback category) ──── */
  const voteMap: Record<string, { upvotes: number; downvotes: number; userVote: 0 | 1 | -1 }> = {};
  if (isFeedback && newPostIds.length > 0) {
    const { data: votes } = await supabase
      .from("forum_post_votes")
      .select("post_id, user_id, value")
      .in("post_id", newPostIds);
    for (const v of (votes ?? []) as { post_id: string; user_id: string; value: number }[]) {
      const cur = voteMap[v.post_id] ?? { upvotes: 0, downvotes: 0, userVote: 0 as 0 | 1 | -1 };
      if (v.value === 1)  cur.upvotes   += 1;
      if (v.value === -1) cur.downvotes += 1;
      if (v.user_id === userId) cur.userVote = v.value as 1 | -1;
      voteMap[v.post_id] = cur;
    }
  }

  /* ── 6. Normalize ─────────────────────────────────────────────── */
  const posts: PostItem[] = batch.map((p) => {
    const v = voteMap[p.id] ?? { upvotes: 0, downvotes: 0, userVote: 0 as 0 | 1 | -1 };
    return {
      id:            p.id,
      title:         p.title,
      content:       p.content,
      created_at:    p.created_at,
      user_id:       p.user_id,
      author:        p.user_id ? (nameMap[p.user_id] ?? null) : null,
      like_count:    p.forum_post_likes[0]?.count ?? 0,
      comment_count: p.forum_comments[0]?.count   ?? 0,
      image_url:     p.image_url ?? null,
      is_locked:     p.is_locked,
      is_system:     p.is_system,
      smoke_log:     p.smoke_log_id ? (smokeLogMap[p.smoke_log_id] ?? null) : null,
      upvotes:       v.upvotes,
      downvotes:     v.downvotes,
      user_vote:     v.userVote,
    };
  });

  return {
    posts,
    likedIds: [...likedSet],
    hasMore:  batch.length >= pageSize,
  };
}
