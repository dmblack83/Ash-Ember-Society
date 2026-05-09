/*
 * Async server "islands" for the home dashboard.
 *
 * The page (`page.tsx`) renders synchronously and wraps each island
 * in its own <Suspense> boundary. Each island fetches its own data
 * and renders the existing dashboard component with that data.
 *
 * Two profile-dependent islands (Masthead, SmokingConditions) both
 * call `getProfileLite(userId)` from `lib/data/profile.ts` — React's
 * `cache()` deduplicates them to ONE Supabase round-trip per request,
 * same query cost as the previous top-level await.
 *
 * Why per-island fetching instead of a single top-level await:
 * - The static shell (page chrome + skeletons + TonightsPairing +
 *   FieldGuide) paints from edge before any data resolves.
 * - Fast queries stream in first; slow queries don't block the page.
 * - Each Suspense boundary is also a hydration unit, keeping the
 *   main thread responsive on slower devices.
 */

import { createClient }    from "@/utils/supabase/server";
import { getProfileLite }  from "@/lib/data/profile";
import { getLatestNews }   from "@/lib/data/news";

import { Masthead }            from "@/components/dashboard/Masthead";
import { SmokingConditions }   from "@/components/dashboard/SmokingConditions";
import { AgingAlerts }         from "@/components/dashboard/AgingAlerts";
import { News }                from "@/components/dashboard/News";
import { LocalShops }          from "@/components/dashboard/LocalShops";

import type { AgingItem } from "@/components/dashboard/AgingAlerts";

/* ── Sticky greeting + admin link ────────────────────────────────── */
export async function MastheadIsland({ userId }: { userId: string }) {
  const profile = await getProfileLite(userId);
  return (
    <Masthead
      displayName={profile?.display_name ?? "there"}
      isAdmin={!!profile?.is_admin}
    />
  );
}

/* ── Smoking conditions strip (zip → weather lookup, city fallback) ─ */
export async function SmokingConditionsIsland({ userId }: { userId: string }) {
  const profile = await getProfileLite(userId);
  return (
    <SmokingConditions
      zip={profile?.zip_code?.trim() || null}
      city={profile?.city?.trim() || null}
    />
  );
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
      "cigar:cigar_catalog(brand, series)"
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

/* ── Local shops count (small, cheap; no user dependency) ────────── */
export async function LocalShopsIsland() {
  const supabase = await createClient();
  const { count } = await supabase
    .from("shops")
    .select("id", { count: "exact", head: true });
  return <LocalShops shopCount={count ?? 0} />;
}
