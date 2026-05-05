"use client";

import { useEffect } from "react";

/* ------------------------------------------------------------------
   HydrationMark

   Client-only companion to the inline hydration-watchdog script
   (see hydration-watchdog.ts). Mounted at the root layout. When
   React reaches the useEffect — the canonical "hydration complete"
   signal — it:

     1. Sets `window.__AE_HYDRATED = true` so the watchdog timer
        sees the page is alive and bails out before firing.
     2. Clears the watchdog's setTimeout handle directly (belt-and-
        braces; the boolean check would also stop the reload).
     3. Resets the rate-limit counter so a successful run doesn't
        penalise the next visit.
     4. Drops a `ae:hydrated` performance mark for diagnostics.
   ------------------------------------------------------------------ */

declare global {
  interface Window {
    __AE_HYDRATED?: boolean;
    __AE_WATCHDOG_TIMER?: ReturnType<typeof setTimeout>;
  }
}

export function HydrationMark() {
  useEffect(() => {
    window.__AE_HYDRATED = true;
    if (window.__AE_WATCHDOG_TIMER !== undefined) {
      clearTimeout(window.__AE_WATCHDOG_TIMER);
    }
    try {
      sessionStorage.removeItem("ae-hydrate-watchdog-tries");
    } catch {
      /* sessionStorage may be unavailable in privacy mode; ignore */
    }
    if (typeof performance !== "undefined" && performance.mark) {
      try { performance.mark("ae:hydrated"); } catch { /* ignore */ }
    }
  }, []);

  return null;
}
