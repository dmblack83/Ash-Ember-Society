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
   * Precache prerendered HTML so static pages (login, signup, the
   * marketing landing, and `/offline`) are instantly available
   * offline. Dynamic pages (`/home`, `/humidor`, etc.) are not
   * prerendered and don't end up in the precache — they go through
   * the runtime NetworkFirst route in `app/sw.ts`.
   */
  precachePrerendered: true,
});
