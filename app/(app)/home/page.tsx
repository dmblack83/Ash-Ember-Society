import { createClient }    from "@/utils/supabase/server";
import { getServerUser }   from "@/lib/auth/server-user";
import { getMembershipTier } from "@/lib/membership";
import { getLatestNews }   from "@/lib/data/news";
import { WelcomeSection, QuickActions } from "@/components/dashboard/WelcomeSection";
import { SmokingConditions }            from "@/components/dashboard/SmokingConditions";
import { AgingAlerts }                  from "@/components/dashboard/AgingAlerts";
import { News }                         from "@/components/dashboard/News";
import { FieldGuide }                   from "@/components/dashboard/FieldGuide";
import { TrendingLounge }               from "@/components/dashboard/TrendingLounge";
import type { AgingItem }               from "@/components/dashboard/AgingAlerts";
import type { LoungePost }              from "@/components/dashboard/TrendingLounge";

// User-specific data — opt out of static rendering
export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const user     = await getServerUser();

  /* ── Profile ──────────────────────────────────────────────────── */
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("display_name, membership_tier, badge, created_at, city, is_admin")
        .eq("id", user.id)
        .single()
    : { data: null };

  const displayName    = profile?.display_name ?? "there";
  const membershipTier = getMembershipTier(profile);
  const memberSince    = profile?.created_at
    ? new Date(profile.created_at).getFullYear().toString()
    : "—";
  const city           = profile?.city?.trim() || null;

  /* ── Cutoffs ───────────────────────────────────────────────────── */
  const cutoff    = new Date();
  cutoff.setDate(cutoff.getDate() + 31);
  const cutoffStr = cutoff.toISOString().split("T")[0];
  const agingFloor = new Date();
  agingFloor.setDate(agingFloor.getDate() - 7);
  const agingFloorStr = agingFloor.toISOString().split("T")[0];
  const since     = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  /* ── Run all data queries in parallel ─────────────────────────── */
  const [agingRes, postsRes, newsItems] = await Promise.all([
    user
      ? supabase
          .from("humidor_items")
          .select(
            "id, aging_start_date, aging_target_date, " +
            "cigar:cigar_catalog(brand, series)"
          )
          .eq("user_id", user.id)
          .eq("is_wishlist", false)
          .not("aging_target_date", "is", null)
          .gte("aging_target_date", agingFloorStr)
          .lte("aging_target_date", cutoffStr)
          .order("aging_target_date", { ascending: true })
      : Promise.resolve({ data: [] as unknown[] }),
    supabase
      .from("posts")
      .select(
        `id, content, likes_count, comments_count, created_at,
         user:profiles!posts_user_id_fkey (display_name, avatar_url, badge, membership_tier)`
      )
      .gte("created_at", since)
      .order("likes_count",    { ascending: false })
      .order("comments_count", { ascending: false })
      .limit(5),
    getLatestNews(5),
  ]);

  const agingItems = (agingRes.data ?? []) as unknown as AgingItem[];

  // Normalize FK join (Supabase may return array for to-one relations)
  const trendingPosts: LoungePost[] = (postsRes.data ?? [])
    .map((row) => ({
      id:             row.id,
      content:        row.content,
      likes_count:    row.likes_count,
      comments_count: row.comments_count,
      created_at:     row.created_at,
      user: Array.isArray(row.user)
        ? (row.user[0] ?? null)
        : (row.user   ?? null),
    }))
    .sort(
      (a, b) =>
        (b.likes_count + b.comments_count) -
        (a.likes_count + a.comments_count)
    );

  return (
    <div className="px-4 sm:px-6 pt-4 pb-6 flex flex-col gap-6 max-w-2xl mx-auto">

      {/* ── 0. Fixed header (greeting + tier pill) ───────────────── */}
      <WelcomeSection
        displayName={displayName}
        membershipTier={membershipTier}
        memberSince={memberSince}
      />

      {/* ── 0b. Quick actions row ─────────────────────────────────── */}
      <QuickActions isAdmin={!!profile?.is_admin} />

      {/* ── 1. Smoking conditions (weather) ───────────────────────── */}
      <SmokingConditions city={city} />

      {/* ── 2. Aging alerts ───────────────────────────────────────── */}
      <AgingAlerts initialItems={agingItems} />

      {/* ── 3. News (RSS-driven) ──────────────────────────────────── */}
      <News items={newsItems} />

      {/* ── 4. Field Guide — editorial reference library ──────────── */}
      <FieldGuide />

      {/* ── 5. Trending in The Lounge ─────────────────────────────── */}
      <TrendingLounge initialPosts={trendingPosts} />

    </div>
  );
}
