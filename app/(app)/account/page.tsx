import { AccountRoute } from "./AccountRoute";

export const metadata = { title: "Account — Ash & Ember Society" };

/*
 * Account — static client shell (same pattern as /humidor and /home).
 * No server data fetch and no getServerUser() here, so the route
 * renders user-agnostic HTML the service worker can serve to anyone
 * (it carries no PII; the profile row arrives client-side via SWR
 * under own-row RLS). Auth gating happens client-side in AccountRoute;
 * the proxy still 401s/redirects unauthenticated requests.
 */
export default function AccountPage() {
  return <AccountRoute />;
}
