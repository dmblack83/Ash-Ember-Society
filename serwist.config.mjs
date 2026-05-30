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
  /*
   * Exclude app-store and splash assets from the precache manifest.
   *
   * Root cause of push notification hang on fresh install:
   * The default `public/**\/*` glob sweeps in 150+ binary files from
   * `public/appstore-images/` — 16 iOS splash PNGs (7.4 MB), ~60
   * Windows Store image variants (~1.7 MB), and ~30 Android/iOS icon
   * sizes. These files are NEVER fetched by the running web app:
   *   - iOS uses splash PNGs at the OS level before WKWebView starts
   *   - Windows/Android store images are only used in platform stores
   * Because they land in the SW precache manifest, the SW's `install`
   * event must download all ~9 MB before the SW can activate. iOS
   * throttles SW background downloads and serialises them — on mobile
   * this takes 60-120 s.  `navigator.serviceWorker.ready` stays
   * pending for the entire duration, so `getActiveRegistration()`
   * blocks and the push-subscribe flow appears completely frozen.
   *
   * Excluding them drops the precache from ~226 → ~70 entries and
   * from ~10 MB → ~1-2 MB — SW install now completes in ~5-10 s on
   * mobile and push subscription works on first install.
   *
   * The `public/.appstore-images-bak/` entry covers the local backup
   * directory (not deployed, but belt-and-suspenders).
   *
   * Patterns match against paths relative to the project root
   * (`globDirectory = cwd`), matching the `public/**\/*` glob's
   * base.
   */
  globIgnores: [
    "public/appstore-images/**",
    "public/.appstore-images-bak/**",
    /*
     * Admin/dev preview tool that lives in `public/` so it can be
     * iframed by an internal page. proxy.ts auth-gates the URL —
     * returns 401 in a cookieless context, which is exactly what
     * the SW install fetch is.
     *
     * If Serwist precaches this entry (the default
     * `public/<asterisk><asterisk>/<asterisk>` glob will sweep it
     * in unless excluded here), the install step issues a fetch,
     * gets 401, CacheableResponsePlugin rejects (statuses [0, 200]
     * only), the precache promise never resolves, install hangs in
     * "installing" forever, `navigator.serviceWorker.ready` never
     * resolves on the page, and push notifications time out at the
     * 120s SW_INSTALL_TIMEOUT_MS in lib/push-client.ts.
     *
     * Diagnosed 2026-05-30 with explicit SW-state capture (PR #472)
     * after 5+ prior fixes targeted the symptom from different angles
     * and didn't stick. The pattern fits "regression without
     * detection" — see scripts/check-sw-precache.mjs which now gates
     * the deployed precache manifest against this exact failure mode
     * on every push to main.
     */
    "public/badge-preview.html",
  ],
});
