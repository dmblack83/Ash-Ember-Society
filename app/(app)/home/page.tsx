import { createClient }    from "@/utils/supabase/server";
import { getMembershipTier } from "@/lib/membership";
import { WelcomeSection, QuickActions } from "@/components/dashboard/WelcomeSection";
import { SmokingConditions }            from "@/components/dashboard/SmokingConditions";
import { AgingAlerts }                  from "@/components/dashboard/AgingAlerts";
import { CigarNews }                    from "@/components/dashboard/CigarNews";
import { TrendingLounge }               from "@/components/dashboard/TrendingLounge";
import type { AgingItem }               from "@/components/dashboard/AgingAlerts";
import type { LoungePost }              from "@/components/dashboard/TrendingLounge";
import type { BlogPost }                from "@/components/dashboard/CigarNews";

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
  const userName       = profile?.display_name ?? "Member";

  /* ── Cutoffs ───────────────────────────────────────────────────── */
  const cutoff    = new Date();
  cutoff.setDate(cutoff.getDate() + 31);
  const cutoffStr = cutoff.toISOString().split("T")[0];
  const agingFloor = new Date();
  agingFloor.setDate(agingFloor.getDate() - 7);
  const agingFloorStr = agingFloor.toISOString().split("T")[0];
  const since     = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  /* ── Run all data queries in parallel ─────────────────────────── */
  const [agingRes, postsRes, newsRes] = await Promise.all([
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
         user:profiles!posts_user_id_fkey (display_name, avatar_url)`
      )
      .gte("created_at", since)
      .order("likes_count",    { ascending: false })
      .order("comments_count", { ascending: false })
      .limit(5),
    supabase
      .from("blog_posts")
      .select(
        "id, type, title, cover_image_url, excerpt, body, synopsis, source_name, source_url, published_at"
      )
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString())
      .order("published_at", { ascending: false })
      .limit(6),
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

  const initialNews = (newsRes.data ?? []) as BlogPost[];

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
      <CigarNews
        initialPosts={initialNews}
        membershipTier={membershipTier}
        userId={user?.id ?? null}
        userName={userName}
      />

      {/* ── 4. Trending in The Lounge ─────────────────────────────── */}
      <TrendingLounge initialPosts={trendingPosts} />

    </div>
  );
}
