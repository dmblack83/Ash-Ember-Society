/* ------------------------------------------------------------------
   Web Push — client-side helpers

   Wraps the browser's Push API (PushManager, Notification.permission)
   plus our /api/push endpoints into a small intent-named surface.
   Components consume these instead of touching the raw browser
   primitives directly.

   Platform notes:
   - iOS Safari supports Web Push only when the PWA is installed to
     the home screen AND the device runs iOS 16.4+. In a regular
     Safari tab, `'PushManager' in window` is false; isPushSupported()
     returns false and the UI hides notification controls.
   - Android Chrome works in installed-PWA AND regular-tab modes.
   - Desktop Chrome/Edge/Firefox work in regular-tab mode.

   VAPID public key is read from NEXT_PUBLIC_VAPID_PUBLIC_KEY (set in
   Vercel env in PR 4 of the push series). When the env var is empty,
   subscribe() returns an error rather than crashing — this lets the
   UI render a "not yet configured" state during the deploy window
   between PR 3 and PR 4.
   ------------------------------------------------------------------ */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushPermission = "granted" | "denied" | "default" | "unsupported";

/* Browsers expose Web Push only when these all line up. Used by the
   UI to decide whether to show notification controls at all. */
export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof navigator === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!("PushManager" in window)) return false;
  if (!("Notification" in window)) return false;
  return true;
}

export function getPushPermission(): PushPermission {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission as PushPermission;
}

/* Returns the active PushSubscription for THIS browser, or null if
   the user hasn't opted in (or the SW isn't registered yet). */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/* base64url → Uint8Array. The Push API requires the VAPID public key
   in raw byte form, but we ship it as base64url. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw     = atob(base64);
  const out     = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export interface SubscribeResult {
  ok:    boolean;
  error?: string;
}

/* Full opt-in flow: ask permission → subscribe via PushManager →
   POST the result to /api/push/subscribe. Idempotent — calling
   subscribe() when already subscribed is a no-op (returns ok). */
export async function subscribe(): Promise<SubscribeResult> {
  if (!isPushSupported()) {
    return { ok: false, error: "Push notifications aren't supported in this browser." };
  }
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, error: "Push notifications aren't configured yet. Try again in a moment." };
  }

  /* Permission first. If the user denied previously, requestPermission
     returns "denied" silently (no second prompt allowed by spec). */
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: permission === "denied"
      ? "Notifications were blocked. Re-enable them from your browser/system settings."
      : "Permission wasn't granted." };
  }

  let subscription: PushSubscription;
  try {
    const reg = await navigator.serviceWorker.ready;
    /* getSubscription() first — if there's already a live one, reuse
       it. PushManager.subscribe() with a different applicationServerKey
       than the existing one throws InvalidStateError, so we always
       check before subscribing. */
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      subscription = existing;
    } else {
      /* The DOM lib types narrow `applicationServerKey: BufferSource`
         in a way that excludes Uint8Array<ArrayBufferLike>. The
         underlying buffer is fine at runtime — cast through unknown
         to satisfy the type checker. */
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
      });
    }
  } catch (err) {
    return { ok: false, error: (err as Error)?.message ?? "Couldn't subscribe to push notifications." };
  }

  /* Persist to push_subscriptions via our API. */
  const json = subscription.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint:  json.endpoint,
      keys:      json.keys,
      userAgent: navigator.userAgent,
    }),
  });

  if (!res.ok) {
    /* Server insert failed — roll back the local subscription so the
       UI doesn't think we're subscribed when the server has no record. */
    await subscription.unsubscribe().catch(() => {});
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: body.error ?? "Couldn't save subscription." };
  }

  return { ok: true };
}

/* Re-sync the current PushSubscription to the server.

   Why this exists: PushSubscription endpoints can rotate silently
   (browser security event, OS update). The client subscribes once
   at opt-in via subscribe() above and never re-checks. If the
   browser rotates, the server's stored endpoint goes stale —
   sendNotification fails with 404/410, the server prunes the row,
   and the client still believes it's subscribed. User receives
   nothing until they manually toggle off and on.

   syncSubscription() restores the server's record by re-POSTing
   the CURRENT endpoint. /api/push/subscribe is UPSERT on
   (user_id, endpoint), so this is a no-op when the endpoint
   hasn't changed and a one-line fix when it has.

   Idempotent. Best-effort — errors are swallowed because this is
   background hygiene, not a user-facing action. Returns true when
   the sync was attempted (user is opted-in on a supported
   browser), false when there's nothing to sync. */
export async function syncSubscription(): Promise<boolean> {
  if (!isPushSupported())                     return false;
  if (Notification.permission !== "granted")  return false;

  try {
    const reg          = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (!subscription) return false;

    const json = subscription.toJSON();
    await fetch("/api/push/subscribe", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint:  json.endpoint,
        keys:      json.keys,
        userAgent: navigator.userAgent,
      }),
    });
    return true;
  } catch {
    return false;
  }
}

/* Inverse of subscribe(): remove the local subscription AND the
   server row. Idempotent. */
export async function unsubscribe(): Promise<SubscribeResult> {
  if (!isPushSupported()) return { ok: true };

  const subscription = await getCurrentSubscription();
  if (!subscription) return { ok: true };

  /* Tell the server to drop our row first — if the local unsubscribe
     succeeded but the server delete failed, the next subscribe()
     would create a duplicate (well, upsert-no-op) but the server
     would keep an orphan endpoint that can never receive a push. */
  await fetch("/api/push/unsubscribe", {
    method:  "DELETE",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => {});

  try {
    await subscription.unsubscribe();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message ?? "Couldn't unsubscribe." };
  }
}
