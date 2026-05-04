import { Suspense }       from "react";
import { redirect }        from "next/navigation";
import { getServerUser }   from "@/lib/auth/server-user";
import { FieldGuide }      from "@/components/dashboard/FieldGuide";

import {
  UserHeaderIsland,
  QuickActionsIsland,
  SmokingConditionsIsland,
  AgingIsland,
  NewsIsland,
  TrendingIsland,
} from "./_islands";

import {
  UserHeaderSkeleton,
  QuickActionsSkeleton,
  SmokingConditionsSkeleton,
  CardSkeleton,
} from "./_skeletons";

/*
 * Edge runtime: faster cold start than the Node serverless target on
 * Vercel. The route is implicitly dynamic (the islands read per-user
 * data) but we no longer set `force-dynamic` — that would opt out of
 * partial prerendering and prevent the static shell from being served
 * from the edge cache.
 */
export const runtime = "edge";

/*
 * Home page — sync server component, streams in islands as their data
 * resolves. The proxy guarantees `getServerUser()` returns a verified
 * user on this protected route; the redirect is a defensive fallback
 * for misconfigured matchers or direct Server Function calls.
 *
 * No top-level awaits on data: every async fetch lives inside a
 * Suspense boundary so the static shell (layout chrome + skeletons +
 * the self-fetching FieldGuide) paints immediately.
 */
export default async function HomePage() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  return (
    <div className="px-4 sm:px-6 pt-4 pb-6 flex flex-col gap-6 max-w-2xl mx-auto">

      {/* ── 0. Fixed header (greeting + tier pill) ───────────────── */}
      <Suspense fallback={<UserHeaderSkeleton />}>
        <UserHeaderIsland userId={user.id} />
      </Suspense>

      {/* ── 0b. Quick actions row ─────────────────────────────────── */}
      <Suspense fallback={<QuickActionsSkeleton />}>
        <QuickActionsIsland userId={user.id} />
      </Suspense>

      {/* ── 1. Smoking conditions (weather) ───────────────────────── */}
      <Suspense fallback={<SmokingConditionsSkeleton />}>
        <SmokingConditionsIsland userId={user.id} />
      </Suspense>

      {/* ── 2. Aging alerts ───────────────────────────────────────── */}
      <Suspense fallback={<CardSkeleton height={140} />}>
        <AgingIsland userId={user.id} />
      </Suspense>

      {/* ── 3. News (RSS-driven) ──────────────────────────────────── */}
      <Suspense fallback={<CardSkeleton height={420} />}>
        <NewsIsland />
      </Suspense>

      {/* ── 4. Field Guide — already self-fetching client component;
              part of the static shell, no Suspense boundary needed. */}
      <FieldGuide />

      {/* ── 5. Trending in The Lounge ─────────────────────────────── */}
      <Suspense fallback={<CardSkeleton height={300} />}>
        <TrendingIsland />
      </Suspense>

    </div>
  );
}
