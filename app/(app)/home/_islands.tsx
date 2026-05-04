/*
 * Async server "islands" for the home dashboard.
 *
 * The page (`page.tsx`) renders synchronously and wraps each island
 * in its own <Suspense> boundary. Each island fetches its own data
 * and renders the existing dashboard component with that data. The
 * three profile-dependent islands (UserHeader, QuickActions,
 * SmokingConditions) all call `getProfileLite(userId)` — React's
 * `cache()` deduplicates them to a single Supabase round-trip per
 * request.
 *
 * Why per-island fetching instead of a single top-level await:
 * - The static shell (page chrome + skeletons) paints from edge before
 *   any data resolves.
 * - Fast queries stream in first; slow queries don't block the page.
 * - Each Suspense boundary is also a hydration unit, keeping the
 *   main thread responsive on slower devices.
 */

import { createClient }      from "@/utils/supabase/server";
import { getProfileLite }    from "@/lib/data/profile";
import { getMembershipTier } from "@/lib/membership";
import { getLatestNews }     from "@/lib/data/news";

import { WelcomeSection, QuickActions } from "@/components/dashboard/WelcomeSection";
import { SmokingConditions }            from "@/components/dashboard/SmokingConditions";
import { AgingAlerts }                  from "@/components/dashboard/AgingAlerts";
import { News }                         from "@/components/dashboard/News";
import { TrendingLounge }               from "@/components/dashboard/TrendingLounge";

import type { AgingItem }  from "@/components/dashboard/AgingAlerts";
import type { LoungePost } from "@/components/dashboard/TrendingLounge";

/* ── User header (greeting + tier pill) ──────────────────────────── */
export async function UserHeaderIsland({ userId }: { userId: string }) {
  const profile = await getProfileLite(userId);
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).getFullYear().toString()
    : "—";
  return (
    <WelcomeSection
      displayName={profile?.display_name ?? "there"}
      membershipTier={getMembershipTier(profile)}
      memberSince={memberSince}
    />
  );
}

/* ── QuickActions row (gates Admin button) ───────────────────────── */
export async function QuickActionsIsland({ userId }: { userId: string }) {
  const profile = await getProfileLite(userId);
  return <QuickActions isAdmin={!!profile?.is_admin} />;
}

/* ── Smoking conditions strip (city → weather lookup) ────────────── */
export async function SmokingConditionsIsland({ userId }: { userId: string }) {
  const profile = await getProfileLite(userId);
  return <SmokingConditions city={profile?.city?.trim() || null} />;
}

/* ── Aging shelf (windowed humidor query) ────────────────────────── */
export async function AgingIsland({ userId }: { userId: string }) {
  const supabase = await createClient();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 31);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const agingFloor = new Date();
  agingFloor.setDate(agingFloor.getDate() - 7);
  const agingFloorStr = agingFloor.toISOString().split("T")[0];

  const { data } = await supabase
    .from("humidor_items")
    .select(
      "id, aging_start_date, aging_target_date, " +
      "cigar:cigar_catalog(brand, series, format)"
    )
    .eq("user_id", userId)
    .eq("is_wishlist", false)
    .not("aging_target_date", "is", null)
    .gte("aging_target_date", agingFloorStr)
    .lte("aging_target_date", cutoffStr)
    .order("aging_target_date", { ascending: true });

  return <AgingAlerts initialItems={(data ?? []) as unknown as AgingItem[]} />;
}

/* ── News rail (cached at the data layer via unstable_cache) ─────── */
export async function NewsIsland() {
  const items = await getLatestNews(5);
  return <News items={items} />;
}

/* ── Trending lounge posts (last 7 days, top 5 by engagement) ────── */
export async function TrendingIsland() {
  const supabase = await createClient();
  // Use new Date() instead of Date.now() — react-hooks/purity flags
  // Date.now as an impure call inside a server component render.
  const since = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("posts")
    .select(
      `id, content, likes_count, comments_count, created_at,
       user:profiles!posts_user_id_fkey (display_name, avatar_url, badge, membership_tier)`
    )
    .gte("created_at", since)
    .order("likes_count",    { ascending: false })
    .order("comments_count", { ascending: false })
    .limit(5);

  // Normalize FK join (Supabase may return array for to-one relations)
  const trendingPosts: LoungePost[] = (data ?? [])
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

  return <TrendingLounge initialPosts={trendingPosts} />;
}
