"use client";

import { useEffect, useState } from "react";

/* ------------------------------------------------------------------
   ServiceWorkerUpdateNotice — bottom banner prompting the user to
   reload when a new service worker has activated under an open tab.

   Why this exists
   ───────────────
   When a deploy ships, our SW activates under existing tabs via
   skipWaiting + clientsClaim. The new SW takes control of network
   requests immediately, but the page's loaded JS bundles are from
   the OLD build. If the user navigates to a route that needs a
   chunk the new build no longer ships, the chunk 404s. We have
   stale-chunk-recovery (#288) that catches this and reloads, but
   it fires reactively, after a flash.

   This banner is the proactive version: as soon as the new SW
   activates, the user sees "Update available — Reload" and can
   refresh cleanly on their own timing.

   The SW broadcasts `{ type: "SW_UPDATED" }` to every controlled
   client on every activate (including the very first install). We
   filter out the first-install case by capturing the SW controller
   state at mount time: if the page loaded with NO controller, the
   first SW to take over IS this page's first SW, not an "update".

   Mount once at the root layout. The banner only renders when an
   update is actually available — no DOM cost otherwise.
   ------------------------------------------------------------------ */

export function ServiceWorkerUpdateNotice() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined")             return;
    if (!("serviceWorker" in navigator))              return;

    /* Capture controller state AT MOUNT. Once clientsClaim runs in
       the new SW, controller becomes non-null and we lose the
       signal that distinguishes "first install" from "real update". */
    const hadController = navigator.serviceWorker.controller !== null;
    if (!hadController) return;

    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (data && typeof data === "object" && (data as { type?: unknown }).type === "SW_UPDATED") {
        setAvailable(true);
      }
    }

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  if (!available) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[70] card animate-slide-up flex items-center gap-3 bottom-[calc(72px+env(safe-area-inset-bottom))] lg:bottom-6"
      style={{
        /* Match the Toast component's horizontal centering. The
           --app-content-left variable is 0 below lg and the desktop
           side-rail width at lg+, so we clear the rail without
           overlap on either breakpoint. */
        left:       "calc(var(--app-content-left) + 1rem)",
        right:      "1rem",
        borderLeft: "4px solid var(--primary)",
        maxWidth:   480,
        margin:     "0 auto",
        padding:    "12px 16px",
      }}
    >
      <span
        style={{
          flex:     1,
          fontSize: 14,
          color:    "var(--foreground)",
          minWidth: 0,
        }}
      >
        A new version is available.
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          padding:      "6px 14px",
          borderRadius: 8,
          background:   "var(--primary)",
          color:        "var(--background)",
          fontSize:     13,
          fontWeight:   600,
          border:       "none",
          cursor:       "pointer",
          flexShrink:   0,
          WebkitTapHighlightColor: "transparent",
        }}
      >
        Reload
      </button>
    </div>
  );
}
