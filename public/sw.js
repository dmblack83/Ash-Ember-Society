/*
 * Ash & Ember Society — service worker
 *
 * Two responsibilities:
 *
 *   1. Make the app installable. Chromium browsers require a registered
 *      service worker (with at minimum a fetch handler) before they
 *      surface the install prompt / fire BeforeInstallPromptEvent.
 *      The fetch handler here is intentionally a pass-through — we do
 *      NOT cache anything. Offline support is deliberately deferred;
 *      too easy to ship stale HTML or per-user data by mistake.
 *
 *   2. Receive web-push notifications and route taps to the right URL.
 *      The server (lib/push.ts, shipping in PR 4 of this series) sends
 *      a JSON payload via web-push; this worker shows a Notification
 *      and, on click, focuses an existing app tab or opens a new one
 *      at the payload's url.
 *
 * Cache-Control on /sw.js is `max-age=0, must-revalidate` (set in
 * next.config.ts), so already-installed PWAs pick up changes to this
 * file on the next reload — no stale SW lingering.
 *
 * If you later want offline shell or asset caching, replace this file
 * via the Serwist / Workbox flow rather than hand-rolling.
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
  // Intentionally empty. The browser handles every request the way it
  // normally would. Chromium's installability check just needs SOME
  // registered fetch handler to exist.
});

/* ------------------------------------------------------------------
   Push notifications

   Payload shape (sent by lib/push.ts in a later PR):
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
   ------------------------------------------------------------------ */

const DEFAULT_ICON  = "/icons/icon-192.png";
const DEFAULT_BADGE = "/icons/icon-192.png";

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Push arrived without JSON (string payload, empty, etc.) —
    // fall through to defaults below.
    payload = {};
  }

  const title = payload.title || "Ash & Ember";
  const options = {
    body:  payload.body  || "",
    icon:  payload.icon  || DEFAULT_ICON,
    badge: payload.badge || DEFAULT_BADGE,
    tag:   payload.tag   || undefined,
    /* `data` is the only place to stash the URL — Notification's
       built-in fields don't carry arbitrary metadata across the
       click handler. */
    data:  { url: payload.url || "/" },
    /* renotify defaults to false; when a `tag` is set we want repeat
       notifications under the same tag to actually re-alert the
       user, not silently replace the previous one. */
    renotify: Boolean(payload.tag),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* ------------------------------------------------------------------
   Notification click

   Behavior:
     1. Close the notification (otherwise it lingers in the tray).
     2. If a window of this app is already open, focus it and
        navigate to the target URL (don't spawn a duplicate tab).
     3. Otherwise open a new window at the target URL.
   ------------------------------------------------------------------ */

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({
      type:                "window",
      includeUncontrolled: true,
    });

    /* Prefer focusing an already-open window. Navigate it to the
       target URL so the user lands on the right surface (e.g. a
       reply notification opens the relevant lounge thread). */
    for (const client of allClients) {
      if ("focus" in client) {
        try {
          await client.navigate(targetUrl);
        } catch {
          // navigate() can fail cross-origin or in some PWA modes;
          // we still focus the existing window below.
        }
        return client.focus();
      }
    }

    /* No existing window — open a fresh one. */
    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
  })());
});
