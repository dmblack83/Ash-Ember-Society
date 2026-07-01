import { BurnReportsRoute } from "./BurnReportsRoute";

export const metadata = { title: "My Burn Reports — Ash & Ember Society" };

/*
 * My Burn Reports — static client shell (same pattern as /humidor).
 * The reports + flavor-tags + byline assembly that used to run here
 * server-side now runs client-side in lib/data/burn-reports-fetchers.ts
 * (same queries, same thirds tag-name batch). Auth gating happens
 * client-side in BurnReportsRoute; the proxy still 401s/redirects
 * unauthenticated requests, and RLS scopes the client queries.
 */
export default function BurnReportsPage() {
  return <BurnReportsRoute />;
}
