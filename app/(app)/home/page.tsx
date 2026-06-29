import { Suspense }      from "react";
import { redirect }       from "next/navigation";
import { getServerUser }  from "@/lib/auth/server-user";
import { TonightsPairing } from "@/components/dashboard/TonightsPairing";
import { FieldGuide }      from "@/components/dashboard/FieldGuide";
import { DashboardPager }  from "@/components/dashboard/DashboardPager";

import { NewsIsland } from "./_islands";

import {
  MastheadIsland,
  SmokingConditionsIsland,
  NotificationsIsland,
  AgingIsland,
  LocalShopsIsland,
} from "./client-islands";

import { NewsSkeleton } from "./_skeletons";

/*
 * Edge runtime: faster cold start than the Node serverless target on
 * Vercel. The route is implicitly dynamic (the islands read per-user
 * data) but we no longer set `force-dynamic` — that would opt out of
 * partial prerendering and prevent the static shell from being served
 * from the edge cache once Phase 2 (Serwist SW) lands.
 */
export const runtime = "edge";

/*
 * Home page — sync server component, streams in islands as their data
 * resolves. The proxy guarantees `getServerUser()` returns a verified
 * user on this protected route; the redirect is a defensive fallback
 * for misconfigured matchers or direct Server Function calls.
 *
 * No top-level data awaits: every Supabase read lives inside a
 * Suspense boundary so the static shell paints immediately. The
 * shell here is layout chrome + skeletons + TonightsPairing (no data)
 * + FieldGuide (self-fetching client component).
 */
export default async function HomePage() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  return (
    <>
      {/* ── 0. Masthead (full-width greeting + admin link) ─────────── */}
      <MastheadIsland />

      <div className="px-4 sm:px-6 pt-6 pb-6 flex flex-col gap-6 max-w-2xl mx-auto">

        {/* ── 1. Tonight's Pairing — primary CTAs, no data ─────────── */}
        <TonightsPairing />

        {/* ── 2. Dashboard pager: conditions · notifications · aging ──
            initialIndex={1} opens on Notifications (the middle slide). */}
        <DashboardPager initialIndex={1}>
          <SmokingConditionsIsland />
          <NotificationsIsland />
          <AgingIsland />
        </DashboardPager>

        {/* ── 4. The Wire (RSS-driven news) ────────────────────────── */}
        <Suspense fallback={<NewsSkeleton />}>
          <NewsIsland />
        </Suspense>

        {/* ── 5. Field Guide — self-fetching client; in static shell ── */}
        <FieldGuide />

        {/* ── 6. Local Shops — reads profile ZIP, opens Google Maps externally ── */}
        <LocalShopsIsland />

      </div>
    </>
  );
}
