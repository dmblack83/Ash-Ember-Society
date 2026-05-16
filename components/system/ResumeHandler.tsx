"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

const MIN_INTERVAL_MS = 2000;

/* iOS WebKit evicts the JS heap aggressively for backgrounded
   standalone PWAs. The DOM stays painted but the JS context is
   dead, so the app looks alive and buttons appear clickable but
   nothing runs. router.refresh() cannot recover this: it re-runs
   server components inside the (dead) JS context. Only a hard
   reload rebuilds the heap.

   5 min threshold balances: long enough that quick app-switches
   (taking a call, replying to a text) keep their warm context;
   short enough to catch the typical eviction window (iOS evicts
   under memory pressure well before 30 min in practice). The cost
   of an over-eager reload is ~1-2s LCP from edge cache; the cost
   of NOT reloading is the user force-closing the app. */
const IOS_RELOAD_THRESHOLD_MS = 5 * 60 * 1000;

/* Performance-mark labels for diagnosing warm-resume blank-screen
   issues. Marks land on Performance Timeline and feed Vercel Speed
   Insights' RUM. View in DevTools → Performance → User timing. */
const MARK_RESUME           = "ae:resume";
const MARK_TOKEN_REFRESHED  = "ae:token-refreshed";
const MEASURE_TOKEN_REFRESH = "ae:token-refresh-duration";
const MARK_IOS_RELOAD       = "ae:ios-resume-reload";
const MARK_STALE_REVIVE     = "ae:stale-revive-reload";

/* JS-heap-eviction detection.

   iOS aggressively evicts the JS heap of backgrounded standalone
   PWAs. When the user returns:
   - If iOS revives the WebView with a fresh JS context, our useEffect
     runs again BUT `hiddenAt` is null (closure was lost), so the
     existing 5-min reload below doesn't fire — the page tries to
     recover via the normal token-refresh + router.refresh path and
     can stall for minutes on slow networks or wedged auth.
   - If iOS keeps JS dead, nothing runs at all. We can't help from
     in here.

   The heartbeat below writes a sessionStorage timestamp every 60s
   while JS is alive. sessionStorage survives heap eviction (separate
   storage layer), so on mount we can compare the last heartbeat
   against the current time. A large gap means JS was dead for a
   while → hard-reload immediately rather than chain the doomed
   recovery path. */
const HEARTBEAT_KEY          = "ae:lastAlive";
const HEARTBEAT_INTERVAL_MS  = 60 * 1000;
const HEARTBEAT_STALE_MS     = 90 * 1000;  // 1.5 min — well past one heartbeat

function safeMark(name: string) {
  if (typeof performance !== "undefined" && performance.mark) {
    try { performance.mark(name); } catch { /* ignore */ }
  }
}

function safeMeasure(name: string, start: string, end: string) {
  if (typeof performance !== "undefined" && performance.measure) {
    try { performance.measure(name, start, end); } catch { /* ignore */ }
  }
}

/* True only for iOS PWAs added to the Home Screen. The heap-eviction
   pattern is far worse there than in a Safari browser tab (which
   benefits from bfcache). Gating the reload behavior to standalone
   keeps casual Safari browsing on iOS from paying the reload cost. */
