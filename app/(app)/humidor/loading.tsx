/*
 * Humidor route-prefetch loading state.
 *
 * Renders during client-side navigation before the page tree mounts.
 * The in-page Suspense fallback in `page.tsx` uses the same skeleton
 * so the swap from prefetch → page → real content is seamless.
 */

import { HumidorShellSkeleton } from "./_skeletons";

export default function HumidorLoading() {
  return <HumidorShellSkeleton />;
}
