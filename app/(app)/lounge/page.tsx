import { createClient }        from "@/utils/supabase/server";
import { redirect }             from "next/navigation";
import { LoungeForumClient }    from "@/components/lounge/LoungeForumClient";

export const dynamic  = "force-dynamic";
export const metadata = { title: "The Lounge — Ash & Ember Society" };

export default async function LoungePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [categoriesRes, allPostsRes, profileRes, rulesPostRes] = await Promise.all([
    supabase.from("forum_categories").select("id, name, slug, description, sort_order, is_locked, is_gate").order("sort_order"),
    supabase.from("forum_posts").select("id, category_id"),
    supabase.from("profiles").select("display_name, membership_tier").eq("id", user.id).single(),
    supabase
      .from("forum_posts")
      .select("id, title, content")
      .eq("is_system", true)
      .eq("is_pinned", true)
      .single(),
  ]);

  const categories  = categoriesRes.data ?? [];
  const allPosts    = allPostsRes.data ?? [];
  const rulesPost   = rulesPostRes.data;

  // Count posts per category
  const postCountMap: Record<string, number> = {};
  for (const p of allPosts) {
    postCountMap[p.category_id] = (postCountMap[p.category_id] ?? 0) + 1;
  }

  const categoriesWithCount = categories.map((c) => ({
    ...c,
    post_count: postCountMap[c.id] ?? 0,
  }));

  // Check if user has unlocked (liked the rules post)
  let hasUnlocked = false;
  if (rulesPost) {
    const { count } = await supabase
      .from("forum_post_likes")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("post_id", rulesPost.id);
    hasUnlocked = (count ?? 0) > 0;
  }

  const displayName    = profileRes.data?.display_name ?? user.email?.split("@")[0] ?? "Member";
  const membershipTier = profileRes.data?.membership_tier ?? "free";

  return (
    <LoungeForumClient
      categories={categoriesWithCount}
      rulesPost={rulesPost ?? null}
      hasUnlocked={hasUnlocked}
      userId={user.id}
      displayName={displayName}
      membershipTier={membershipTier}
    />
  );
}
