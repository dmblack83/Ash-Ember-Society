"use client";

/* ------------------------------------------------------------------
   PushSubscriptionHealthCheck

   Background hygiene component. Once per 24h, re-syncs the current
   PushSubscription to the server via lib/push-client.syncSubscription
   so silently-rotated endpoints don't strand the user with a server
   that has stale state.

   Mounted from app/(app)/layout.tsx so it runs on every authenticated
   page load (subject to the 24h throttle). No-op for users who aren't
   subscribed; cheap when they are.

   Throttled via localStorage timestamp. The timestamp updates
   regardless of whether the sync ran (i.e., even when user isn't
   subscribed) — avoids re-entering the check on every nav for
   non-subscribers.
   ------------------------------------------------------------------ */

import { useEffect } from "react";
import { syncSubscription } from "@/lib/push-client";

const HEALTH_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const STORAGE_KEY              = "ae:push-last-sync";

export function PushSubscriptionHealthCheck() {
  useEffect(() => {
    /* localStorage access can throw (Safari private mode pre-2023,
       quota exceeded). The whole component is best-effort; bail
       silently on any error. */
    let lastSync = 0;
    try {
      lastSync = parseInt(localStorage.getItem(STORAGE_KEY) ?? "0", 10);
    } catch { return; }

    const now = Date.now();
    if (now - lastSync < HEALTH_CHECK_INTERVAL_MS) return;

    syncSubscription().finally(() => {
      try {
        localStorage.setItem(STORAGE_KEY, String(now));
      } catch { /* ignore */ }
    });
  }, []);

  return null;
}
