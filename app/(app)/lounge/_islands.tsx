/*
 * Async server island for the unified Lounge feed.
 *
 * The page shell streams from the edge before this island resolves;
 * Suspense holds LoungeShellSkeleton until the queries below return.
 *
 * Seeds page 0 of the feed for the (chip, view) in the URL when the
 * view is a created_at-desc query. Hot deep links skip the seed —
 * the client fetches through the get_hot_posts RPC on mount.
 *
 * Pattern mirrors `app/(app)/home/_islands.tsx`.
 */

import { createClient }                    from "@/utils/supabase/server";
import { getFlavorTags }                   from "@/lib/data/flavor-tags";
import { computeReportNumbers }            from "@/lib/data/burn-report-number";
import { getBurnReportThirdsTaggedBatch }  from "@/lib/data/burn-report-thirds";
import { LoungeFeedClient }                from "@/components/lounge/LoungeFeedClient";
import type { PostItem }                   from "@/components/lounge/InlinePost";
import type { SmokeLogData }               from "@/components/lounge/PostDetailClient";
import type { CategoryFeedPage }           from "@/lib/data/lounge-fetchers";
import { getAllForumCategories }           from "@/lib/data/forum";
import { getProfileLite }                  from "@/lib/data/profile";
import {
  parseChip,
  parseView,
  categorySlugForChip,
  feedParamsForView,
} from "@/lib/lounge/chips";

const PAGE_SIZE = 15;

interface Props {
  userId:    string;
  chipParam: string | null;
  viewParam: string | null;
}