function isIOSStandalone(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  if (!/iPad|iPhone|iPod/.test(navigator.userAgent)) return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function ResumeHandler() {
  const router = useRouter();

  useEffect(() => {
    let lastResume = 0;
    let hiddenAt: number | null = null;
    const iosStandalone = isIOSStandalone();
    const supabase = createClient();

    /* Stale-heartbeat check: if the last alive timestamp in
       sessionStorage is far older than one heartbeat interval, JS
       was likely dead for an extended period. Hard-reload now to
       short-circuit the doomed recovery chain. Guard on iOS PWA
       only — desktop / Safari tab don't see eviction at this
       cadence. */
    if (iosStandalone) {
      try {
        const last = parseInt(sessionStorage.getItem(HEARTBEAT_KEY) ?? "0", 10);
        if (last > 0 && Date.now() - last > HEARTBEAT_STALE_MS) {
          safeMark(MARK_STALE_REVIVE);
          /* Update the heartbeat BEFORE reloading so the post-reload
             mount sees a fresh value and doesn't loop. */
          sessionStorage.setItem(HEARTBEAT_KEY, Date.now().toString());
          window.location.reload();
          return;
        }
      } catch {
        /* sessionStorage can throw in some privacy modes; treat as
           "no signal" and fall through to normal resume handling. */
      }
    }

    /* Heartbeat — writes the current time to sessionStorage every
       HEARTBEAT_INTERVAL_MS while JS is alive. Stops when the
       useEffect cleans up (component unmount) OR when JS dies (the
       interval timer dies with the heap). Either way, on the next
       mount we see a stale gap and reload. */
    function writeHeartbeat() {
      try { sessionStorage.setItem(HEARTBEAT_KEY, Date.now().toString()); }
      catch { /* see comment above */ }
    }
    writeHeartbeat();
    const heartbeatTimer = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);

    function recordHidden() {
      hiddenAt = Date.now();
    }

    function onResume() {
      /* Skip when offline. Both supabase.auth.refreshSession() and
         router.refresh() will fail without a network — running them
         only buys a doomed request and a console error. The next
         visibilitychange / pageshow when the user reconnects will
         re-fire onResume naturally. */
      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      const now = Date.now();
      if (now - lastResume < MIN_INTERVAL_MS) return;
      lastResume = now;

      /* Mark the moment of resume so the user-timing track in
         DevTools shows the blank-screen window starting here. */
      safeMark(MARK_RESUME);

      /* iOS standalone + long background gap: hard reload. The JS
         heap is likely dead; no router-level recovery will help.
         Skip the rest of the resume path (token refresh, SW update,
         router.refresh) because the reload will redo all of it
         from a fresh context. */
      if (
        iosStandalone &&
        hiddenAt !== null &&
        now - hiddenAt > IOS_RELOAD_THRESHOLD_MS
      ) {
        safeMark(MARK_IOS_RELOAD);
        window.location.reload();
        return;
      }

      /* Token refresh runs in parallel with router.refresh() — the
         latter doesn't await the former. Marks let us see how long
         Supabase token refresh ACTUALLY takes on resume; if it's
         slow on cold network, that's not blocking render but it's
         worth knowing for follow-up. */
      const refreshStart = performance.now();
      supabase.auth.refreshSession()
        .then(() => {
          safeMark(MARK_TOKEN_REFRESHED);
          safeMeasure(MEASURE_TOKEN_REFRESH, MARK_RESUME, MARK_TOKEN_REFRESHED);
          // Surface in console for live debug — strip when noise becomes a problem.
          console.log(
            `[resume] token refresh: ${(performance.now() - refreshStart).toFixed(0)}ms`,
          );
        })
        .catch(() => { /* refresh is best-effort */ });

      /* SW update check on every resume. /sw.js is served with
         max-age=0,must-revalidate so this is one cheap revalidation
         request. If a deploy shipped while the tab was hidden,
         skipWaiting + clientsClaim install the new worker
         immediately, so the next navigation gets fresh chunks. */
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.ready
          .then((reg) => reg.update())
          .catch(() => { /* update is best-effort */ });
      }

      router.refresh();
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        recordHidden();
      } else if (document.visibilityState === "visible") {
        onResume();
      }
    }

    function onPageHide() {
      /* pagehide fires reliably on iOS when the PWA is backgrounded;
         visibilitychange has historically been less consistent
         there. Belt-and-suspenders: either path captures the moment
         we lose the tab. */
      recordHidden();
    }

    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted || document.visibilityState === "visible") onResume();
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      clearInterval(heartbeatTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

  return null;
}
