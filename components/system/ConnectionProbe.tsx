"use client";

import { useEffect } from "react";
import { reportSlowTransports, type ResourceTimingLike } from "@/lib/telemetry/transport";

/* ------------------------------------------------------------------
   ConnectionProbe

   Two jobs, both low-risk and additive (ResumeHandler is left
   untouched):

   1. WARM-UP — on first load and on every foreground, (re)issue a
      `preconnect` to the Supabase origin so the TLS/QUIC connection is
      established before the user taps. After a long background gap the
      phone's connections go cold; this absorbs that cold-connection
      cost in the background instead of on the next request.

   2. DIAGNOSTIC — on first load and on a resume after a meaningful gap,
      anchor a timestamp, then 30s later snapshot Resource Timing and
      report the slowest data request's PHASE breakdown (stall / connect
      / TLS vs TTFB vs transfer) to Sentry. Same-origin route requests
      expose all phases, so a cold-morning freeze tells us automatically
      whether the cost is connection setup or something else — no manual
      Web Inspector capture needed.

   Telemetry only; no user-facing behavior.
   ------------------------------------------------------------------ */

const SNAPSHOT_DELAY_MS = 30_000;  // wait past a ~20s cold request so it has completed
const RESUME_GAP_MS     = 60_000;  // only probe resumes after a meaningful background gap
const SLOW_MS           = 3_000;   // report data requests slower than this
const PRECONNECT_ID     = "ae-preconnect-supabase";

function supabaseUrl(): URL | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  } catch {
    return null;
  }
}

/* Re-issue the preconnect hint. Removing + re-adding the <link> makes the
   browser run the connection again, re-warming a connection that went
   cold while backgrounded. */
function warmConnections(supaOrigin: string) {
  if (typeof document === "undefined") return;
  document.getElementById(PRECONNECT_ID)?.remove();
  const link = document.createElement("link");
  link.id = PRECONNECT_ID;
  link.rel = "preconnect";
  link.href = supaOrigin;
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);
}

export function ConnectionProbe() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof performance === "undefined") return;

    const supa = supabaseUrl();
    const supaOrigin = supa?.origin ?? null;
    const supaHost   = supa?.host ?? "";
    const appOrigin  = window.location.origin;

    let snapshotTimer: ReturnType<typeof setTimeout> | null = null;
    let hiddenAt: number | null = null;

    function scheduleProbe(reason: string) {
      const sinceMs = performance.now();
      if (snapshotTimer) clearTimeout(snapshotTimer);
      snapshotTimer = setTimeout(() => {
        try {
          const entries = performance.getEntriesByType("resource") as unknown as ResourceTimingLike[];
          reportSlowTransports(entries, {
            origin:       appOrigin,
            supabaseHost: supaHost,
            sinceMs,
            reason,
            slowMs:       SLOW_MS,
            max:          1,
          });
        } catch {
          /* telemetry must never throw into the app */
        }
      }, SNAPSHOT_DELAY_MS);
    }

    /* First load. */
    if (supaOrigin) warmConnections(supaOrigin);
    scheduleProbe("first_load");

    function onHide() {
      hiddenAt = Date.now();
    }

    function onShow() {
      if (supaOrigin) warmConnections(supaOrigin);
      const gap = hiddenAt !== null ? Date.now() - hiddenAt : null;
      if (gap === null || gap >= RESUME_GAP_MS) scheduleProbe("resume");
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") onHide();
      else if (document.visibilityState === "visible") onShow();
    }

    function onPageShow() {
      onShow();
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      if (snapshotTimer) clearTimeout(snapshotTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return null;
}
