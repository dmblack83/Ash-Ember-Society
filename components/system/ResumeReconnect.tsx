"use client";

import { useEffect } from "react";
import { trackReliability } from "@/lib/telemetry/reliability";
import {
  classifyProbeError,
  decideReconnect,
  PROBE_TIMEOUT_MS,
  PROBE_URL,
  RELOAD_WINDOW_MS,
  RESUME_GAP_MS,
  type ProbeResult,
} from "@/lib/resume-reconnect";

/* ------------------------------------------------------------------
   ResumeReconnect

   Detects the iOS PWA dead-socket stall on resume and recovers from it
   with a fast reload. See lib/resume-reconnect.ts for the root-cause
   write-up and the pure decision logic.

   Flow: on a foreground after a real background gap, probe the app
   origin with a short timeout. If the probe times out (dead socket),
   force one reload — the service worker serves the cached navigation
   shell instantly, so the user sees the app immediately instead of a
   ~20s blank hang. Guarded against loops by a per-session cap and a
   cooldown.

   Sibling to ConnectionProbe (which only measures + warms Supabase);
   this one acts on the app's own connection, which is where the stall
   actually lives. No user-facing UI.
   ------------------------------------------------------------------ */

/** Timestamps of recent reconnect reloads, persisted across reloads so
 *  the loop guard survives the reload it triggers. Stored as JSON in
 *  sessionStorage; entries outside RELOAD_WINDOW_MS are dropped on write
 *  so the list never grows without bound. */
const SS_RELOAD_TIMES = "ae:resume-reconnect:times";
const RELOAD_FLUSH_MS = 200; // let telemetry send before navigating away

function readReloadTimes(): number[] {
  try {
    const raw = sessionStorage.getItem(SS_RELOAD_TIMES);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is number => typeof n === "number");
  } catch {
    return []; // private mode / storage disabled / malformed
  }
}

function recordReload(now: number): number[] {
  const next = [...readReloadTimes(), now].filter(
    (ts) => now - ts < RELOAD_WINDOW_MS,
  );
  try {
    sessionStorage.setItem(SS_RELOAD_TIMES, JSON.stringify(next));
  } catch {
    /* storage disabled — non-fatal */
  }
  return next;
}

export function ResumeReconnect() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let hiddenAt: number | null = null;
    let busy = false;

    async function probe(): Promise<ProbeResult> {
      try {
        await fetch(PROBE_URL, {
          cache: "no-store",
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        return "ok"; // any HTTP status means the socket answered
      } catch (err) {
        return classifyProbeError(err instanceof Error ? err.name : undefined);
      }
    }

    async function runProbeCycle() {
      if (busy) return;
      busy = true;
      try {
        const probeResult = await probe();
        const now = Date.now();
        const decision = decideReconnect({
          online: navigator.onLine,
          probeResult,
          recentReloadTimestamps: readReloadTimes(),
          now,
        });
        if (decision.action !== "reload") return;

        const times = recordReload(now);
        trackReliability({
          bucket: "network_resilience",
          subtype: "dead_socket_reload",
          cause: "resume",
          extra: { reload_count_in_window: times.length },
        });
        window.setTimeout(() => window.location.reload(), RELOAD_FLUSH_MS);
      } finally {
        busy = false;
      }
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      // visible: only act after a meaningful background gap
      if (hiddenAt !== null && Date.now() - hiddenAt >= RESUME_GAP_MS) {
        void runProbeCycle();
      }
    }

    function onPageShow(e: PageTransitionEvent) {
      // bfcache restore is always a resume, regardless of measured gap
      if (e.persisted) void runProbeCycle();
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return null;
}
