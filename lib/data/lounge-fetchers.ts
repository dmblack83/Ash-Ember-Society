"use client";

/*
 * Client-side fetcher for the unified Lounge feed.
 *
 * Composite query (posts + author profiles + liked status + smoke
 * logs + flavor tags + votes). Used by useSWRInfinite — each page
 * index becomes one cache entry; mutations target individual pages
 * or the full slice as needed.
 *
 * Note: the SERVER-side initial-page query in
 * app/(app)/lounge/_islands.tsx additionally computes `report_number`
 * per smoke log (lifetime author count). That field is intentionally
 * absent here — matching the existing client behaviour where pages
 * 1+ never had it. If it ever needs to be present on dynamically-loaded
 * pages, port `computeReportNumbers` to a client-callable function.
 */

import { createClient }            from "@/utils/supabase/client";
import type { PostItem }           from "@/components/lounge/InlinePost";
import type { SmokeLogData }       from "@/components/lounge/PostDetailClient";
import type { Comment }            from "@/components/lounge/PostDetailClient";
import { log }                     from "@/lib/log";

/* ── Feedback-card post shape returned by fetchFeedbackPosts below. */
export interface FeedbackPost {
  id:              string;
  title:           string;
  created_at:      string;
  user_id:         string | null;
  display_name:    string | null;
  avatar_url:      string | null;
  badge:           string | null;
  membership_tier: string | null;
  upvotes:         number;
  downvotes:       number;
  comment_count:   number;
  user_vote:       1 | -1 | 0;
}

export interface CategoryFeedPage {
  posts:    PostItem[];
  likedIds: string[];
  hasMore:  boolean;
}

export type LoungeFilter = "all" | "mine" | "open" | "closed";
export type LoungeSort   = "new" | "hot";

/* Reorder DB rows to match a ranked id list (the hot RPC returns ids
   in rank order; the follow-up .in() fetch does not preserve it). */
export function orderByIds<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as T[];
}

interface FetchLoungeFeedArgs {
  /* null = the unified All feed (no category filter). */
  categoryId:         string | null;
  /* Product Feedback category id — vote tallies are fetched for posts
     in this category regardless of which chip is active. */
  feedbackCategoryId: string | null;
  userId:             string;
  pageIndex:          number;
  pageSize:           number;
  filter?:            LoungeFilter;
  sort?:              LoungeSort;
}

const POST_SELECT =
  "id, title, content, created_at, user_id, category_id, image_url, is_locked, is_system, smoke_log_id, status, " +
  "forum_post_likes(count), forum_comments(count)";

