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
  type SerwistPlugin,
  type PrecacheEntry,
} from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[];
};

const OFFLINE_URL = "/offline";

/* ──────────────────────────────────────────────────────────────────
   Auth-aware cache-key plugin

   Why: navigation HTML embeds per-user data (greeting, admin link,
   personalised islands once Phase 1 streams). With NetworkFirst the
   cache is consulted only as the offline fallback — but a shared
   device that goes offline must still never serve User A's cached
   HTML to User B after sign-out / sign-in.

   This plugin partitions the cache by auth identity. The cache key
   becomes `${url}#auth=${hash}` where `hash` is a short fingerprint
   of the request's Supabase auth cookies. Different users → different
   hashes → different cache entries; sign-out → empty hash → its own
   bucket. Same URL is served from the right partition.

   The actual NETWORK fetch still goes to the original URL; only the
   cache lookup/store key is mutated. SHA-256 truncated to 16 hex
   chars is collision-resistant enough for cache partitioning.
   ────────────────────────────────────────────────────────────── */

/* Extract the `sub` claim from a Supabase auth cookie value.

   Cookie value may be in one of two formats:
   - "base64-{json}" — newer @supabase/ssr wraps a JSON object
     containing access_token/refresh_token in a base64-encoded blob
   - Plain JWT (header.payload.signature) — older format

   We don't VERIFY the JWT (no signing key in the SW; no need for
   trust here — we're just partitioning a cache, not authorizing).
   Just decode the payload to read `sub`. Any parse/decode failure
   returns null; the caller falls back to the "anon" partition.

   Returns null when:
   - The cookie isn't in either expected shape
   - The JWT has fewer than 3 segments
   - The payload isn't valid JSON
   - There's no string `sub` claim */
function extractSubClaim(cookieValue: string): string | null {
  let raw = cookieValue;

  /* base64-wrapped JSON envelope (newer @supabase/ssr). The wrapper
     is the literal prefix "base64-" followed by base64-encoded JSON. */
  if (raw.startsWith("base64-")) {
    try {
      const decoded = atob(raw.slice("base64-".length));
      const parsed  = JSON.parse(decoded) as { access_token?: unknown };
      if (typeof parsed.access_token !== "string") return null;
      raw = parsed.access_token;
    } catch {
      return null;
    }
  }

  /* Now raw should be a JWT: header.payload.signature */
  const segs = raw.split(".");
  if (segs.length !== 3) return null;

  try {
    /* base64url → base64, then atob. Pad to multiple of 4. */
    const b64    = segs[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json   = atob(padded);
    const claims = JSON.parse(json) as { sub?: unknown };
    return typeof claims.sub === "string" ? claims.sub : null;
  } catch {
    return null;
  }
}

async function authHashForRequest(request: Request): Promise<string> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  if (!cookieHeader) return "anon";

  /* Supabase splits the auth token across chunked cookies named like
     `sb-<ref>-auth-token`, `sb-<ref>-auth-token.0`, etc. Reassemble
     by sorting on name (so the chunk order is stable: base name
     first, then .0, .1, .2 by lexical order) and concatenating just
     the values. */
  const parts: { name: string; value: string }[] = [];
  for (const seg of cookieHeader.split(/;\s*/)) {
    const eq = seg.indexOf("=");
    if (eq === -1) continue;
    const name  = seg.slice(0, eq);
    const value = seg.slice(eq + 1);
    if (name.startsWith("sb-") && name.includes("-auth-token")) {
      parts.push({ name, value });
    }
  }
  if (parts.length === 0) return "anon";

  parts.sort((a, b) => a.name.localeCompare(b.name));
  const reassembled = parts.map((p) => p.value).join("");

  /* Hash only the `sub` claim, NOT the whole token. The access_token
     rotates on every refresh; hashing it caused cache entries to
     orphan on every rotation (cache pollution that grew with session
     length — audit item 2c). The `sub` is the user_id and is stable
     for the lifetime of the account. Different users → different
     subs → different cache buckets, exactly the property we want. */
  const sub = extractSubClaim(reassembled);
  if (!sub) return "anon";

  const data  = new TextEncoder().encode(sub);
  const buf   = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < 8; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex; // 16 hex chars = 64 bits — collision-negligible for cache partitioning
}

const authPartitionPlugin: SerwistPlugin = {
  /*
   * cacheKeyWillBeUsed runs both for `read` (looking up the cache)
   * and `write` (storing a fetched response). Returning a different
   * Request object changes only the key — the network fetch path
   * uses the ORIGINAL request object, so the server still sees the
   * real URL.
   */
  async cacheKeyWillBeUsed({ request }) {
    const hash = await authHashForRequest(request);
    const url  = new URL(request.url);
    /* Use a hash fragment — never sent to the server, valid in URL,
       trivial to inspect when debugging in DevTools → Cache Storage. */
    url.hash = `auth=${hash}`;
    return new Request(url.toString(), { method: request.method });
  },
};

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

    /* ── Navigation (page) requests: NetworkFirst, partitioned ─────
     *
     * NetworkFirst (reverted from SWR — see PR #271 / this commit):
     * always tries network first, falls back to cache only when the
     * network fetch fails (offline / total network failure). Combined
     * with `navigationPreload: true` above, the network fetch starts
     * in parallel with SW boot, so the perceived perf cost vs SWR is
     * small — and Phase 1's shell + Suspense islands paint quickly
     * once the fresh HTML arrives.
     *
     * Why not SWR: SWR returned the CACHED HTML first, which after a
     * deploy embedded chunk URLs (`/_next/static/chunks/...HASH.js`)
     * that no longer existed on origin → 404 → React never hydrated
     * → indefinite white screen. The resilience layer (#288 chunk
     * recovery, #289 watchdog) caught this reactively, but the user
     * still saw a multi-second hang before auto-reload. NetworkFirst
     * makes that class of bug impossible: the cache is consulted
     * only when offline, and stale cached HTML offline is acceptable
     * because the offline fallback is `/offline` if the cache misses.
     *
     * Cache is still consulted as the offline fallback, so the
     * authPartitionPlugin stays in place: User A's offline-cached
     * HTML must never be served to User B on a shared device.
     */
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "navigations",
        plugins: [
          authPartitionPlugin,
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({
            maxEntries:    60,
            maxAgeSeconds: 60 * 60 * 24 * 7,
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
