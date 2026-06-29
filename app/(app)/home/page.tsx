import { Suspense }      from "react";
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
import { HomeAuthGate } from "./HomeAuthGate";
import { NewsSkeleton } from "./_skeletons";

/*
 * Edge runtime: faster cold start. The route is a STATIC, user-agnostic shell
 * — no getServerUser(), no per-user server reads — so the document carries no
 * PII and the service worker can serve it to anyone. Auth gating happens
 * client-side (HomeAuthGate, reusing resolveSessionGate, same as /humidor);
 * the proxy still 401s/redirects unauth requests. Per-user data arrives
 * client-side in the islands via SWR. News stays a public server island.
 */
export const runtime = "edge";

export default function HomePage() {
  return (
    <>
      {/* Client auth gate: redirects to /login or /onboarding after mount. */}
      <HomeAuthGate />

      {/* 0. Masthead (full-width greeting + admin link) — client island. */}
      <MastheadIsland />

      <div className="px-4 sm:px-6 pt-6 pb-6 flex flex-col gap-6 max-w-2xl mx-auto">

        {/* 1. Tonight's Pairing — primary CTAs, no data. */}
        <TonightsPairing />

        {/* 2. Dashboard pager: conditions · notifications · aging. */}
        <DashboardPager initialIndex={1}>
          <SmokingConditionsIsland />
          <NotificationsIsland />
          <AgingIsland />
        </DashboardPager>

        {/* 4. The Wire (news) — public server island, streams independently. */}
        <Suspense fallback={<NewsSkeleton />}>
          <NewsIsland />
        </Suspense>

        {/* 5. Field Guide — self-fetching client; in static shell. */}
        <FieldGuide />

        {/* 6. Local Shops — client island (reads profile ZIP). */}
        <LocalShopsIsland />

      </div>
    </>
  );
}
