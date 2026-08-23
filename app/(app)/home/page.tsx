import { TonightsPairing } from "@/components/dashboard/TonightsPairing";
import { FieldGuide }      from "@/components/dashboard/FieldGuide";

import {
  MastheadIsland,
  DashboardPagerIsland,
  LastBurnIsland,
  BlindDrawIsland,
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

      {/* Desktop (lg+) flows the same sections into two centered columns —
          personal column left, ambient column right (2026-08-23 desktop UX
          spec, item 02). Pure CSS: the two wrapper divs preserve the mobile
          stacking order exactly, and the pager keeps all its slides. */}
      <div className="px-4 sm:px-6 pt-6 pb-6 max-w-2xl lg:max-w-5xl mx-auto lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-6 lg:items-start">

        <div className="flex flex-col gap-6">

          {/* 1. Tonight's Pairing — primary CTAs, no data. */}
          <TonightsPairing />

          {/* 2. Dashboard pager: conditions · notifications · aging · sensor. */}
          <DashboardPagerIsland />

          {/* 3. The Last Burn — latest log / On This Day; hidden with no logs. */}
          <LastBurnIsland />

          {/* 4. The Blind Draw — random-cigar card; hidden under 2 unique cigars. */}
          <BlindDrawIsland />

        </div>

        <div className="flex flex-col gap-6 mt-6 lg:mt-0">

          {/* 5. The Wire (news) — public client island via SWR. */}
          <NewsClientIsland />

          {/* 6. Field Guide — self-fetching client; in static shell. */}
          <FieldGuide />

          {/* 7. Local Shops — client island (reads profile ZIP). */}
          <LocalShopsIsland />

        </div>

      </div>
    </PullToRefresh>
  );
}
