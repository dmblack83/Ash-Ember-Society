/*
 * Async server island for the Lounge category-feed route.
 *
 * The page (`page.tsx`) renders synchronously with no top-level data
 * awaits — the shell HTML streams from the edge before this island
 * resolves. Suspense holds a skeleton in place until the queries
 * below return, then this island streams in.
 *
 * Why split this out: previously `page.tsx` ran 13 awaits in sequence
 * (rules guard + likes count + categories + posts/pinned + profiles +
 * likes + smoke logs + flavor tags + votes + user profile) at the
 * route boundary, blocking the entire HTML response on the longest
 * serial chain. With this island, the static shell paints first and
 * the data fills in.
 *
 * Guard semantics: redirect("/lounge") and notFound() fire from
 * inside Suspense. Users who haven't agreed to rules see a brief
 * skeleton flash before redirect — rare case (one-time gate per
 * user). Pattern mirrors `app/(app)/home/_islands.tsx`.
 */

import { createClient }            from "@/utils/supabase/server";
import { getFlavorTags }           from "@/lib/data/flavor-tags";
import { computeReportNumbers }    from "@/lib/data/burn-report-number";
import { getBurnReportThirdsTaggedBatch } from "@/lib/data/burn-report-thirds";
import { redirect, notFound }      from "next/navigation";
import { CategoryFeed }            from "@/components/lounge/CategoryFeed";
import type { PostItem }           from "@/components/lounge/InlinePost";
import type { SmokeLogData }       from "@/components/lounge/PostDetailClient";
import { getAllForumCategories }   from "@/lib/data/forum";
import { getProfileLite }          from "@/lib/data/profile";

const PAGE_SIZE = 15;

interface Props {
  slug:   string;
  userId: string;
}

