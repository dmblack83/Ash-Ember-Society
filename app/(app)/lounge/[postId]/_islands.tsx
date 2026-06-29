/*
 * Async server island for the Lounge post-detail route.
 *
 * The page (`page.tsx`) renders synchronously with no top-level data
 * awaits — the shell HTML streams from the edge before this island
 * resolves. Suspense holds a skeleton in place until the queries
 * below return, then this island streams in.
 *
 * Why split this out: previously `page.tsx` ran 3 paralleled queries
 * plus 1-2 conditional follow-up batches (smoke log, profiles,
 * flavor tags) at the route boundary, blocking the entire HTML
 * response on the slowest chain. With this island, the static shell
 * paints first and the data fills in.
 *
 * `redirect("/lounge")` fires from inside Suspense for missing posts.
 * The user sees a brief skeleton flash before the redirect — same
 * net behavior as the prior implementation, which served HTML only
 * after the post query returned. Common case (valid post id) wins
 * the TTFB. Pattern mirrors `app/(app)/home/_islands.tsx`.
 */

import { createClient }       from "@/utils/supabase/server";
import { redirect }           from "next/navigation";
import { PostDetailClient }   from "@/components/lounge/PostDetailClient";
import type { SmokeLogData }  from "@/components/lounge/PostDetailClient";
import { computeReportNumbers } from "@/lib/data/burn-report-number";
import { getBurnReportThirdsTaggedBatch } from "@/lib/data/burn-report-thirds";

interface Props {
  postId: string;
  userId: string;
}

export async function PostDetailDataIsland({ postId, userId }: Props) {
  const supabase = await createClient();

  const [postRes, commentsRes, likeRes] = await Promise.all([
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
      .single(),
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
  ]);

  if (!postRes.data) redirect("/lounge");

  const raw       = postRes.data as any;
  const likeCount = (raw.forum_post_likes as { count: number }[])[0]?.count ?? 0;

  // Separate profiles fetch — forum_posts.user_id → auth.users, not profiles directly
  const postAuthorId = raw.user_id as string | null;
  const commentRows  = (commentsRes.data ?? []) as Array<{
    id: string; content: string; created_at: string; updated_at: string;
    user_id: string; parent_comment_id: string | null;
  }>;

  // Fetch full smoke log if linked. Done before profiles so we can include
  // the log author's id (which may differ from the post author for legacy
  // rows) in the single profile query below.
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
        .single(),
      computeReportNumbers(supabase, [smokeLogId]),
    ]);
    if (logRes.data) {
      const logData = logRes.data as any;
      logAuthorId  = (logData.user_id as string | null) ?? null;
      flavorTagIds = (logData.flavor_tag_ids as string[] | null) ?? [];
      smokeLog = {
        ...(logData as SmokeLogData),
        report_number: reportNumberMap[smokeLogId] ?? null,
      };
    }
  }

  const allUserIds = [
    ...new Set(
      [postAuthorId, logAuthorId, ...commentRows.map((c) => c.user_id)].filter(Boolean) as string[]
    ),
  ];

  const nameMap: Record<string, { display_name: string | null; avatar_url: string | null; badge: string | null; membership_tier: string | null }> = {};
  if (allUserIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("public_profiles")
      .select("id, display_name, avatar_url, badge, membership_tier")
      .in("id", allUserIds);
    for (const p of profileRows ?? []) {
      nameMap[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url, badge: p.badge ?? null, membership_tier: p.membership_tier ?? null };
    }
  }

  // Resolve flavor tag IDs → names so VerdictCard renders the italic
  // "tasting notes" line below the verdict article.
  if (smokeLog && flavorTagIds.length > 0) {
    const { data: tagRows } = await supabase
      .from("flavor_tags")
      .select("id, name")
      .in("id", flavorTagIds);
    const tagMap = Object.fromEntries((tagRows ?? []).map((t: { id: string; name: string }) => [t.id, t.name]));
    smokeLog.flavor_tag_names = flavorTagIds.map((id) => tagMap[id]).filter(Boolean);
  }

  // Thread log-author display name onto the smoke log for the verdict-card byline.
  if (smokeLog && logAuthorId) {
    smokeLog.author_display_name = nameMap[logAuthorId]?.display_name ?? null;
    smokeLog.author_city         = null;
  }

  /* If this report is thirds-enabled, resolve per-third flavor tag
     NAMES so the verdict card renders the per-third tasting notes.
     The burn_reports.id flows in via the embedded join above. */
  if (smokeLog && smokeLog.burn_report) {
    const brArr = Array.isArray(smokeLog.burn_report) ? smokeLog.burn_report : [smokeLog.burn_report];
    const br    = brArr[0] as { id?: string; thirds_enabled?: boolean } | null;
    if (br?.id && br.thirds_enabled) {
      // Resolve names for whatever flavor_tags we already loaded in
      // the flavor_tag_ids step PLUS any new ones referenced by the
      // per-third joins. The DB has them all under flavor_tags; a
      // small extra fetch is cheap.
      const { data: allTagRows } = await supabase
        .from("flavor_tags")
        .select("id, name");
      const tagNameMap: Record<string, string> = Object.fromEntries(
        (allTagRows ?? []).map((t: { id: string; name: string }) => [t.id, t.name]),
      );
      const taggedByReport = await getBurnReportThirdsTaggedBatch(
        supabase, [br.id], tagNameMap,
      );
      const rows = taggedByReport[br.id];
      if (rows) {
        smokeLog.burn_report = brArr.map((b) => ({ ...b, thirds_tagged_rows: rows })) as typeof smokeLog.burn_report;
      }
    }
  }

  const post = {
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
      ? { display_name: nameMap[postAuthorId]?.display_name ?? null, avatar_url: nameMap[postAuthorId]?.avatar_url ?? null, badge: nameMap[postAuthorId]?.badge ?? null, membership_tier: nameMap[postAuthorId]?.membership_tier ?? null }
      : null,
    like_count:  likeCount,
    image_url:   (raw.image_url as string | null) ?? null,
  };

  const comments = commentRows.map((c) => ({
    ...c,
    profiles: { display_name: nameMap[c.user_id]?.display_name ?? null, avatar_url: nameMap[c.user_id]?.avatar_url ?? null, badge: nameMap[c.user_id]?.badge ?? null, membership_tier: nameMap[c.user_id]?.membership_tier ?? null },
  }));

  const hasLiked = (likeRes.count ?? 0) > 0;

  return (
    <PostDetailClient
      post={post}
      comments={comments}
      hasLiked={hasLiked}
      userId={userId}
      smokeLog={smokeLog}
    />
  );
}
