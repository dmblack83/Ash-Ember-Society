"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

const MIN_INTERVAL_MS = 2000;

/* Below this background gap, a resume does NO heavy work. Forcing a
   token refresh + router.refresh() on every resume (even a few-seconds
   glance at another app) re-ran the whole route's server components and
   left the App Router pending, so tab taps queued for seconds — the app
   looked fully rendered but frozen. A warm app returning from a quick
   switch already has fresh-enough data (SWR revalidates on navigation;
   Supabase autoRefreshToken keeps the token fresh via its own
   visibility handler), so the correct amount of resume work is NONE.

   5 min: long enough that quick app-switches (taking a call, replying to
   a text) stay instant; short enough that a genuine "came back later"
   gets one fresh pull. Matches the iOS heap-eviction window the cold-
   relaunch recovery paths assume. */
const RESUME_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

/* Performance-mark labels for diagnosing warm-resume blank-screen
   issues. Marks land on Performance Timeline and feed Vercel Speed
   Insights' RUM. View in DevTools → Performance → User timing. */
const MARK_RESUME       = "ae:resume";
const MARK_IOS_RELOAD   = "ae:ios-resume-reload";
const MARK_STALE_REVIVE = "ae:stale-revive-reload";

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
          sessionStorage.setItem(HEARTBEAT_KEY, Date.now().toString());
          /* Fire-and-forget: useEffect is synchronous, so we can't await here.
             Both are best-effort — the heartbeat timer and event listeners
             below don't depend on auth state. */
          void supabase.auth.refreshSession().catch(() => {});
          router.refresh();
          /* No return — let the heartbeat timer and event listeners
             set up normally below. */
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
         DevTools shows the resume window starting here. */
      safeMark(MARK_RESUME);

      /* Gate the heavy resume work behind a MEANINGFUL background gap.
         Re-running supabase.auth.refreshSession() + router.refresh() on
         EVERY resume forced a full server re-render of the current route
         and left the App Router pending, so tab taps queued for seconds
         (the "fully rendered but frozen" report). A warm app returning
         from a quick switch needs NO work here: autoRefreshToken keeps the
         token fresh on its own visibility handler, and SWR revalidates
         data on navigation.

         hiddenAt === null means no hide was recorded in THIS JS context —
         a brand-new context after heap eviction is handled by the stale-
         heartbeat block above; here we treat it as "no meaningful gap"
         and skip. */
      const backgroundGap = hiddenAt !== null ? now - hiddenAt : null;
      if (backgroundGap === null || backgroundGap < RESUME_REFRESH_THRESHOLD_MS) {
        return;
      }

      /* Been away a while → a single refresh to pull fresh per-user data.
         iOS standalone additionally pre-warms auth: after a long suspend
         the access token may be expired, and refreshing here avoids the
         proxy's expired-token slow path on the next request. Fire-and-
         forget — router.refresh() doesn't await it. */
      if (iosStandalone) {
        safeMark(MARK_IOS_RELOAD);
        void supabase.auth.refreshSession().catch(() => {});
      }

      /* Pick up any deploy that shipped while the tab was hidden. /sw.js is
         served max-age=0,must-revalidate so this is one cheap revalidation;
         skipWaiting + clientsClaim install the new worker for the next nav. */
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
