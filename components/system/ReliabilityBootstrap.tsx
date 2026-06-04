"use client";

import { useEffect } from "react";
import {
  trackReliability,
  type ReliabilityBucket,
  type ReliabilitySubtype,
} from "@/lib/telemetry/reliability";

interface SwReliabilityMessage {
  type:     "RELIABILITY_EVENT";
  bucket:   ReliabilityBucket;
  subtype:  ReliabilitySubtype;
  cause?:   string;
  detail?:  string;
  extra?:   Record<string, string | number | boolean>;
}

function isSwReliabilityMessage(d: unknown): d is SwReliabilityMessage {
  if (!d || typeof d !== "object") return false;
  const m = d as Record<string, unknown>;
  return m.type === "RELIABILITY_EVENT" && typeof m.bucket === "string" && typeof m.subtype === "string";
}

/*
 * Bridges SW and inline-head-script reliability signals into the
 * trackReliability helper. Mounted once at the app root.
 */
export default function ReliabilityBootstrap() {
  useEffect(() => {
    /* 1. Listen for SW-bridged events. */
    const onMessage = (event: MessageEvent) => {
      if (!isSwReliabilityMessage(event.data)) return;
      trackReliability({
        bucket:  event.data.bucket,
        subtype: event.data.subtype,
        cause:   event.data.cause,
        detail:  event.data.detail,
        extra:   event.data.extra,
      });
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);

    /* 2. Forward inline-head-script signals once per session.
     *
     * The head scripts (stale-chunk-recovery, hydration-watchdog)
     * write try-counters to sessionStorage and trigger a reload.
     * Performance marks reset on reload — sessionStorage does not.
     * We read the counters here and fire telemetry exactly once
     * per session per signal, guarded by our own sessionStorage flag.
     *
     * sessionStorage access can throw SecurityError in sandboxed
     * iframes or hardened WebViews; swallow.
     */
    try {
      const FIRED_KEY = "ae-reliability-fired";
      const fired = new Set((sessionStorage.getItem(FIRED_KEY) ?? "").split(",").filter(Boolean));
      const markFired = (name: string) => {
        fired.add(name);
        sessionStorage.setItem(FIRED_KEY, Array.from(fired).join(","));
      };

      const watchdogTries = parseInt(sessionStorage.getItem("ae-hydrate-watchdog-tries") ?? "0", 10);
      if (watchdogTries >= 1 && !fired.has("watchdog")) {
        trackReliability({
          bucket:  "ios_webkit",
          subtype: "hydration_watchdog_fired",
          cause:   "head_script",
          extra:   { tries: watchdogTries },
        });
        markFired("watchdog");
      }

      const chunkTries = parseInt(sessionStorage.getItem("ae-chunk-bust-tries") ?? "0", 10);
      if (chunkTries >= 1 && !fired.has("chunk")) {
        trackReliability({
          bucket:  "network_resilience",
          subtype: "chunk_load_error",
          cause:   "head_script",
          extra:   { tries: chunkTries },
        });
        markFired("chunk");
      }

      /* Manifest scope check: fires once per session if the current
         host doesn't match the manifest's `scope` host. Catches PWAs
         bouncing into an in-app browser at the wrong scope (e.g. bare
         host while manifest scope is www). */
      if (!fired.has("scope") && typeof fetch === "function") {
        void (async () => {
          try {
            const res = await fetch("/manifest.webmanifest", { cache: "no-cache" });
            if (!res.ok) return;
            const m = (await res.json()) as { scope?: string };
            if (!m.scope) return;
            const scopeUrl = new URL(m.scope, location.origin);
            if (scopeUrl.host !== location.host) {
              trackReliability({
                bucket:  "ios_webkit",
                subtype: "scope_violation",
                cause:   "host_mismatch",
                detail:  `current=${location.host} scope=${scopeUrl.host}`,
              });
              markFired("scope");
            }
          } catch {
            /* manifest fetch can fail offline — non-fatal */
          }
        })();
      }

      /* Redirect-loop detection: navigation timing reports redirectCount.
         3+ redirects on a single navigation strongly suggests a loop. */
      if (!fired.has("redirect") && typeof performance !== "undefined" && typeof performance.getEntriesByType === "function") {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        if (nav && nav.redirectCount >= 3) {
          trackReliability({
            bucket:  "ios_webkit",
            subtype: "redirect_loop",
            cause:   "navigation_timing",
            extra:   { redirect_count: nav.redirectCount },
          });
          markFired("redirect");
        }
      }
    } catch {
      /* sessionStorage unavailable — non-fatal */
    }

    return () => {
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);

  return null;
}