export async function fetchLoungeFeedPage({
  categoryId,
  feedbackCategoryId,
  userId,
  pageIndex,
  pageSize,
  filter = "all",
  sort   = "new",
}: FetchLoungeFeedArgs): Promise<CategoryFeedPage> {
  const supabase = createClient();
  const offset   = pageIndex * pageSize;

  type RawPost = {
    id:                string;
    title:             string;
    content:           string;
    created_at:        string;
    user_id:           string | null;
    category_id:       string | null;
    image_url:         string | null;
    is_locked:         boolean;
    is_system:         boolean;
    smoke_log_id:      string | null;
    status:            string | null;
    forum_post_likes:  { count: number }[];
    forum_comments:    { count: number }[];
  };

  /* ── 1. Posts (excluding pinned) ──────────────────────────────── */
  let batch: RawPost[] = [];

  let usedHot = false;
  if (sort === "hot") {
    /* Hot ranking lives in the get_hot_posts RPC (comment count over
       the trailing 7 days, tie-break created_at desc). If the RPC is
       missing (manual SQL not applied yet) fall back to New — same
       pattern as get_report_numbers. */
    const { data: hotRows, error: hotError } = await supabase.rpc("get_hot_posts", {
      p_category_id: categoryId,
      p_limit:       pageSize,
      p_offset:      offset,
    });
    if (!hotError && hotRows) {
      usedHot = true;
      const ids = (hotRows as { post_id: string }[]).map((r) => r.post_id);
      if (ids.length === 0) return { posts: [], likedIds: [], hasMore: false };
      const { data: rows, error } = await supabase
        .from("forum_posts")
        .select(POST_SELECT)
        .in("id", ids);
      if (error) throw new Error(error.message);
      batch = orderByIds((rows ?? []) as unknown as RawPost[], ids);
    } else if (hotError) {
      log.warn({
        scope:   "lounge-hot-fallback",
        message: "get_hot_posts RPC unavailable, falling back to newest-first",
        error:   hotError,
      });
    }
  }

  if (!usedHot) {
    let postsQuery = supabase
      .from("forum_posts")
      .select(POST_SELECT)
      .eq("is_system", false)
      .neq("is_pinned", true);

    if (categoryId)          postsQuery = postsQuery.eq("category_id", categoryId);
    if (filter === "mine")   postsQuery = postsQuery.eq("user_id", userId);
    if (filter === "open")   postsQuery = postsQuery.eq("status",  "open");
    if (filter === "closed") postsQuery = postsQuery.eq("status",  "closed");

    const { data: rawPosts, error: postsError } = await postsQuery
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (postsError) throw new Error(postsError.message);
    batch = (rawPosts ?? []) as unknown as RawPost[];
  }

  if (batch.length === 0) {
    return { posts: [], likedIds: [], hasMore: false };
  }

  /* ── 2. Author profiles ─────────────────────────────────────── */
  const authorIds = [...new Set(batch.map((p) => p.user_id).filter(Boolean) as string[])];
  type AuthorEntry = {
    display_name:    string | null;
    avatar_url:      string | null;
    badge:           string | null;
    membership_tier: string | null;
  };
  const nameMap: Record<string, AuthorEntry> = {};
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("id, display_name, avatar_url, badge, membership_tier")
      .in("id", authorIds);
    for (const p of (profiles ?? []) as Array<{ id: string } & AuthorEntry>) {
      nameMap[p.id] = {
        display_name:    p.display_name,
        avatar_url:      p.avatar_url,
        badge:           p.badge           ?? null,
        membership_tier: p.membership_tier ?? null,
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
        content_video_id, flavor_tag_ids, user_id, cigar_id,
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

    for (const logRow of rawLogs) {
      const author = logRow.user_id ? nameMap[logRow.user_id as string] : null;
      smokeLogMap[logRow.id] = {
        ...(logRow as unknown as SmokeLogData),
        flavor_tag_names: (logRow.flavor_tag_ids ?? [])
          .map((id) => tagNameMap[id])
          .filter(Boolean) as string[],
        author_display_name: author?.display_name ?? null,
        author_city:         null,
      };
    }
  }

  /* ── 5. Vote tallies for feedback posts in this batch ─────────── */
  const feedbackPostIds = feedbackCategoryId
    ? batch.filter((p) => p.category_id === feedbackCategoryId).map((p) => p.id)
    : [];
  const voteMap: Record<string, { upvotes: number; downvotes: number; userVote: 0 | 1 | -1 }> = {};
  if (feedbackPostIds.length > 0) {
    const { data: votes } = await supabase
      .from("forum_post_votes")
      .select("post_id, user_id, value")
      .in("post_id", feedbackPostIds);
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
      category_id:   p.category_id ?? null,
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
      status:        (p.status === "closed" ? "closed" : "open") as "open" | "closed",
    };
  });

  return {
    posts,
    likedIds: [...likedSet],
    hasMore:  batch.length >= pageSize,
  };
}

/* ──────────────────────────────────────────────────────────────────
   Feedback-card posts

   Fetches all posts in a feedback category — title-only listing
   (no body content), with vote tallies and the viewer's own vote.
   No pagination: the volume is small enough (<<100 posts per
   category in practice) that loading once is cheaper than
   paginating + state managing.
   ────────────────────────────────────────────────────────────── */

