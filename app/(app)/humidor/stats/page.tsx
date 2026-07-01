import { StatsRoute } from "./StatsRoute";

export const metadata = { title: "Stats — Ash & Ember Society" };

/*
 * Humidor Stats — static client shell (same pattern as /humidor).
 * The raw-row queries and chart-data assembly that used to run here
 * server-side now run client-side in lib/data/stats-fetchers.ts using
 * the shared pure builder (lib/stats/build-stats.ts). Auth gating
 * happens client-side in StatsRoute; the proxy still 401s/redirects
 * unauthenticated requests, and RLS scopes the client queries.
 */
export default function StatsPage() {
  return <StatsRoute />;
}
