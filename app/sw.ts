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
 *   Navigation requests      → NetworkFirst, /offline fallback
 *   /_next/static/*          → CacheFirst, immutable
 *   Same-origin images       → SWR, capped 50 entries / 30d
 *   Supabase Storage public  → SWR, capped 100 entries / 7d
 *   Supabase REST + Auth     → NetworkOnly (NEVER cached)
 *   RSC (`?_rsc=`) payloads  → NetworkOnly (per-user data)
 */

import {
  Serwist,
  CacheFirst,
  NetworkFirst,
  NetworkOnly,
  StaleWhileRevalidate,
  ExpirationPlugin,
  CacheableResponsePlugin,
  type PrecacheEntry,
} from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[];
};

const OFFLINE_URL = "/offline";

/* ── Initialise Serwist with the precache manifest ───────────────── */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
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
            maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
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

    /* ── Navigation (page) requests: NetworkFirst, offline last ── */
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "navigations",
        networkTimeoutSeconds: 5,
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({
            maxEntries:    25,
            maxAgeSeconds: 60 * 60 * 24, // 1 day
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
  ],

  /*
   * Offline fallback for navigation requests that can't be served
   * from network OR cache. The /offline page itself is precached
   * because it's prerendered at build time (see
   * `precachePrerendered: true` in serwist.config.mjs).
   */
  fallbacks: {
    entries: [
      {
        url:     OFFLINE_URL,
        matcher: ({ request }) => request.mode === "navigate",
      },
    ],
  },
});

serwist.addEventListeners();

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
        try {
          await (client as WindowClient).navigate(targetUrl);
        } catch {
          // navigate() can fail cross-origin or in some PWA modes;
          // we still focus the existing window below.
        }
        return (client as WindowClient).focus();
      }
    }

    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
  })());
});
