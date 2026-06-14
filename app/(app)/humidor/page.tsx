import { HumidorRoute } from "./HumidorRoute";

/*
 * Humidor — static client shell. No server data fetch and no
 * getServerUser() here, so the route renders user-agnostic HTML that
 * the service worker can serve to anyone (it carries no PII; per-user
 * data arrives client-side in HumidorClient). Auth gating happens
 * client-side in HumidorRoute; the proxy still 401s the data queries.
 */
export default function HumidorPage() {
  return <HumidorRoute />;
}