export async function LoungeFeedDataIsland({ userId, chipParam, viewParam }: Props) {
  const supabase = await createClient();

  const chip = parseChip(chipParam);
  const view = parseView(viewParam, chip === "feedback");
  const { filter, sort } = feedParamsForView(view);

  const allCategories  = await getAllForumCategories();
  const activeSlug     = categorySlugForChip(chip);
  const activeCategory = activeSlug
    ? allCategories.find((c) => c.slug === activeSlug) ?? null
    : null;

  const postSelect =
    "id, title, content, created_at, user_id, category_id, image_url, is_locked, is_system, smoke_log_id, status, " +
    "forum_post_likes(count), forum_comments(count)";

  /* First feed page — only for created_at-desc views. Hot deep links
     seed nothing (the client fetches via the RPC path). */
  let mainQ = null;
  if (sort === "new") {
    let q = supabase
      .from("forum_posts")
      .select(postSelect)
      .eq("is_system", false)
      .neq("is_pinned", true)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (activeCategory)      q = q.eq("category_id", activeCategory.id);
    if (filter === "mine")   q = q.eq("user_id", userId);
    if (filter === "open")   q = q.eq("status", "open");
    if (filter === "closed") q = q.eq("status", "closed");
    mainQ = q;
  }

  /* Phase 1: posts + pinned (all categories) + rules post + profile. */
  const [postsRes, pinnedRes, rulesPostRes, profile] = await Promise.all([
    mainQ ?? Promise.resolve({ data: null }),
    supabase
      .from("forum_posts")
      .select(postSelect)
      .eq("is_system", false)
      .eq("is_pinned", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("forum_posts")
      .select("id, title, content")
      .eq("is_system", true)
      .eq("is_pinned", true)
      .maybeSingle(),
    getProfileLite(userId),
  ]);

  const rulesPost   = rulesPostRes.data ?? null;
  const posts       = (postsRes.data  ?? []) as any[];
  const pinnedPosts = (pinnedRes.data ?? []) as any[];
  const allFetched  = [...pinnedPosts, ...posts];

  const authorIds   = [...new Set(allFetched.map((p) => p.user_id).filter(Boolean) as string[])];
  const postIds     = allFetched.map((p) => p.id) as string[];
  const smokeLogIds = allFetched.map((p) => p.smoke_log_id).filter(Boolean) as string[];

  const feedbackCategory  = allCategories.find((c) => c.is_feedback) ?? null;
  const feedbackPostIds   = feedbackCategory
    ? allFetched.filter((p) => p.category_id === feedbackCategory.id).map((p) => p.id as string)
    : [];

  /* Phase 2: all post-dependent reads + rules agreement in parallel. */
  const [
    profilesRes,
    likesRes,
    smokeLogsRes,
    reportNumberMap,
    flavorTagsList,
    votesRes,
    userAgreedRes,
    totalAgreedRes,
  ] = await Promise.all([
    authorIds.length > 0
      ? supabase
          .from("public_profiles")
          .select("id, display_name, avatar_url, badge, membership_tier")
          .in("id", authorIds)
      : Promise.resolve({ data: null }),
    postIds.length > 0
      ? supabase
          .from("forum_post_likes")
          .select("post_id")
          .eq("user_id", userId)
          .in("post_id", postIds)
      : Promise.resolve({ data: null }),
    smokeLogIds.length > 0
      ? supabase
          .from("smoke_logs")
          .select(`
            id, smoked_at, overall_rating, draw_rating, burn_rating,
            construction_rating, flavor_rating, pairing_drink, pairing_food,
            location, occasion, smoke_duration_minutes, review_text, photo_urls,
            content_video_id, flavor_tag_ids, user_id, cigar_id,
            cigar:cigar_catalog(brand, series, format),
            burn_report:burn_reports(id, thirds_enabled, third_beginning, third_middle, third_end)
          `)
          .in("id", smokeLogIds)
      : Promise.resolve({ data: null }),
    smokeLogIds.length > 0
      ? computeReportNumbers(supabase, smokeLogIds)
      : Promise.resolve({} as Record<string, number>),
    smokeLogIds.length > 0 ? getFlavorTags() : Promise.resolve([]),
    feedbackPostIds.length > 0
      ? supabase
          .from("forum_post_votes")
          .select("post_id, user_id, value")
          .in("post_id", feedbackPostIds)
      : Promise.resolve({ data: null }),
    rulesPost
      ? supabase.from("forum_post_likes").select("*", { count: "exact", head: true })
          .eq("user_id", userId).eq("post_id", rulesPost.id)
      : Promise.resolve({ count: 0 }),
    rulesPost
      ? supabase.from("forum_post_likes").select("*", { count: "exact", head: true })
          .eq("post_id", rulesPost.id)
      : Promise.resolve({ count: 0 }),
  ]);

  /* ---- Profiles: id → display info ---- */
  const nameMap: Record<string, { display_name: string | null; avatar_url: string | null; badge: string | null; membership_tier: string | null }> = {};
  for (const p of profilesRes.data ?? []) {
    nameMap[p.id] = {
      display_name:    p.display_name,
      avatar_url:      p.avatar_url,
      badge:           p.badge           ?? null,
      membership_tier: p.membership_tier ?? null,
    };
  }

  /* ---- Liked post IDs ---- */
  const likedSet = new Set<string>();
  for (const l of likesRes.data ?? []) likedSet.add(l.post_id);

  /* ---- Smoke logs (full burn report data) ---- */
  const smokeLogMap: Record<string, SmokeLogData> = {};
  if (smokeLogsRes.data) {
    const rawLogs = smokeLogsRes.data as Array<Record<string, unknown> & { id: string; flavor_tag_ids: string[] | null; user_id: string | null; burn_report: Array<Record<string, unknown>> | null }>;

    const allTagIds = new Set(rawLogs.flatMap((l) => l.flavor_tag_ids ?? []));
    const tagNameMap: Record<string, string> = {};
    for (const t of flavorTagsList) {
      if (allTagIds.has(t.id)) tagNameMap[t.id] = t.name;
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
        report_number:       reportNumberMap[logRow.id] ?? null,
      };
    }

    /* Per-third tasting notes for thirds-enabled reports. */
    const burnReportIds: string[] = [];
    const reportIdToSmokeLogId: Record<string, string> = {};
    for (const logRow of rawLogs) {
      const brArr = Array.isArray(logRow.burn_report) ? logRow.burn_report : [];
      const br    = brArr[0] as { id?: string; thirds_enabled?: boolean } | undefined;
      if (br?.id && br.thirds_enabled) {
        burnReportIds.push(br.id);
        reportIdToSmokeLogId[br.id] = logRow.id;
      }
    }
    if (burnReportIds.length > 0) {
      const fullTagMap: Record<string, string> =
        Object.fromEntries(flavorTagsList.map((t) => [t.id, t.name]));
      const taggedByReport = await getBurnReportThirdsTaggedBatch(
        supabase, burnReportIds, fullTagMap,
      );
      for (const [brId, rows] of Object.entries(taggedByReport)) {
        const slid = reportIdToSmokeLogId[brId];
        const cur  = smokeLogMap[slid];
        if (!cur) continue;
        const brArr = Array.isArray(cur.burn_report) ? cur.burn_report : (cur.burn_report ? [cur.burn_report] : []);
        cur.burn_report = brArr.map((b) => ({ ...b, thirds_tagged_rows: rows })) as typeof cur.burn_report;
      }
    }
  }

  /* ---- Vote tallies (feedback posts in the fetched slice) ---- */
  const voteMap: Record<string, { upvotes: number; downvotes: number; userVote: 0 | 1 | -1 }> = {};
  for (const v of (votesRes.data ?? []) as { post_id: string; user_id: string; value: number }[]) {
    const cur = voteMap[v.post_id] ?? { upvotes: 0, downvotes: 0, userVote: 0 as 0 | 1 | -1 };
    if (v.value === 1)  cur.upvotes   += 1;
    if (v.value === -1) cur.downvotes += 1;
    if (v.user_id === userId) cur.userVote = v.value as 1 | -1;
    voteMap[v.post_id] = cur;
  }

  const isFounder = (profile?.assigned_badges ?? []).includes("founder");

  /* ---- Normalize ---- */
  function normalize(p: any): PostItem {
    const v = voteMap[p.id] ?? { upvotes: 0, downvotes: 0, userVote: 0 as 0 | 1 | -1 };
    return {
      id:            p.id,
      title:         p.title,
      content:       p.content,
      created_at:    p.created_at,
      user_id:       p.user_id      ?? null,
      category_id:   p.category_id  ?? null,
      author:        p.user_id ? (nameMap[p.user_id] ?? null) : null,
      like_count:    (p.forum_post_likes as { count: number }[])[0]?.count ?? 0,
      comment_count: (p.forum_comments  as { count: number }[])[0]?.count ?? 0,
      image_url:     p.image_url    ?? null,
      is_locked:     p.is_locked,
      is_system:     p.is_system,
      smoke_log:     p.smoke_log_id ? (smokeLogMap[p.smoke_log_id] ?? null) : null,
      upvotes:       v.upvotes,
      downvotes:     v.downvotes,
      user_vote:     v.userVote,
      status:        (p.status === "closed" ? "closed" : "open") as "open" | "closed",
    };
  }

  const initialPage: CategoryFeedPage | null = mainQ
    ? {
        posts:    posts.map(normalize),
        likedIds: [...likedSet],
        hasMore:  posts.length >= PAGE_SIZE,
      }
    : null;

  return (
    <LoungeFeedClient
      categories={allCategories}
      pinnedPosts={pinnedPosts.map(normalize)}
      initialPage={initialPage}
      initialChip={chip}
      initialView={view}
      rulesPost={rulesPost}
      hasUnlocked={(userAgreedRes.count ?? 0) > 0}
      agreementCount={totalAgreedRes.count ?? 0}
      userId={userId}
      isFounder={isFounder}
    />
  );
}
