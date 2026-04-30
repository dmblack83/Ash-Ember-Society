import { createClient }      from "@/utils/supabase/server";
import { redirect, notFound } from "next/navigation";
import { CategoryFeed }      from "@/components/lounge/CategoryFeed";
import type { PostItem }     from "@/components/lounge/InlinePost";
import type { SmokeLogData } from "@/components/lounge/PostDetailClient";
import { getMembershipTier } from "@/lib/membership";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function LoungeCategoryPage({ params }: Props) {
  const { slug } = await params;
  const supabase  = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
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

  /* ---- Category ---- */
  const { data: category } = await supabase
    .from("forum_categories")
    .select("id, name, slug, description, is_locked, is_feedback")
    .eq("slug", slug)
    .single();

  if (!category) notFound();

  /* ---- All categories (for NewPostSheet) ---- */
  const { data: allCategories } = await supabase
    .from("forum_categories")
    .select("id, name, is_locked, is_gate, is_feedback")
    .order("sort_order");

  /* ---- First page of posts ---- */
  const { data: rawPosts } = await supabase
    .from("forum_posts")
    .select("id, title, content, created_at, user_id, image_url, is_locked, is_system, smoke_log_id, forum_post_likes(count), forum_comments(count)")
    .eq("category_id", category.id)
    .eq("is_system", false)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const posts = (rawPosts ?? []) as any[];

  /* ---- Author profiles ---- */
  const authorIds = [...new Set(posts.map((p) => p.user_id).filter(Boolean) as string[])];
  const nameMap: Record<string, { display_name: string | null; avatar_url: string | null; badge: string | null; membership_tier: string | null }> = {};

  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, badge, membership_tier")
      .in("id", authorIds);
    for (const p of profiles ?? []) {
      nameMap[p.id] = {
        display_name:    p.display_name,
        avatar_url:      p.avatar_url,
        badge:           p.badge           ?? null,
        membership_tier: p.membership_tier ?? null,
      };
    }
  }

  /* ---- Liked post IDs ---- */
  const postIds   = posts.map((p) => p.id) as string[];
  const likedSet  = new Set<string>();

  if (postIds.length > 0) {
    const { data: likes } = await supabase
      .from("forum_post_likes")
      .select("post_id")
      .eq("user_id", user.id)
      .in("post_id", postIds);
    for (const l of likes ?? []) likedSet.add(l.post_id);
  }

  /* ---- Smoke logs (full burn report data) ---- */
  const smokeLogIds = posts.map((p) => p.smoke_log_id).filter(Boolean) as string[];
  const smokeLogMap: Record<string, SmokeLogData> = {};
  if (smokeLogIds.length > 0) {
    const { data: logs } = await supabase
      .from("smoke_logs")
      .select("id, smoked_at, overall_rating, draw_rating, burn_rating, construction_rating, flavor_rating, pairing_drink, pairing_food, location, occasion, smoke_duration_minutes, review_text, photo_urls, content_video_id, cigar:cigar_catalog(brand, series, format)")
      .in("id", smokeLogIds);
    for (const log of (logs ?? []) as any[]) {
      smokeLogMap[log.id] = log as SmokeLogData;
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
  const initialPosts: PostItem[] = posts.map((p) => {
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
  });

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
      allCategories={allCategories ?? []}
      initialPosts={initialPosts}
      initialLikedIds={[...likedSet]}
      userId={user.id}
      membershipTier={getMembershipTier(profile)}
      hasMore={posts.length >= PAGE_SIZE}
    />
  );
}
