/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

/*
 * Ash & Ember Society — service worker
 * ──────────────────────────────────────────────────────────────────
 * Built by Serwist (`serwist.config.mjs`) into `public/sw.js`.
 *
 * Two responsibilities:
 *
 *   1. Caching — runtime strategies per resource class. See the
 *      strategy table below. ONLY static, content-hashed, or
 *      non-personalised resources are cached. Navigation HTML is
 *      explicitly NOT intercepted by this SW; the browser fetches
 *      every page directly from origin.
 *
 *   2. Push notifications — receives web-push payloads, shows a
 *      Notification, and routes taps to the right URL.
 *
 * Why navigation is not handled here
 * ──────────────────────────────────
 * Earlier versions used `NetworkFirst` for navigation with an
 * auth-partitioned cache as offline fallback. In practice that
 * produced a brutal failure mode on iOS standalone PWAs: when
 * Supabase auth was slow on resume, NetworkFirst fell back to
 * cached HTML from a prior deploy. That HTML referenced chunk
 * hashes the current build no longer ships. Chunks 404, hydration
 * never completes, the user sees a frozen app — and force-closing
 * the PWA doesn't help because the SW + its caches survive process
 * death. Only iOS evicting the SW eventually unstuck it.
 *
 * Removing navigation handling means every page request goes
 * straight to origin, exactly like a regular website. Stale HTML
 * becomes impossible by construction. We lose the branded /offline
 * page; offline users see the browser's default offline UI instead.
 * Acceptable trade.
 *
 * Strategy table
 * ──────────────
 *   Navigation requests      → NOT INTERCEPTED (browser default)
 *   Precached HTML           → DISABLED (`precachePrerendered: false`
 *                              in serwist.config.mjs)
 *   /_next/static/*          → CacheFirst, immutable (URL-hashed)
 *   Same-origin images       → SWR, capped 50 entries / 30d
 *   Supabase Storage public  → SWR, capped 100 entries / 7d
 *   Supabase REST + Auth     → NetworkOnly (explicit, kept for clarity)
 *   RSC (`?_rsc=`) payloads  → NetworkOnly (explicit, kept for clarity)
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

/* ── Initialise Serwist with the precache manifest ───────────────── */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  /*
   * Skip waiting + clientsClaim mean a deployed update takes effect
   * on the user's next page load without a manual reload. Cache-
   * Control on /sw.js (`max-age=0, must-revalidate` in next.config.ts)
   * ensures the browser picks up the new SW file in a timely manner.
   */
  skipWaiting:    true,
  clientsClaim:   true,
  /*
   * navigationPreload is intentionally OFF. It's pointless without
   * a navigation matcher (nothing consumes the preload response),
   * and turning it off shaves work off every page navigation in the
   * SW context.
   */
  navigationPreload: false,

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

    /* Navigation requests are intentionally NOT matched here. The
       browser fetches every page directly from origin, eliminating
       the stale-cached-HTML failure mode. See the file header for
       the full rationale. */
  ],
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

/* ──────────────────────────────────────────────────────────────────
   Offline mutation outbox replay (Phase 5 P5.6).

   The browser fires `sync` events when connectivity returns or in
   periodic background windows. lib/offline-outbox.ts (client side)
   registers the tag "ae-outbox-sync" after enqueuing a record;
   when the browser triggers it, this handler opens the same IDB
   database, replays each pending request, and deletes successful
   ones.

   The IDB schema MUST stay in lockstep with lib/offline-outbox.ts.
   Schema changes there require updating both files (the SW can't
   import from app code — different bundle).

   Reliability:
   - 4xx (except 408/429) → permanent failure: delete the record
     so we don't retry forever on a malformed request.
   - 5xx / network / 408 / 429 → transient: leave for next sync.
   - Successful → delete.
   - Throws (browser kills the worker) → records stay; next sync
     event picks them up.

   Browsers without SyncManager (Safari) skip this path. The
   client-side OutboxManager listens for `online` events and
   triggers replay via a regular fetch loop when sync isn't
   available.
   ────────────────────────────────────────────────────────────── */

const OUTBOX_DB    = "ae-offline-outbox";
const OUTBOX_STORE = "mutations";
const OUTBOX_DB_VERSION = 1;
const OUTBOX_SYNC_TAG   = "ae-outbox-sync";

interface OutboxRecord {
  id:          string;
  user_id:     string;
  category:    string;
  url:         string;
  method:      string;
  headers:     Record<string, string>;
  body:        string | null;
  contentType: string | null;
  created_at:  number;
}

function openOutboxDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB, OUTBOX_DB_VERSION);
    req.onerror   = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      /* DB upgrade is normally driven by the client; the SW only
         creates the schema here as a safety net so a SW that runs
         before the client has ever touched IDB doesn't crash. */
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const store = db.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
        store.createIndex("user_id",    "user_id",    { unique: false });
        store.createIndex("created_at", "created_at", { unique: false });
      }
    };
  });
}

async function readAllOutboxRecords(db: IDBDatabase): Promise<OutboxRecord[]> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(OUTBOX_STORE, "readonly");
    const req = tx.objectStore(OUTBOX_STORE).getAll();
    req.onerror   = () => reject(req.error);
    req.onsuccess = () => resolve(req.result as OutboxRecord[]);
  });
}

async function deleteOutboxRecord(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    tx.objectStore(OUTBOX_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function replayOutbox(): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openOutboxDB();
  } catch {
    return; // IDB unavailable — nothing to replay
  }

  try {
    const records = await readAllOutboxRecords(db);
    if (records.length === 0) return;

    /* Sequential replay so order is preserved. Some mutations may
       depend on earlier ones (e.g., create-then-update flows). */
    for (const rec of records) {
      try {
        const init: RequestInit = {
          method:      rec.method,
          headers:     rec.headers,
          credentials: "include",
        };
        if (rec.body !== null && rec.method !== "GET" && rec.method !== "HEAD") {
          init.body = rec.body;
        }

        const res = await fetch(rec.url, init);

        if (res.ok) {
          await deleteOutboxRecord(db, rec.id);
          continue;
        }

        /* 4xx (except 408 timeout, 429 rate-limit) are permanent —
           drop the record so we don't replay forever on a malformed
           or auth-rejected request. */
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          await deleteOutboxRecord(db, rec.id);
          continue;
        }

        /* 5xx, 408, 429: leave for next sync. */
      } catch {
        /* Network still failing — leave for next sync. */
      }
    }
  } finally {
    db.close();
  }
}

/* SyncEvent isn't in the default DOM lib. Declare a minimal type. */
interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
  readonly lastChance: boolean;
}

self.addEventListener("sync", (event) => {
  const e = event as unknown as SyncEvent;
  if (e.tag === OUTBOX_SYNC_TAG) {
    e.waitUntil(replayOutbox());
  }
});
