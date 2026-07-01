import { WishlistRoute } from "./WishlistRoute";

export const metadata = { title: "Wishlist — Ash & Ember Society" };

/*
 * Wishlist — static client shell (same pattern as /humidor). No server
 * data fetch and no getServerUser(), so the route renders user-agnostic
 * HTML the service worker can serve to anyone. Auth gating happens
 * client-side in WishlistRoute; the proxy still 401s/redirects
 * unauthenticated requests, and RLS scopes the client query.
 */
export default function WishlistPage() {
  return <WishlistRoute />;
}
