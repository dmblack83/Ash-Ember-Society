/* ------------------------------------------------------------------
   Interactivity telemetry — measures the paint -> interactive gap.

   The white-screen work fixed PAINT: the SW serves cached HTML on cold
   launch so the last page appears instantly. But a painted page is not
   a LIVE page — it's inert until React finishes hydrating and the main
   thread is free to process taps. Users report tapping a nav tab and
   "nothing happens" for 10-15s on cold launch; that window is exactly
   FCP -> hydration-complete, and the dead taps are the main thread
   being too busy to handle the navigation.

   Speed Insights already reports the continuous aggregate (FCP, INP,
   TBT). This module adds the per-load BREAKDOWN for the slow cases:
   the FCP -> hydrated delta plus the long-task load during that window,
   so we can tell whether the time is hydration cost or background
   contention. Reported only when the window is genuinely slow, so the
   Sentry stream stays a signal, not a firehose.

   Everything here is measurement only — no behavioral change. Every
   browser-API read is feature-detected and try/catch-wrapped; a failure
   silently skips the sample.

   Revert path: this is telemetry-only. To silence without a redeploy,
   set NEXT_PUBLIC_INTERACTIVITY_TELEMETRY=off. To remove entirely,
   revert the commit — no migration, no behavioral coupling.
   ------------------------------------------------------------------ */

import { trackReliability } from "./reliability";

/* A paint -> interactive window at or above this is "noticeably slow"
   and worth a detailed sample. Below it, Speed Insights' aggregate is
   enough and a per-load event would just be noise. */
export const SLOW_HYDRATION_THRESHOLD_MS = 2500;

export interface InteractivitySample {
  /** First Contentful Paint, ms from navigation start. null if unavailable. */
  fcpMs:              number | null;
  /** Hydration-complete, ms from navigation start. */
  hydratedMs:         number;
  /** hydratedMs - fcpMs — the dead-tap window. null when FCP is unavailable. */
  interactiveDelayMs: number | null;
  longtaskCount:      number;
  longtaskTotalMs:    number;
  longtaskMaxMs:      number;
  /** Navigation type: "navigate" | "reload" | "back_forward" | "prerender" | "unknown". */
  navType:            string;
  /** True when running as an installed PWA (the case users report). */
  standalone:         boolean;
}

/* The window we judge against: the FCP -> hydrated delta when FCP is
   available, otherwise the absolute hydration time from navigation
   start. Kept pure for testing. */
export function effectiveDelayMs(s: InteractivitySample): number {
  return s.interactiveDelayMs ?? s.hydratedMs;
}

export function shouldReportInteractivity(s: InteractivitySample): boolean {
  return effectiveDelayMs(s) >= SLOW_HYDRATION_THRESHOLD_MS;
}

/* Reports a sample if it clears the slow threshold. Pure-ish: the only
   side effect is the trackReliability call, which itself no-ops when
   the window is fast. */
export function reportInteractivity(s: InteractivitySample): void {
  if (!shouldReportInteractivity(s)) return;
  trackReliability({
    bucket:  "perf_interactivity",
    subtype: "slow_hydration",
    cause:   s.navType,
    extra: {
      fcp_ms:               Math.round(s.fcpMs ?? -1),
      hydrated_ms:          Math.round(s.hydratedMs),
      interactive_delay_ms: Math.round(s.interactiveDelayMs ?? -1),
      longtask_count:       s.longtaskCount,
      longtask_total_ms:    Math.round(s.longtaskTotalMs),
      longtask_max_ms:      Math.round(s.longtaskMaxMs),
      standalone:           s.standalone,
    },
  });
}

/* ── Browser-side collection (impure, all feature-detected) ───────── */

function fcpFromNavigationStart(): number | null {
  try {
    const paint = performance.getEntriesByType("paint");
    const fcp   = paint.find((e) => e.name === "first-contentful-paint");
    return fcp ? fcp.startTime : null;
  } catch {
    return null;
  }
}

function navigationType(): string {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    return nav?.type ?? "unknown";
  } catch {
    return "unknown";
  }
}

function isStandalone(): boolean {
  try {
    return (
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

function longtaskSupported(): boolean {
  try {
    return (
      typeof PerformanceObserver !== "undefined" &&
      Array.isArray(PerformanceObserver.supportedEntryTypes) &&
      PerformanceObserver.supportedEntryTypes.includes("longtask")
    );
  } catch {
    return false;
  }
}

interface LongtaskTotals {
  count: number;
  total: number;
  max:   number;
}

/* Buffered long-task observer. `buffered: true` replays the long tasks
   that already happened during the pre-interactive window — including
   the one still in flight when the hydration effect ran, since the
   observer callback fires after the current task ends. We only count
   tasks that started before hydration, then disconnect. The short
   settle delay lets the buffered callback flush and captures a task
   that straddles the hydration boundary. */
function collectLongtasks(beforeMs: number, done: (t: LongtaskTotals) => void): void {
  if (!longtaskSupported()) {
    done({ count: 0, total: 0, max: 0 });
    return;
  }

  const totals: LongtaskTotals = { count: 0, total: 0, max: 0 };
  let settled = false;
  const finish = (obs?: PerformanceObserver) => {
    if (settled) return;
    settled = true;
    try { obs?.disconnect(); } catch { /* non-fatal */ }
    done(totals);
  };

  try {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.startTime <= beforeMs) {
          totals.count += 1;
          totals.total += entry.duration;
          if (entry.duration > totals.max) totals.max = entry.duration;
        }
      }
    });
    obs.observe({ type: "longtask", buffered: true });
    const SETTLE_MS = 500;
    setTimeout(() => finish(obs), SETTLE_MS);
  } catch {
    finish();
  }
}

/* Entry point — called once from HydrationMark when hydration completes.
   Fire-and-forget; never throws into the caller. */
export function measureInteractivity(): void {
  try {
    if (typeof performance === "undefined" || typeof performance.now !== "function") return;
    if (process.env.NEXT_PUBLIC_INTERACTIVITY_TELEMETRY === "off") return;

    const hydratedMs  = performance.now();
    const fcpMs       = fcpFromNavigationStart();
    const navType     = navigationType();
    const standalone  = isStandalone();

    collectLongtasks(hydratedMs, (lt) => {
      reportInteractivity({
        fcpMs,
        hydratedMs,
        interactiveDelayMs: fcpMs !== null ? hydratedMs - fcpMs : null,
        longtaskCount:      lt.count,
        longtaskTotalMs:    lt.total,
        longtaskMaxMs:      lt.max,
        navType,
        standalone,
      });
    });
  } catch {
    /* measurement must never affect the app — swallow everything */
  }
}
