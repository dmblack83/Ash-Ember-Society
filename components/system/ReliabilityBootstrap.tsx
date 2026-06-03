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
     */
    if (typeof window !== "undefined") {
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
    }

    return () => {
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);

  return null;
}
