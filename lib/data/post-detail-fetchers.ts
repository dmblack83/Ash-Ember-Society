"use client";

/*
 * Client-side fetcher for the /lounge/[postId] detail bundle.
 *
 * Port of the deleted server island (app/(app)/lounge/[postId]/
 * _islands.tsx) to the static-shell pattern: same queries, same
 * assembly, now running in the browser under the viewer's RLS via
 * useSWR (see PostDetailRoute). Returns null when the post does not
 * exist (or RLS hides it) — the route redirects to /lounge, matching
 * the island's redirect.
 */

import { createClient }                   from "@/utils/supabase/client";
import { computeReportNumbers }           from "@/lib/data/burn-report-number";
import { getBurnReportThirdsTaggedBatch } from "@/lib/data/burn-report-thirds-batch";
import type {
  Post,
  Comment,
  SmokeLogData,
} from "@/components/lounge/PostDetailClient";

export interface PostDetailBundle {
  post:     Post;
  comments: Comment[];
  hasLiked: boolean;
  smokeLog: SmokeLogData | null;
}

type ProfileEntry = {
  display_name:    string | null;
  avatar_url:      string | null;
  badge:           string | null;
  membership_tier: string | null;
};

export async function fetchPostDetailBundle(
  userId: string,
  postId: string,
): Promise<PostDetailBundle | null> {
  const supabase = createClient();

  /* ── Wave 1: post + comments + own like + full flavor-tag map ─── */
  const [postRes, commentsRes, likeRes, tagsRes] = await Promise.all([
    supabase
      .from("forum_posts")
      .select(`
        id, title, content, created_at, updated_at,
        is_system, is_locked, user_id, category_id,
        image_url, smoke_log_id,
        forum_post_likes(count),
        forum_categories(name, slug)
      `)
      .eq("id", postId)
      .maybeSingle(),
    supabase
      .from("forum_comments")
      .select("id, content, created_at, updated_at, user_id, parent_comment_id")
      .eq("post_id", postId)
      .order("created_at", { ascending: true }),
    supabase
      .from("forum_post_likes")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("post_id", postId),
    /* Full catalog (small, static table): resolves both the headline
       flavor_tag_ids → names lookup and the per-third tag map below. */
    supabase.from("flavor_tags").select("id, name"),
  ]);

  if (postRes.error) throw new Error(postRes.error.message);
  if (!postRes.data) return null; // missing or RLS-hidden → route redirects

  const tagNameMap: Record<string, string> = {};
  for (const t of (tagsRes.data ?? []) as { id: string; name: string }[]) {
    tagNameMap[t.id] = t.name;
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const raw       = postRes.data as any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const likeCount = (raw.forum_post_likes as { count: number }[])[0]?.count ?? 0;

  const postAuthorId = raw.user_id as string | null;
  const commentRows  = (commentsRes.data ?? []) as Array<{
    id: string; content: string; created_at: string; updated_at: string;
    user_id: string; parent_comment_id: string | null;
  }>;

  /* ── Wave 2 (conditional): smoke log + report number ──────────── */
  let smokeLog: SmokeLogData | null = null;
  let logAuthorId: string | null = null;
  let flavorTagIds: string[] = [];
  if (raw.smoke_log_id) {
    const smokeLogId = raw.smoke_log_id as string;
    const [logRes, reportNumberMap] = await Promise.all([
      supabase
        .from("smoke_logs")
        .select(`
          id, smoked_at, overall_rating,
          draw_rating, burn_rating, construction_rating, flavor_rating,
          pairing_drink, pairing_food, location, occasion,
          smoke_duration_minutes, review_text, photo_urls,
          cigar_id, flavor_tag_ids, user_id,
          cigar:cigar_catalog(brand, series, format),
          burn_report:burn_reports(id, thirds_enabled, third_beginning, third_middle, third_end)
        `)
        .eq("id", smokeLogId)
        .maybeSingle(),
      computeReportNumbers(supabase, [smokeLogId]),
    ]);
    if (logRes.data) {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const logData = logRes.data as any;
      /* eslint-enable @typescript-eslint/no-explicit-any */
      logAuthorId  = (logData.user_id as string | null) ?? null;
      flavorTagIds = (logData.flavor_tag_ids as string[] | null) ?? [];
      smokeLog = {
        ...(logData as SmokeLogData),
        report_number: reportNumberMap[smokeLogId] ?? null,
      };
    }
  }

  /* ── Wave 3: profiles for post author, log author, commenters ─── */
  const allUserIds = [
    ...new Set(
      [postAuthorId, logAuthorId, ...commentRows.map((c) => c.user_id)]
        .filter(Boolean) as string[],
    ),
  ];
  const nameMap: Record<string, ProfileEntry> = {};
  if (allUserIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("public_profiles")
      .select("id, display_name, avatar_url, badge, membership_tier")
      .in("id", allUserIds);
    for (const p of (profileRows ?? []) as Array<{ id: string } & ProfileEntry>) {
      nameMap[p.id] = {
        display_name:    p.display_name,
        avatar_url:      p.avatar_url,
        badge:           p.badge           ?? null,
        membership_tier: p.membership_tier ?? null,
      };
    }
  }

  if (smokeLog && flavorTagIds.length > 0) {
    smokeLog.flavor_tag_names = flavorTagIds.map((id) => tagNameMap[id]).filter(Boolean);
  }
  if (smokeLog && logAuthorId) {
    smokeLog.author_display_name = nameMap[logAuthorId]?.display_name ?? null;
    smokeLog.author_city         = null;
  }

  /* ── Per-third tasting notes for thirds-enabled reports ───────── */
  if (smokeLog && smokeLog.burn_report) {
    const brArr = Array.isArray(smokeLog.burn_report) ? smokeLog.burn_report : [smokeLog.burn_report];
    const br    = brArr[0] as { id?: string; thirds_enabled?: boolean } | null;
    if (br?.id && br.thirds_enabled) {
      const taggedByReport = await getBurnReportThirdsTaggedBatch(
        supabase, [br.id], tagNameMap,
      );
      const rows = taggedByReport[br.id];
      if (rows) {
        smokeLog.burn_report = brArr.map((b) => ({ ...b, thirds_tagged_rows: rows })) as typeof smokeLog.burn_report;
      }
    }
  }

  const post: Post = {
    id:          raw.id          as string,
    title:       raw.title       as string,
    content:     raw.content     as string,
    created_at:  raw.created_at  as string,
    updated_at:  raw.updated_at  as string,
    is_system:   raw.is_system   as boolean,
    is_locked:   raw.is_locked   as boolean,
    user_id:     postAuthorId,
    category_id: raw.category_id as string,
    category:    raw.forum_categories as { name: string; slug: string },
    author:      postAuthorId
      ? {
          display_name:    nameMap[postAuthorId]?.display_name    ?? null,
          avatar_url:      nameMap[postAuthorId]?.avatar_url      ?? null,
          badge:           nameMap[postAuthorId]?.badge           ?? null,
          membership_tier: nameMap[postAuthorId]?.membership_tier ?? null,
        }
      : null,
    like_count:  likeCount,
    image_url:   (raw.image_url as string | null) ?? null,
  };

  const comments: Comment[] = commentRows.map((c) => ({
    ...c,
    profiles: {
      display_name:    nameMap[c.user_id]?.display_name    ?? null,
      avatar_url:      nameMap[c.user_id]?.avatar_url      ?? null,
      badge:           nameMap[c.user_id]?.badge           ?? null,
      membership_tier: nameMap[c.user_id]?.membership_tier ?? null,
    },
  }));

  return {
    post,
    comments,
    hasLiked: (likeRes.count ?? 0) > 0,
    smokeLog,
  };
}
