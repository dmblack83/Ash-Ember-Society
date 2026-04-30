import { createClient }        from "@/utils/supabase/server";
import { getServerUser }        from "@/lib/auth/server-user";
import { redirect }             from "next/navigation";
import { LoungeForumClient }    from "@/components/lounge/LoungeForumClient";
import { getMembershipTier }    from "@/lib/membership";
import {
  getAllForumCategories,
  getForumCategoryStats,
} from "@/lib/data/forum";

export const dynamic  = "force-dynamic";
export const metadata = { title: "The Lounge — Ash & Ember Society" };

export default async function LoungePage() {
  const supabase = await createClient();
  const user     = await getServerUser();
  if (!user) redirect("/login");

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [categories, stats, profileRes, rulesPostRes, todayRes] = await Promise.all([
    getAllForumCategories(),
    getForumCategoryStats(),
    supabase.from("profiles").select("display_name, membership_tier, badge").eq("id", user.id).single(),
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
        .eq("user_id", user.id).eq("post_id", rulesPost.id),
      supabase.from("forum_post_likes").select("*", { count: "exact", head: true })
        .eq("post_id", rulesPost.id),
    ]);
    hasUnlocked    = (userLikeRes.count  ?? 0) > 0;
    agreementCount = (totalLikeRes.count ?? 0);
  }

  const displayName    = profileRes.data?.display_name ?? user.email?.split("@")[0] ?? "Member";
  const membershipTier = getMembershipTier(profileRes.data);

  return (
    <LoungeForumClient
      categories={categoriesWithCount}
      rulesPost={rulesPost ?? null}
      hasUnlocked={hasUnlocked}
      agreementCount={agreementCount}
      userId={user.id}
      displayName={displayName}
      membershipTier={membershipTier}
    />
  );
}
