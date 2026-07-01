import { TonightsPairing } from "@/components/dashboard/TonightsPairing";
import { FieldGuide }      from "@/components/dashboard/FieldGuide";
import { DashboardPager }  from "@/components/dashboard/DashboardPager";

import {
  MastheadIsland,
  SmokingConditionsIsland,
  NotificationsIsland,
  AgingIsland,
  LocalShopsIsland,
  NewsClientIsland,
} from "./client-islands";
import { HomeAuthGate } from "./HomeAuthGate";
import { PullToRefresh } from "@/components/ui/PullToRefresh";

/*
 * Fully STATIC, user-agnostic shell — no getServerUser(), no server
 * reads at all, so the document is prerendered at build time and
 * served from the CDN edge with zero server work. (The previous
 * `runtime = "edge"` + server news island kept this route dynamic:
 * every cold navigation paid a server render. News moved to a client
 * island — public data via SWR — to remove the last server read.)
 *
 * Auth gating happens client-side (HomeAuthGate, reusing
 * resolveSessionGate, same as /humidor); the proxy still
 * 401s/redirects unauth requests. Per-user data arrives client-side
 * in the islands via SWR.
 */
export default function HomePage() {
  return (
    <PullToRefresh>
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

        {/* 4. The Wire (news) — public client island via SWR. */}
        <NewsClientIsland />

        {/* 5. Field Guide — self-fetching client; in static shell. */}
        <FieldGuide />

        {/* 6. Local Shops — client island (reads profile ZIP). */}
        <LocalShopsIsland />

      </div>
    </PullToRefresh>
  );
}
