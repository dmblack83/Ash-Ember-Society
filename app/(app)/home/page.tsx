import { createClient }    from "@/utils/supabase/server";
import { getMembershipTier } from "@/lib/membership";
import { WelcomeSection, QuickActions } from "@/components/dashboard/WelcomeSection";
import { SmokingConditions }            from "@/components/dashboard/SmokingConditions";
import { AgingAlerts }                  from "@/components/dashboard/AgingAlerts";
import { CigarNews }                    from "@/components/dashboard/CigarNews";
import { TrendingLounge }               from "@/components/dashboard/TrendingLounge";
import type { AgingItem }               from "@/components/dashboard/AgingAlerts";
import type { LoungePost }              from "@/components/dashboard/TrendingLounge";

// User-specific data — opt out of static rendering
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* ── Profile ──────────────────────────────────────────────────── */
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("display_name, membership_tier, created_at, city")
        .eq("id", user.id)
        .single()
    : { data: null };

  const displayName    = profile?.display_name ?? "there";
  const membershipTier = getMembershipTier(profile);
  const memberSince    = profile?.created_at
    ? new Date(profile.created_at).getFullYear().toString()
    : "—";
  const city           = profile?.city?.trim() || null;

  /* ── Aging alerts (items due within 14 days) ──────────────────── */
  const cutoff    = new Date();
  cutoff.setDate(cutoff.getDate() + 14);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const { data: agingRaw } = user
    ? await supabase
        .from("humidor_items")
        .select(
          "id, aging_start_date, aging_target_date, " +
          "cigar:cigar_catalog(brand, series, name)"
        )
        .eq("user_id", user.id)
        .eq("is_wishlist", false)
        .not("aging_target_date", "is", null)
        .lte("aging_target_date", cutoffStr)
        .order("aging_target_date", { ascending: true })
    : { data: [] };

  const agingItems = (agingRaw ?? []) as unknown as AgingItem[];

  /* ── Trending lounge posts (last 7 days, top 5 by engagement) ─── */
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: postsRaw } = await supabase
    .from("posts")
    .select(
      `id, content, likes_count, comments_count, created_at,
       user:profiles!posts_user_id_fkey (display_name, avatar_url)`
    )
    .gte("created_at", since)
    .order("likes_count",    { ascending: false })
    .order("comments_count", { ascending: false })
    .limit(5);

  // Normalize FK join (Supabase may return array for to-one relations)
  const trendingPosts: LoungePost[] = (postsRaw ?? [])
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
      <QuickActions />

      {/* ── 1. Smoking conditions (weather) ───────────────────────── */}
      <SmokingConditions city={city} />

      {/* ── 2. Aging alerts ───────────────────────────────────────── */}
      <AgingAlerts initialItems={agingItems} />

      {/* ── 3. Cigar news & editorial feed ────────────────────────── */}
      <CigarNews />

      {/* ── 4. Trending in The Lounge ─────────────────────────────── */}
      <TrendingLounge initialPosts={trendingPosts} />

    </div>
  );
}