export async function fetchFeedbackPosts(
  categoryId: string,
  userId:     string,
): Promise<FeedbackPost[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("forum_posts")
    .select(
      "id, title, created_at, user_id, " +
      "forum_post_votes(user_id, value), " +
      "forum_comments(count)"
    )
    .eq("category_id", categoryId)
    .order("created_at", { ascending: false })
    /* Safety cap only — volume is <<100 in practice (see header note).
       Prevents an unbounded payload if a category ever explodes. */
    .limit(500);

  if (error) throw new Error(error.message);

  type Row = {
    id:                 string;
    title:              string;
    created_at:         string;
    user_id:            string | null;
    forum_post_votes:   { user_id: string; value: number }[];
    forum_comments:     { count: number }[];
  };
  const rows = (data ?? []) as unknown as Row[];

  /* Author profile lookup, deduped by user_id. */
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean) as string[])];
  type AuthorEntry = {
    display_name:    string | null;
    avatar_url:      string | null;
    badge:           string | null;
    membership_tier: string | null;
  };
  const nameMap: Record<string, AuthorEntry> = {};
  if (userIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("public_profiles")
      .select("id, display_name, avatar_url, badge, membership_tier")
      .in("id", userIds);
    for (const p of (profileRows ?? []) as Array<{ id: string } & AuthorEntry>) {
      nameMap[p.id] = {
        display_name:    p.display_name,
        avatar_url:      p.avatar_url,
        badge:           p.badge           ?? null,
        membership_tier: p.membership_tier ?? null,
      };
    }
  }

  const mapped: FeedbackPost[] = rows.map((row) => {
    const votes     = row.forum_post_votes ?? [];
    const upvotes   = votes.filter((v) => v.value === 1).length;
    const downvotes = votes.filter((v) => v.value === -1).length;
    const myVote    = votes.find((v) => v.user_id === userId)?.value ?? 0;
    const author    = row.user_id ? (nameMap[row.user_id] ?? null) : null;
    return {
      id:              row.id,
      title:           row.title,
      created_at:      row.created_at,
      user_id:         row.user_id ?? null,
      display_name:    author?.display_name    ?? null,
      avatar_url:      author?.avatar_url      ?? null,
      badge:           author?.badge           ?? null,
      membership_tier: author?.membership_tier ?? null,
      upvotes,
      downvotes,
      comment_count:   row.forum_comments[0]?.count ?? 0,
      user_vote:       myVote as 1 | -1 | 0,
    };
  });

  // Newest first (server already orders, but defensive).
  mapped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return mapped;
}

/* ──────────────────────────────────────────────────────────────────
   Post comments

   Loads every comment on a single post (top-level and replies) plus
   the joined author profile (display_name, avatar_url, badge, tier).
   Caller filters into top-level vs reply trees from the flat array.
   No pagination — comment volumes per post are small in practice.
   ────────────────────────────────────────────────────────────── */

export async function fetchPostComments(postId: string): Promise<Comment[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("forum_comments")
    .select(
      "id, content, created_at, updated_at, user_id, parent_comment_id, " +
      "profiles:public_profiles!forum_comments_user_id_fkey(display_name, avatar_url, badge, membership_tier)"
    )
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    /* Safety cap only — per-post comment volume is small in practice
       (see header note). Prevents an unbounded payload on a viral post. */
    .limit(1000);

  if (error) throw new Error(error.message);

  // Supabase returns the joined profile as either an object (to-one)
  // or an array depending on schema metadata — normalize to object.
  type Row = Omit<Comment, "profiles"> & {
    profiles: Comment["profiles"] | Comment["profiles"][] | null;
  };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    ...row,
    profiles: Array.isArray(row.profiles) ? (row.profiles[0] ?? null) : row.profiles,
  }));
}
