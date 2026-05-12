/*
 * Serwist build config.
 *
 * Serwist runs as a POST-BUILD step (not a bundler plugin), so it
 * stays compatible with Turbopack. The flow is:
 *
 *   1. `next build` writes the production bundle to `.next/`.
 *   2. `serwist build` reads this config, scans the build output for
 *      files to precache, bundles `app/sw.ts` with esbuild
 *      (resolving the `serwist` runtime imports), and writes the
 *      result to `public/sw.js`.
 *   3. Vercel deploys `public/sw.js` as a static asset.
 *
 * The generated SW is git-ignored — see `.gitignore`. Source of
 * truth lives in `app/sw.ts`.
 */

import { serwist } from "@serwist/next/config";

export default await serwist({
  swSrc:  "app/sw.ts",
  swDest: "public/sw.js",
  /*
   * `precachePrerendered: false` — flipped after diagnosing a SW
   * install failure that hung push notifications on fresh iOS PWA
   * installs.
   *
   * Root cause: with this flag on, Serwist precaches every prerendered
   * route the Next build produces. Some of those routes are auth-
   * gated by `proxy.ts` (notably `/discover/content`, `/discover/
   * vendors`, and `/public/badge-preview`). The SW's precache fetch
   * runs without auth cookies, so the proxy returns a 307 redirect
   * to `/login`. Serwist's CacheableResponsePlugin only accepts
   * statuses [0, 200] — a 307 breaks precache, throws during install,
   * and the SW never activates. `navigator.serviceWorker.ready`
   * never resolves, so every push code path (getCurrentSubscription,
   * subscribe) hangs forever with no error surface.
   *
   * Disabling prerendered precaching skips the auth-gated routes
   * entirely and lets the SW install cleanly. Cost: `/login`,
   * `/signup`, `/privacy`, `/terms`, `/offline` aren't available
   * for an offline first-visit. They're cached on first online
   * visit via the NetworkFirst navigation rule in `app/sw.ts`, so
   * realistic offline impact is nil.
   */
  precachePrerendered: false,
});
