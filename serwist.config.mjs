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
   * `precachePrerendered: false` — flipped after the navigation
   * interception was removed from `app/sw.ts`. The SW no longer
   * touches navigation requests at all, so precached HTML had no
   * route serving it and was dead weight in the cache. Removing
   * it also closes off the failure mode where iOS PWAs re-launched
   * onto stale precached HTML referencing chunks from a previous
   * deploy.
   */
  precachePrerendered: false,
});