export async function CategoryFeedDataIsland({ slug, userId }: Props) {
  const supabase = await createClient();

  /* ---- Guard: user must have agreed to rules ----
     Previously two serial Supabase round-trips: find rules post, then
     count this user's like on its id (~100 ms total).

     Now two parallel round-trips. The second uses a PostgREST inner
     join on `forum_posts` so it can filter by `is_system + is_pinned`
     without needing the post id ahead of time. Either query failing
     leaves the user in the "not agreed" bucket; the rare "rules post
     doesn't exist" case still allows access (preserves prior behaviour). */
  const [rulesPostRes, hasAgreedRes] = await Promise.all([
    supabase
      .from("forum_posts")
      .select("id")
      .eq("is_system", true)
      .eq("is_pinned", true)
      .maybeSingle(),
    supabase
      .from("forum_post_likes")
      .select("post_id, forum_posts!inner(is_system, is_pinned)")
      .eq("user_id", userId)
      .eq("forum_posts.is_system", true)
      .eq("forum_posts.is_pinned", true)
      .maybeSingle(),
  ]);

  if (rulesPostRes.data && !hasAgreedRes.data) redirect("/lounge");

  /* ---- Categories: cached fetch + slug lookup in one shot ---- */
  const allCategories = await getAllForumCategories();
  const category      = allCategories.find((c) => c.slug === slug) ?? null;

  if (!category) notFound();

  /* ---- First page of posts (excluding pinned, fetched separately) ---- */
  const postSelect = "id, title, content, created_at, user_id, image_url, is_locked, is_system, smoke_log_id, status, forum_post_likes(count), forum_comments(count)";

  let mainQ = supabase
    .from("forum_posts")
    .select(postSelect)
    .eq("category_id", category.id)
    .eq("is_system", false)
    .neq("is_pinned", true)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (category.is_feedback) mainQ = mainQ.eq("status", "open");

  /* ---- Phase 1: posts + pinned + viewer's own profile ----
         Posts and pinned posts have always run in parallel; the viewer's
         profile fetch doesn't depend on either, so hoist it into the
         same batch. Uses getProfileLite for React.cache() dedup with
         any other server component that fetches the same profile on
         this render. */
  const [{ data: rawPosts }, { data: rawPinned }, profile] = await Promise.all([
    mainQ,
    supabase
      .from("forum_posts")
      .select(postSelect)
      .eq("category_id", category.id)
      .eq("is_system", false)
      .eq("is_pinned", true)
      .order("created_at", { ascending: false }),
    getProfileLite(userId),
  ]);

  const posts        = (rawPosts  ?? []) as any[];
  const pinnedPosts  = (rawPinned ?? []) as any[];
  const allFetched   = [...pinnedPosts, ...posts];

  const authorIds = [...new Set(allFetched.map((p) => p.user_id).filter(Boolean) as string[])];
  const postIds   = allFetched.map((p) => p.id) as string[];
  const smokeLogIds = allFetched.map((p) => p.smoke_log_id).filter(Boolean) as string[];

  /* ---- Phase 2: all post-dependent reads in parallel ----
         Previously profiles, likes, smokeLogs+reportNumbers, getFlavorTags,
         and votes ran as a serial chain (~5 round-trips back-to-back).
         All of them only need the IDs computed above (or no input at all,
         in flavor tags' case), so they can all fire concurrently. Optional
         queries resolve to `null` / `undefined` when their input slice is
         empty, keeping the destructure positional and the downstream
         loops simple. `getFlavorTags` is cached at the data layer; pulling
         it here speculatively (instead of inside the smokeLogIds block)
         removes one serial dependency without changing the final tagNameMap. */
  const [
    profilesRes,
    likesRes,
    smokeLogsRes,
    reportNumberMap,
    flavorTagsList,
    votesRes,
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
    category.is_feedback && postIds.length > 0
      ? supabase
          .from("forum_post_votes")
          .select("post_id, user_id, value")
          .in("post_id", postIds)
      : Promise.resolve({ data: null }),
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

  /* ---- Smoke logs (full burn report data). Joins burn_reports for
         thirds and resolves flavor_tag_ids → names so the verdict
         card can render without a second client-side roundtrip. ---- */
  const smokeLogMap: Record<string, SmokeLogData> = {};
  if (smokeLogsRes.data) {
    const rawLogs = smokeLogsRes.data as Array<Record<string, unknown> & { id: string; flavor_tag_ids: string[] | null; user_id: string | null; burn_report: Array<Record<string, unknown>> | null }>;

    /* Resolve flavor tag IDs → names. Reads the cached full catalog
       (lib/data/flavor-tags.ts) and filters to the IDs we need —
       cheap because flavor_tags is a small reference table and we
       skip the per-request roundtrip. */
    const allTagIds = new Set(rawLogs.flatMap((l) => l.flavor_tag_ids ?? []));
    const tagNameMap: Record<string, string> = {};
    for (const t of flavorTagsList) {
      if (allTagIds.has(t.id)) tagNameMap[t.id] = t.name;
    }

    for (const log of rawLogs) {
      const author = log.user_id ? nameMap[log.user_id as string] : null;
      // burn_report is passed through as-is (array OR object — the
      // SmokeLogData type accepts both, and render sites use
      // unwrapBurnReport() to flatten before reading fields).
      smokeLogMap[log.id] = {
        ...(log as unknown as SmokeLogData),
        flavor_tag_names: (log.flavor_tag_ids ?? [])
          .map((id) => tagNameMap[id])
          .filter(Boolean) as string[],
        author_display_name: author?.display_name ?? null,
        author_city:         null,
        report_number:       reportNumberMap[log.id] ?? null,
      };
    }

    /* Resolve per-third tasting notes for thirds-enabled reports in
       this batch so VerdictCard can render `thirdsTaggedRows` server-
       side. Use the full flavor_tags map (covers the per-third tags
       which may not overlap the headline flavor_tag_ids). */
    const burnReportIds: string[] = [];
    const reportIdToSmokeLogId: Record<string, string> = {};
    for (const log of rawLogs) {
      const brArr = Array.isArray(log.burn_report) ? log.burn_report : [];
      const br    = brArr[0] as { id?: string; thirds_enabled?: boolean } | undefined;
      if (br?.id && br.thirds_enabled) {
        burnReportIds.push(br.id);
        reportIdToSmokeLogId[br.id] = log.id;
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

  /* ---- Vote tallies (only meaningful for feedback category) ---- */
  const voteMap: Record<string, { upvotes: number; downvotes: number; userVote: 0 | 1 | -1 }> = {};
  for (const v of (votesRes.data ?? []) as { post_id: string; user_id: string; value: number }[]) {
    const cur = voteMap[v.post_id] ?? { upvotes: 0, downvotes: 0, userVote: 0 as 0 | 1 | -1 };
    if (v.value === 1)  cur.upvotes   += 1;
    if (v.value === -1) cur.downvotes += 1;
    if (v.user_id === userId) cur.userVote = v.value as 1 | -1;
    voteMap[v.post_id] = cur;
  }

  const isFounder = (profile?.assigned_badges ?? []).includes("founder");

  /* ---- Normalize posts ---- */
  function normalize(p: any): PostItem {
    const v = voteMap[p.id] ?? { upvotes: 0, downvotes: 0, userVote: 0 as 0 | 1 | -1 };
    return {
      id:            p.id,
      title:         p.title,
      content:       p.content,
      created_at:    p.created_at,
      user_id:       p.user_id      ?? null,
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

  const initialPosts:       PostItem[] = posts.map(normalize);
  const initialPinnedPosts: PostItem[] = pinnedPosts.map(normalize);

  return (
    <CategoryFeed
      category={{
        id:          category.id,
        name:        category.name,
        slug:        category.slug,
        description: category.description ?? null,
        is_locked:   category.is_locked,
        is_feedback: category.is_feedback,
      }}
      allCategories={allCategories}
      initialPosts={initialPosts}
      initialPinnedPosts={initialPinnedPosts}
      initialLikedIds={[...likedSet]}
      userId={userId}
      isFounder={isFounder}
      hasMore={posts.length >= PAGE_SIZE}
    />
  );
}
