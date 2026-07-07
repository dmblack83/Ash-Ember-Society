import { LoungeRoute } from "./LoungeRoute";

export const metadata = { title: "The Lounge — Ash & Ember Society" };

/*
 * Lounge — static client shell (same pattern as /humidor and /account).
 * No server data fetch and no getServerUser() here, so the route
 * renders user-agnostic HTML the service worker can serve to anyone
 * (it carries no PII; the feed and shell data arrive client-side via
 * SWR under RLS). Auth gating happens client-side in LoungeRoute; the
 * proxy still 401s/redirects unauthenticated requests.
 *
 * Why this matters: the bottom nav prefetches this route with
 * prefetch={true}. A static route makes that prefetch a cheap CDN hit;
 * the previous dynamic version ran the full feed render server-side on
 * every app open and stalled cold-network tab taps.
 *
 * ?c=<chip>&v=<view> still select the chip and secondary view —
 * LoungeFeedClient reads them from useSearchParams; chip taps update
 * the URL via shallow pushState with no server round-trip.
 */
export default function LoungePage() {
  return <LoungeRoute />;
}
