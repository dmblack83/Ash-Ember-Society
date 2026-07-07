#!/usr/bin/env node
/* ------------------------------------------------------------------
   check-static-shells.mjs

   Guard: every bottom-nav route must prerender as a STATIC shell.

   Why: the bottom nav (app/(app)/layout.tsx NAV_ITEMS) links with
   prefetch={true}. For a static route that prefetch is a cheap CDN
   hit; for a DYNAMIC route it triggers the full server render on
   every page where the nav is visible, i.e. every app open. When
   /lounge went dynamic-and-heavy (PR #555), cold-connection tab taps
   on Lounge/Discover/Account went dead until the connection warmed
   (fixed in PR #557 by converting it back to a static shell).

   A route is a static shell when its page.tsx has no server data
   fetch and no getServerUser() — auth gates client-side via
   useGatedSession, data arrives via SWR. Static routes appear in
   .next/prerender-manifest.json after `next build`.

   Run after a build:  npm run check:shells
   Update SHELL_ROUTES when bottom-nav tabs change (keep in sync
   with NAV_ITEMS in app/(app)/layout.tsx).
   ------------------------------------------------------------------ */

import { readFileSync } from "node:fs";

const SHELL_ROUTES = [
  "/home",
  "/humidor",
  "/lounge",
  "/discover/cigar-news",
  "/account",
];

let manifest;
try {
  manifest = JSON.parse(readFileSync(".next/prerender-manifest.json", "utf8"));
} catch {
  console.error(
    "[check-shells] .next/prerender-manifest.json not found - run `npm run build` (or `npm run analyze`) first.",
  );
  process.exit(1);
}

const staticRoutes = new Set(Object.keys(manifest.routes ?? {}));
const regressed    = SHELL_ROUTES.filter((r) => !staticRoutes.has(r));

if (regressed.length > 0) {
  console.error("[check-shells] FAIL: bottom-nav route(s) no longer prerender as static shells:");
  for (const r of regressed) console.error(`  ${r}`);
  console.error(
    "\nThe bottom nav prefetches these routes with prefetch={true}; a dynamic route" +
    "\nhere runs its full server render on every app open and stalls cold-network" +
    "\ntab taps. Convert the route back to a static client shell (reference:" +
    "\napp/(app)/humidor/HumidorRoute.tsx, app/(app)/lounge/LoungeRoute.tsx):" +
    "\nno getServerUser() or server data fetch in page.tsx; gate via useGatedSession;" +
    "\nfetch data client-side via SWR.",
  );
  process.exit(1);
}

console.log(`[check-shells] OK: ${SHELL_ROUTES.length} bottom-nav routes prerender as static shells.`);
