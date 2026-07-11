"use client";

import { useEffect } from "react";
import { useSWRConfig } from "swr";
import { createClient } from "@/utils/supabase/client";
import { decideResumeWork, decideStaleRevive } from "@/lib/resume-work";

/* ResumeHandler — runs non-blocking resume upkeep when the installed PWA
   returns to the foreground.

   What it does NOT do (Option 1 fix): it no longer calls router.refresh()
   on resume or on a stale relaunch. That refresh re-rendered the current
   SSR route on a cold socket (~15s) and left the App Router pending, which
   queued navigation to server-coupled routes (tap Home → nothing → snaps
   in ~15s later) while static client shells kept working. The gating +
   effect logic lives in the pure, unit-tested lib/resume-work.ts and is
   limited to fire-and-forget effects that can't wedge the router.

   What it DOES do for freshness: after a real background gap it fires a
   background SWR revalidation of every mounted key (the same action as
   pull-to-refresh). See lib/resume-work.ts for why "SWR revalidates on
   navigation" was not enough on its own. */

/* Performance-mark labels for diagnosing warm-resume issues. Marks land on
   the Performance Timeline and feed Vercel Speed Insights' RUM. View in
   DevTools → Performance → User timing. */
const MARK_RESUME             = "ae:resume";
const MARK_IOS_RESUME_REFRESH = "ae:ios-resume-refresh";
const MARK_STALE_REVIVE       = "ae:stale-revive";
const MARK_DATA_REVALIDATE    = "ae:resume-revalidate-data";

/* JS-heap-eviction detection.

   iOS aggressively evicts the JS heap of backgrounded standalone PWAs.
   The heartbeat below writes a sessionStorage timestamp every 60s while JS
   is alive. sessionStorage survives heap eviction (separate storage
   layer), so on mount we compare the last heartbeat against now: a large
   gap means JS was dead a while → pre-warm auth so the next request skips
   the proxy's expired-token slow path. (Previously this path also forced a
   router.refresh(); that was the wedge — removed.) */
const HEARTBEAT_KEY          = "ae:lastAlive";
const HEARTBEAT_INTERVAL_MS  = 60 * 1000;

function safeMark(name: string) {
  if (typeof performance !== "undefined" && performance.mark) {
    try { performance.mark(name); } catch { /* ignore */ }
  }
}

/* True only for iOS PWAs added to the Home Screen. The heap-eviction
   pattern is far worse there than in a Safari browser tab (which benefits
   from bfcache). Gating auth pre-warm to standalone keeps casual Safari
   browsing on iOS from paying for it. */
function isIOSStandalone(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  if (!/iPad|iPhone|iPod/.test(navigator.userAgent)) return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/* Pre-warm Supabase auth. Fire-and-forget: after a long suspend the access
   token may be expired, and refreshing here avoids the proxy's
   expired-token slow path on the next request. Never blocks the router. */
function warmAuth(supabase: ReturnType<typeof createClient>) {
  void supabase.auth.refreshSession().catch(() => {});
}

/* Best-effort check for a deploy that shipped while the tab was hidden.
   /sw.js is served max-age=0,must-revalidate so this is one cheap
   revalidation; skipWaiting + clientsClaim install the new worker for the
   next nav. Never blocks the router. */
function checkForServiceWorkerUpdate() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => reg.update())
    .catch(() => { /* update is best-effort */ });
}

export function ResumeHandler() {
  /* Root layout mounts this inside SWRProvider, so this is the app-wide
     SWR cache — global mutate here reaches every mounted key. */
  const { mutate } = useSWRConfig();

  useEffect(() => {
    let lastResume = 0;
    let hiddenAt: number | null = null;
    const iosStandalone = isIOSStandalone();
    const supabase = createClient();

    /* Stale-heartbeat check: if the last alive timestamp in sessionStorage
       is far older than one heartbeat interval, JS was likely dead for an
       extended period. Pre-warm auth now (no router.refresh — see header).
       Guard on iOS PWA only — desktop / Safari tab don't see eviction at
       this cadence. */
    if (iosStandalone) {
      try {
        const last = parseInt(sessionStorage.getItem(HEARTBEAT_KEY) ?? "0", 10);
        const { reviveStale } = decideStaleRevive({
          iosStandalone,
          lastHeartbeat: last,
          now: Date.now(),
        });
        if (reviveStale) {
          safeMark(MARK_STALE_REVIVE);
          sessionStorage.setItem(HEARTBEAT_KEY, Date.now().toString());
          warmAuth(supabase);
        }
      } catch {
        /* sessionStorage can throw in some privacy modes; treat as "no
           signal" and fall through to normal resume handling. */
      }
    }

    /* Heartbeat — writes the current time to sessionStorage every
       HEARTBEAT_INTERVAL_MS while JS is alive. Stops when the useEffect
       cleans up (unmount) OR when JS dies (the interval dies with the
       heap). Either way, the next mount sees a stale gap. */
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
      const now = Date.now();
      const work = decideResumeWork({
        online: typeof navigator === "undefined" ? true : navigator.onLine,
        iosStandalone,
        now,
        lastResumeAt: lastResume,
        hiddenAt,
      });
      if (!work.act) return;

      /* Advance the debounce anchor so the paired visibility/pageshow
         signal for this same return doesn't re-run the effects. */
      lastResume = now;
      safeMark(MARK_RESUME);

      if (work.effects.includes("refresh-session")) {
        safeMark(MARK_IOS_RESUME_REFRESH);
        warmAuth(supabase);
      }
      if (work.effects.includes("service-worker-update")) {
        checkForServiceWorkerUpdate();
      }
      if (work.effects.includes("revalidate-data")) {
        /* Same action as pull-to-refresh: background-revalidate every
           MOUNTED SWR key. Cached data keeps rendering while fresh data
           streams in; unmounted keys are untouched. Fire-and-forget —
           never blocks the router. */
        safeMark(MARK_DATA_REVALIDATE);
        void mutate(() => true).catch(() => {
          /* revalidation is best-effort; SWR owns retries */
        });
      }
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
         visibilitychange has historically been less consistent there.
         Belt-and-suspenders: either path captures the moment we lose the
         tab. */
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
  }, [mutate]); /* stable in SWR; listed for lint correctness */

  return null;
}
