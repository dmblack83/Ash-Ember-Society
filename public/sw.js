/*
 * Ash & Ember Society — minimal service worker
 *
 * Single purpose: satisfy the browser's "installable PWA" criteria
 * so that Chrome / Edge / Android Chrome show their native install
 * prompt (and the BeforeInstallPromptEvent fires).
 *
 * Deliberately does NOT cache anything. We don't want offline
 * support yet — too easy to ship stale HTML or per-user data by
 * mistake. Repeat-visit speed already comes from HTTP cache headers
 * on /_next/static and /_next/image (see next.config.ts).
 *
 * If you later want offline shell or asset caching, replace this
 * file via the Serwist / Workbox flow rather than hand-rolling.
 */

self.addEventListener("install", () => {
  // Activate this version immediately, displacing any older SW.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take control of all open clients on first activation.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Intentionally empty. The browser handles every request the way
  // it normally would. Chrome's installability check just needs
  // SOME registered fetch handler to exist.
});
