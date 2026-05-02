import { createClient }      from "@/utils/supabase/server";
import { getServerUser }     from "@/lib/auth/server-user";
import { redirect, notFound } from "next/navigation";
import { CategoryFeed }      from "@/components/lounge/CategoryFeed";
import type { PostItem }     from "@/components/lounge/InlinePost";
import type { SmokeLogData } from "@/components/lounge/PostDetailClient";
import { getMembershipTier } from "@/lib/membership";
import { getAllForumCategories } from "@/lib/data/forum";

// Run on the Edge runtime: ~50ms cold start vs ~1–3s on Node serverless.
// Compatible deps: @supabase/ssr, @supabase/supabase-js, next/cache,
// next/headers, date-fns. No Stripe / Google Vision / fs / sharp here.
export const runtime = "edge";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function LoungeCategoryPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const user     = await getServerUser();
  if (!user) redirect("/login");

  /* ---- Guard: user must have agreed to rules ---- */
  const { data: rulesPost } = await supabase
    .from("forum_posts")
    .select("id")
    .eq("is_system", true)
    .eq("is_pinned", true)
    .maybeSingle();

  if (rulesPost) {
    const { count } = await supabase
      .from("forum_post_likes")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("post_id", rulesPost.id);
    if ((count ?? 0) === 0) redirect("/lounge");
  }

  /* ---- Categories: cached fetch + slug lookup in one shot ---- */
  const allCategories = await getAllForumCategories();
  const category      = allCategories.find((c) => c.slug === slug) ?? null;

  if (!category) notFound();

  /* ---- First page of posts (excluding pinned, fetched separately) ---- */
  const [{ data: rawPosts }, { data: rawPinned }] = await Promise.all([
    supabase
      .from("forum_posts")
      .select("id, title, content, created_at, user_id, image_url, is_locked, is_system, smoke_log_id, forum_post_likes(count), forum_comments(count)")
      .eq("category_id", category.id)
      .eq("is_system", false)
      .neq("is_pinned", true)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE),
    supabase
      .from("forum_posts")
      .select("id, title, content, created_at, user_id, image_url, is_locked, is_system, smoke_log_id, forum_post_likes(count), forum_comments(count)")
      .eq("category_id", category.id)
      .eq("is_system", false)
      .eq("is_pinned", true)
      .order("created_at", { ascending: false }),
  ]);

  const posts        = (rawPosts  ?? []) as any[];
  const pinnedPosts  = (rawPinned ?? []) as any[];
  const allFetched   = [...pinnedPosts, ...posts];

  /* ---- Author profiles. `city` is included so the verdict-card
         byline on shared burn-report posts uses the post author's
         city, not the viewer's. ---- */
  const authorIds = [...new Set(allFetched.map((p) => p.user_id).filter(Boolean) as string[])];
  const nameMap: Record<string, { display_name: string | null; avatar_url: string | null; badge: string | null; membership_tier: string | null; city: string | null }> = {};

  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, badge, membership_tier, city")
      .in("id", authorIds);
    for (const p of profiles ?? []) {
      nameMap[p.id] = {
        display_name:    p.display_name,
        avatar_url:      p.avatar_url,
        badge:           p.badge           ?? null,
        membership_tier: p.membership_tier ?? null,
        city:            p.city            ?? null,
      };
    }
  }

  /* ---- Liked post IDs ---- */
  const postIds   = allFetched.map((p) => p.id) as string[];
  const likedSet  = new Set<string>();

  if (postIds.length > 0) {
    const { data: likes } = await supabase
      .from("forum_post_likes")
      .select("post_id")
      .eq("user_id", user.id)
      .in("post_id", postIds);
    for (const l of likes ?? []) likedSet.add(l.post_id);
  }

  /* ---- Smoke logs (full burn report data). Joins burn_reports for
         thirds and resolves flavor_tag_ids → names so the verdict
         card can render without a second client-side roundtrip. ---- */
  const smokeLogIds = allFetched.map((p) => p.smoke_log_id).filter(Boolean) as string[];
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

    const rawLogs = (logs ?? []) as Array<Record<string, unknown> & { id: string; flavor_tag_ids: string[] | null; user_id: string | null; burn_report: Array<Record<string, unknown>> | null }>;

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
        burn_report: log.burn_report?.[0]
          ? (log.burn_report[0] as SmokeLogData["burn_report"])
          : null,
        flavor_tag_names: (log.flavor_tag_ids ?? [])
          .map((id) => tagNameMap[id])
          .filter(Boolean) as string[],
        author_display_name: author?.display_name ?? null,
        author_city:         author?.city         ?? null,
      };
    }
  }

  /* ---- Vote tallies (only meaningful for feedback category) ---- */
  const voteMap: Record<string, { upvotes: number; downvotes: number; userVote: 0 | 1 | -1 }> = {};
  if (category.is_feedback && postIds.length > 0) {
    const { data: votes } = await supabase
      .from("forum_post_votes")
      .select("post_id, user_id, value")
      .in("post_id", postIds);
    for (const v of (votes ?? []) as { post_id: string; user_id: string; value: number }[]) {
      const cur = voteMap[v.post_id] ?? { upvotes: 0, downvotes: 0, userVote: 0 as 0 | 1 | -1 };
      if (v.value === 1)  cur.upvotes   += 1;
      if (v.value === -1) cur.downvotes += 1;
      if (v.user_id === user.id) cur.userVote = v.value as 1 | -1;
      voteMap[v.post_id] = cur;
    }
  }

  /* ---- User membership tier ---- */
  const { data: profile } = await supabase
    .from("profiles")
    .select("membership_tier, badge")
    .eq("id", user.id)
    .single();

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
      userId={user.id}
      membershipTier={getMembershipTier(profile)}
      hasMore={posts.length >= PAGE_SIZE}
    />
  );
}
