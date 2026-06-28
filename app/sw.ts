/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

/*
 * Ash & Ember Society — service worker
 * ──────────────────────────────────────────────────────────────────
 * Built by Serwist (`serwist.config.mjs`) into `public/sw.js`.
 *
 * Three responsibilities:
 *
 *   1. Caching — runtime strategies per resource class. See the
 *      strategy table below. Stale-or-personalised data is never
 *      cached; only public/static resources.
 *
 *   2. Offline navigation fallback — if a page request fails (no
 *      network) and isn't in the precache, the user lands on
 *      `/offline` instead of a chrome error page.
 *
 *   3. Push notifications — receives web-push payloads, shows a
 *      Notification, and routes taps to the right URL. Ported
 *      verbatim from the previous hand-written sw.js so existing
 *      subscriptions keep working.
 *
 * Strategy table
 * ──────────────
 *   Navigation requests      → NetworkFirst, /offline fallback (never cached)
 *   /_next/static/*          → CacheFirst, immutable
 *   Same-origin images       → SWR, capped 50 entries / 30d
 *   Supabase Storage public  → SWR, capped 100 entries / 7d
 *   Supabase REST + Auth     → NetworkOnly (NEVER cached)
 *   RSC (`?_rsc=`) payloads  → NetworkOnly (per-user data)
 */

import {
  Serwist,
  CacheFirst,
  NetworkOnly,
  StaleWhileRevalidate,
  ExpirationPlugin,
  CacheableResponsePlugin,
  type PrecacheEntry,
} from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[];
};

/* ──────────────────────────────────────────────────────────────────
   Reliability telemetry bridge.

   The SW runs in a separate bundle and cannot import @sentry/nextjs.
   To get SW events into Sentry, post a RELIABILITY_EVENT message to
   every controlled client. The client-side ReliabilityBootstrap
   component (components/system/ReliabilityBootstrap.tsx) forwards
   the message into trackReliability.

   Fire-and-forget: postMessage to detached clients can throw; we
   swallow so the SW lifecycle is never blocked by telemetry. */
type ReliabilityBucket =
  | "sw_lifecycle"
  | "auth_session"
  | "network_resilience"
  | "ios_webkit"
  | "state_persistence";

interface SwReliabilityPayload {
  bucket:  ReliabilityBucket;
  subtype: string;
  cause?:  string;
  detail?: string;
  extra?:  Record<string, string | number | boolean>;
}

async function postReliability(p: SwReliabilityPayload): Promise<void> {
  try {
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    for (const client of clients) {
      try {
        client.postMessage({ type: "RELIABILITY_EVENT", ...p });
      } catch {
        /* detached client — non-fatal */
      }
    }
  } catch {
    /* matchAll may fail on iOS — non-fatal */
  }
}

const OFFLINE_URL = "/offline";

/* Dedicated cache for the user-agnostic offline fallback page. The app
   shell is never cached (see the navigation rule below), so this is the
   only thing a failed navigation can fall back to. */
const OFFLINE_CACHE = "ae-offline-fallback";

/* Legacy cache name from the old auth-partitioned StaleWhileRevalidate
   navigation rule. No longer written; purged on activate so no installed
   PWA can serve stale authenticated HTML after this update. */
const LEGACY_NAV_CACHE = "navigations";

