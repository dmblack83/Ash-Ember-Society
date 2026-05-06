"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

const MIN_INTERVAL_MS = 2000;

/* Performance-mark labels for diagnosing warm-resume blank-screen
   issues. Marks land on Performance Timeline and feed Vercel Speed
   Insights' RUM. View in DevTools → Performance → User timing. */
const MARK_RESUME           = "ae:resume";
const MARK_TOKEN_REFRESHED  = "ae:token-refreshed";
const MEASURE_TOKEN_REFRESH = "ae:token-refresh-duration";

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

export function ResumeHandler() {
  const router = useRouter();

  useEffect(() => {
    let lastResume = 0;
    const supabase = createClient();

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

      router.refresh();
    }

    function onVisibility() {
      if (document.visibilityState === "visible") onResume();
    }

    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted || document.visibilityState === "visible") onResume();
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

  return null;
}
