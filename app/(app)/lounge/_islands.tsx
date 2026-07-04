/*
 * Async server island for the Lounge home route.
 *
 * The page (`page.tsx`) renders synchronously with no top-level data
 * awaits — the shell HTML streams from the edge before this island
 * resolves. Suspense holds a skeleton in place until the queries
 * below return, then this island streams in.
 *
 * Why split this out: previously `page.tsx` ran 5 Supabase queries
 * (plus a conditional 2-query block) at the route boundary, which
 * blocked the entire HTML response on the slowest query. With this
 * island, the static shell paints first and the data fills in.
 *
 * Pattern mirrors `app/(app)/home/_islands.tsx` and
 * `app/(app)/humidor/_islands.tsx`.
 */

import { createClient }            from "@/utils/supabase/server";
import { getProfileLite }          from "@/lib/data/profile";
import { LoungeForumClient }       from "@/components/lounge/LoungeForumClient";
import {
  getAllForumCategories,
  getForumCategoryStats,
} from "@/lib/data/forum";

interface Props {
  userId: string;
  userEmail: string | null;
}

export async function LoungeDataIsland({ userId, userEmail }: Props) {
  const supabase = await createClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [categories, stats, profile, rulesPostRes, todayRes] = await Promise.all([
    getAllForumCategories(),
    getForumCategoryStats(),
    /* React.cache()-deduped — see lib/data/profile.ts. Used for the
       display name; posting is open to all tiers (2026-07-03). */
    getProfileLite(userId),
    supabase
      .from("forum_posts")
      .select("id, title, content")
      .eq("is_system", true)
      .eq("is_pinned", true)
      .single(),
    supabase
      .from("forum_posts")
      .select("category_id")
      .eq("is_system", false)
      .gte("created_at", since24h),
  ]);

  const rulesPost = rulesPostRes.data;

  const statsMap: Record<string, { post_count: number; last_post_at: string | null }> = {};
  for (const s of stats) {
    statsMap[s.category_id] = { post_count: s.post_count, last_post_at: s.last_post_at };
  }

  const todayCounts: Record<string, number> = {};
  for (const row of todayRes.data ?? []) {
    todayCounts[row.category_id] = (todayCounts[row.category_id] ?? 0) + 1;
  }

  const categoriesWithCount = categories.map((c) => ({
    ...c,
    post_count:   statsMap[c.id]?.post_count   ?? 0,
    last_post_at: statsMap[c.id]?.last_post_at ?? null,
    today_count:  todayCounts[c.id]            ?? 0,
  }));

  // Check if user has unlocked + total agreement count
  let hasUnlocked    = false;
  let agreementCount = 0;
  if (rulesPost) {
    const [userLikeRes, totalLikeRes] = await Promise.all([
      supabase.from("forum_post_likes").select("*", { count: "exact", head: true })
        .eq("user_id", userId).eq("post_id", rulesPost.id),
      supabase.from("forum_post_likes").select("*", { count: "exact", head: true })
        .eq("post_id", rulesPost.id),
    ]);
    hasUnlocked    = (userLikeRes.count  ?? 0) > 0;
    agreementCount = (totalLikeRes.count ?? 0);
  }

  const displayName    = profile?.display_name ?? userEmail?.split("@")[0] ?? "Member";

  return (
    <LoungeForumClient
      categories={categoriesWithCount}
      rulesPost={rulesPost ?? null}
      hasUnlocked={hasUnlocked}
      agreementCount={agreementCount}
      userId={userId}
      displayName={displayName}
    />
  );
}