/* ── Initialise Serwist with the precache manifest ───────────────── */
const serwist = new Serwist({
  precacheEntries: [
    ...self.__SW_MANIFEST,
    /* HISTORICAL: this list previously also included /offline, /login,
       /signup, /privacy, /terms, /eula — public routes precached for
       first-visit offline. They were removed 2026-05-30 because the
       SW install context fetches without cookies, and any one of those
       routes returning non-200 (a proxy.ts redirect, an RSC cookie
       branch, a transient server error) fails the entire precache step.
       CacheableResponsePlugin only accepts 200, so a single bad
       response rejects install, the SW never activates, and
       navigator.serviceWorker.ready hangs for the full 120s timeout
       window. That bug surfaced as a multi-week "push notifications
       won't turn on" complaint with 5+ targeted fixes that didn't
       stick — pattern indicating an architectural problem (the
       explicit list is fragile in ways the build doesn't catch).

       Only hashed /_next/static/* entries (from __SW_MANIFEST) are
       precached now. Those are immutable, always 200, and can't fail
       in the SW context. Offline-on-first-visit for /login etc. is
       lost — comment in serwist.config.mjs already accepts that
       trade-off ("realistic offline impact is nil"). The
       NetworkFirst-ish runtime nav cache (StaleWhileRevalidate below)
       still captures these on first online visit, so subsequent
       offline loads work the same as before for any user who's
       visited the page at least once.

       DO NOT add explicit URL entries back here without ALSO adding
       a CI smoke test that fetches each one without cookies and
       asserts 200. See docs/superpowers/specs/2026-05-30-* . */
  ],
  /*
   * Skip waiting + clientsClaim mirror the old sw.js behaviour, so
   * a deployed update takes effect on the user's next page load
   * without a manual reload. Cache-Control on /sw.js (`max-age=0,
   * must-revalidate` in next.config.ts) ensures the browser picks
   * up the new SW file in a timely manner.
   */
  skipWaiting:    true,
  clientsClaim:   true,
  navigationPreload: true,

  /*
   * Runtime caches — first match wins, evaluated top to bottom.
   * Order matters: more-specific Supabase rules MUST come before
   * the generic same-origin image rule.
   */
  runtimeCaching: [
    /* ── Supabase REST + Auth: NEVER cache personalised data ─── */
    {
      matcher: ({ url }) =>
        url.hostname.endsWith(".supabase.co") &&
        (url.pathname.startsWith("/rest/") ||
         url.pathname.startsWith("/auth/")),
      handler: new NetworkOnly(),
      method:  "GET",
    },
    {
      matcher: ({ url }) =>
        url.hostname.endsWith(".supabase.co") &&
        (url.pathname.startsWith("/rest/") ||
         url.pathname.startsWith("/auth/")),
      handler: new NetworkOnly(),
      method:  "POST",
    },

    /* ── Supabase Storage public buckets: SWR ─────────────────── */
    {
      matcher: ({ url }) =>
        url.hostname.endsWith(".supabase.co") &&
        url.pathname.startsWith("/storage/v1/object/public/"),
      handler: new StaleWhileRevalidate({
        cacheName: "supabase-public-storage",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({
            maxEntries:    100,
            maxAgeSeconds: 60 * 60 * 24 * 6, // 6 days — expires before iOS 7-day eviction window
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },

    /* ── RSC payloads (per-user): NEVER cache ─────────────────── */
    {
      matcher: ({ url, request }) =>
        url.searchParams.has("_rsc") ||
        request.headers.get("rsc") === "1" ||
        request.headers.get("next-router-state-tree") !== null,
      handler: new NetworkOnly(),
    },

    /* ── Hashed Next static assets: CacheFirst forever ────────── */
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "next-static",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({
            maxEntries:    200,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },

    /* ── next/image optimised output: SWR ─────────────────────── */
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && url.pathname.startsWith("/_next/image"),
      handler: new StaleWhileRevalidate({
        cacheName: "next-image",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({
            maxEntries:    50,
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },

    /* ── Same-origin static images: SWR ───────────────────────── */
    {
      matcher: ({ url, sameOrigin, request }) =>
        sameOrigin &&
        request.destination === "image" &&
        !url.pathname.startsWith("/_next/"),
      handler: new StaleWhileRevalidate({
        cacheName: "static-images",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({
            maxEntries:    50,
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },

    /* ── Fonts (Google Fonts CDN): CacheFirst ─────────────────── */
    {
      matcher: ({ url }) =>
        url.hostname === "fonts.googleapis.com" ||
        url.hostname === "fonts.gstatic.com",
      handler: new CacheFirst({
        cacheName: "google-fonts",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({
            maxEntries:    20,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },

    /* ── Navigation (page) requests: network-first, /offline fallback ──
     *
     * The entire app is authenticated, so navigation HTML always embeds
     * per-user data. We therefore NEVER cache it: no auth-partition key
     * to maintain, no risk of serving User A's shell to User B, no stale
     * shell after a deploy. Always fetch live; on network failure fall
     * back to the cached, user-agnostic /offline page.
     *
     * This is the rhyme.com model adapted to an all-authenticated app:
     * cache public assets, never the shell. See
     * docs/superpowers/specs/2026-06-28-pwa-strategy-rhyme-audit.md
     */
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: async ({ request, event }) => {
        try {
          /* Consume the navigation preload the browser started in parallel
             with SW boot (navigationPreload: true). preloadResponse resolves
             to undefined when no preload was sent, so fall back to a normal
             fetch. This avoids a wasted double request and shrinks cold-launch
             TTFB. The DOM lib types preloadResponse as Promise<any>, hence the
             cast. */
          const fetchEvent = event as FetchEvent | undefined;
          const preload = (await fetchEvent?.preloadResponse) as Response | undefined;
          return preload ?? (await fetch(request));
        } catch {
          const cached = await caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE });
          return cached ?? Response.error();
        }
      },
    },
  ],

});

serwist.addEventListeners();

/* ──────────────────────────────────────────────────────────────────
   Cache the offline fallback page on install.

   Network-first navigation (runtimeCaching below) never writes the
   authenticated shell to cache, so a failed navigation has nowhere to
   land unless we stash the generic /offline page here. /offline is not
   auth-gated (proxy.ts), so it returns 200 cookieless.

   fetch + cache.put (NOT cache.add) so a transient non-200 resolves
   without throwing — a rejected install waitUntil would hang activation
   and freeze push-subscribe, the exact failure class we removed in 2026-05. */
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      const res = await fetch(OFFLINE_URL, { cache: "reload" });
      if (res.ok) {
        const cache = await caches.open(OFFLINE_CACHE);
        await cache.put(OFFLINE_URL, res.clone());
      }
    } catch {
      /* offline at install time — non-fatal; the page just won't be
         available until a later install runs online. */
    }
  })());
});

/* ──────────────────────────────────────────────────────────────────
   Storage quota diagnostic — passive, non-blocking.

   Logs available and used storage quota to the console on every SW
   install. Useful for identifying if real-world devices approach iOS's
   50MB cap. No behavioral change. */
self.addEventListener("install", () => {
  void (async () => {
    try {
      const est   = await navigator.storage.estimate();
      const used  = Math.round((est.usage  ?? 0) / 1024 / 1024 * 10) / 10;
      const quota = Math.round((est.quota  ?? 0) / 1024 / 1024);
      console.log(`[sw] storage: ${used}MB used / ${quota}MB quota`);
    } catch { /* estimate() may be unavailable in some contexts; non-fatal */ }
  })();
});

/* ──────────────────────────────────────────────────────────────────
   SW update notification — tell open clients when a new SW activates

   When a deploy ships, Serwist activates the new SW under any
   already-open tab (skipWaiting + clientsClaim above). The tab keeps
   running the OLD JS chunks until the user navigates to a new route
   that needs a chunk that no longer exists, at which point our
   stale-chunk-recovery script (#288) reactively reloads — with a
   visible flash.

   Posting `SW_UPDATED` to every controlled client on activate lets a
   client-side hook surface a non-blocking "Update available" prompt,
   so the user reloads cleanly before they hit the bad-chunk window.

   We fire on EVERY activate (including the very first install). The
   client filters out the first-install case by capturing
   `navigator.serviceWorker.controller` at mount time — if it was
   null, there's no prior SW to "update from" and the message is
   ignored. See components/system/ServiceWorkerUpdateNotice.tsx.

   Multiple activate listeners coexist; this runs alongside (not in
   place of) Serwist's built-in activate behavior wired up above.

   IMPORTANT: Do NOT use event.waitUntil() here. self.clients.matchAll()
   hangs indefinitely on iOS Safari during a fresh install (no prior SW
   in place), which prevents the SW from ever reaching "activated" state.
   navigator.serviceWorker.ready then never resolves, and push subscribe
   times out. PR #381 identified this pattern; PR #427 fixes it by making
   the postMessage fire-and-forget so activation is never blocked. */
/* Stable per-build identifier derived from the Serwist precache manifest.
   The manifest array is regenerated on every build with content-hash
   revisions, so concatenating revisions gives a string that:
     - is identical across SW restarts within the same build
     - differs the moment a new build ships
   We pass this with every SW_UPDATED broadcast so the client can dedupe
   on iOS, where the SW activate event fires more aggressively than spec
   expects (every PWA resume / reload), producing a banner cycle. The
   client suppresses repeats of the same version after the user has
   already acknowledged it via Reload. */
const SW_VERSION = (() => {
  const manifest = (self as unknown as { __SW_MANIFEST?: Array<{ revision: string }> }).__SW_MANIFEST ?? [];
  if (manifest.length === 0) return "unknown";
  /* Join all revisions so a single chunk change shifts the version,
     then cap length to keep the postMessage payload small. */
  return `v${manifest.length}-${manifest.map((e) => e.revision).join("").slice(0, 40)}`;
})();

/* One-time migration purge: delete the legacy auth-partitioned navigation
   cache. Prior builds cached per-user HTML under "navigations". That cache
   is never written now; deleting it guarantees no installed PWA serves a
   stale authenticated shell after this worker activates. caches.delete is
   reliable (unlike clients.matchAll on iOS), so waitUntil is safe here. */
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.delete(LEGACY_NAV_CACHE).then(() => undefined));
});

self.addEventListener("activate", () => {
  void (async () => {
    try {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const client of clients) {
        try {
          client.postMessage({ type: "SW_UPDATED", version: SW_VERSION });
        } catch {
          /* postMessage can throw on detached clients; non-fatal. */
        }
      }
    } catch (err) {
      /* matchAll can fail on iOS; non-fatal — but worth knowing. */
      void postReliability({
        bucket:  "sw_lifecycle",
        subtype: "activate_fail",
        cause:   "matchall_threw",
        detail:  err instanceof Error ? err.message : String(err),
      });
    }
  })();
});

/* ──────────────────────────────────────────────────────────────────
   Push notifications — ported from public/sw.js (the pre-Serwist SW).

   Payload shape (sent by lib/push.ts):
     {
       title:  string,           required
       body:   string,           required
       url?:   string,           opened on tap (default "/")
       tag?:   string,           collapses repeat notifications
       icon?:  string,           default "/icons/icon-192.png"
       badge?: string,           default "/icons/icon-192.png"
     }

   Payload is JSON. Malformed payloads fall back to a generic
   notification rather than crashing the SW (which would silently
   fail every subsequent push until the next reload).
   ────────────────────────────────────────────────────────────────── */

const DEFAULT_ICON  = "/icons/icon-192.png";
const DEFAULT_BADGE = "/icons/icon-192.png";

interface PushPayload {
  title?: string;
  body?:  string;
  url?:   string;
  tag?:   string;
  icon?:  string;
  badge?: string;
}

self.addEventListener("push", (event) => {
  let payload: PushPayload = {};
  try {
    payload = event.data ? (event.data.json() as PushPayload) : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Ash & Ember";
  /*
   * `renotify` is a non-standard NotificationOptions property that
   * Chromium supports but the TS DOM lib doesn't yet expose. When a
   * `tag` is set we want repeat notifications under the same tag to
   * actually re-alert the user, not silently replace the previous
   * one. Cast covers the missing property.
   */
  const options = {
    body:  payload.body  || "",
    icon:  payload.icon  || DEFAULT_ICON,
    badge: payload.badge || DEFAULT_BADGE,
    tag:   payload.tag,
    /* `data` is the only place to stash the URL — Notification's
       built-in fields don't carry arbitrary metadata across the
       click handler. */
    data:     { url: payload.url || "/" },
    renotify: Boolean(payload.tag),
  } as NotificationOptions;

  event.waitUntil(self.registration.showNotification(title, options));
});

/* Notification click — focus existing window or open new one. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data: { url?: string } | null =
    (event.notification.data as { url?: string } | null) ?? null;
  const targetUrl = data?.url || "/";

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({
      type:                "window",
      includeUncontrolled: true,
    });

    for (const client of allClients) {
      if ("focus" in client) {
        // Bring the running app forward, then hand it the target path so
        // it routes in place. No client.navigate() — that forces a full
        // reload and is unreliable in installed iOS PWAs. The app's
        // ServiceWorkerNavigator listens for AE_NAVIGATE and router.push()es.
        try {
          await (client as WindowClient).focus();
        } catch {
          // Some platforms refuse focus on certain client states; the
          // postMessage below still routes the already-visible app.
        }
        try {
          client.postMessage({ type: "AE_NAVIGATE", url: targetUrl });
          return;
        } catch {
          // Detached client — fall through to the next candidate.
          continue;
        }
      }
    }

    // No live app window — open one at the target route. For an installed
    // PWA this launches the app; in a browser it opens a tab.
    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
  })());
});
