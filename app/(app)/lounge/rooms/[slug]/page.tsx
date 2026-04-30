import { createClient }      from "@/utils/supabase/server";
import { redirect, notFound } from "next/navigation";
import { CategoryFeed }      from "@/components/lounge/CategoryFeed";
import type { PostItem }     from "@/components/lounge/InlinePost";
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

  /* ---- User membership tier ---- */
  const { data: profile } = await supabase
    .from("profiles")
    .select("membership_tier, badge")
    .eq("id", user.id)
    .single();

  /* ---- Normalize posts ---- */
  const initialPosts: PostItem[] = posts.map((p) => ({
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
    has_smoke_log: !!p.smoke_log_id,
  }));

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
