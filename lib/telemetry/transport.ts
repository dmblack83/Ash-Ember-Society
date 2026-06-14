/*
 * Transport timing diagnostics.
 *
 * Reads the browser's Resource Timing entries to break a slow request
 * into its phases — stall/queue, DNS, connection (incl. TLS), TTFB,
 * transfer — so we can tell WHERE a cold-return slowdown lives
 * (connection setup vs server vs bandwidth) instead of guessing.
 *
 * Same-origin requests expose all phases. Cross-origin requests
 * (e.g. Supabase REST) only expose duration unless the response sets
 * Timing-Allow-Origin; those are flagged `crossOrigin` with zeroed
 * phases.
 *
 * The pure functions here are unit-tested; the reporter wires them to
 * Sentry via trackReliability.
 */

import { trackReliability } from "@/lib/telemetry/reliability";

/* Minimal shape of a PerformanceResourceTiming entry (the fields we read). */
export interface ResourceTimingLike {
  name:                  string;
  initiatorType:         string;
  startTime:             number;
  duration:              number;
  domainLookupStart:     number;
  domainLookupEnd:       number;
  connectStart:          number;
  connectEnd:            number;
  secureConnectionStart: number;
  requestStart:          number;
  responseStart:         number;
  responseEnd:           number;
}

export interface TransportSample {
  url:         string;
  durationMs:  number;
  stallMs:     number;
  dnsMs:       number;
  connectMs:   number;
  tlsMs:       number;
  ttfbMs:      number;
  transferMs:  number;
  crossOrigin: boolean;
}

function span(end: number, start: number): number {
  return end > 0 && start > 0 && end >= start ? Math.round(end - start) : 0;
}

export function summarizeEntry(e: ResourceTimingLike, origin: string): TransportSample {
  const dnsMs     = span(e.domainLookupEnd, e.domainLookupStart);
  const connectMs = span(e.connectEnd, e.connectStart);
  const tlsMs     = e.secureConnectionStart > 0 ? span(e.connectEnd, e.secureConnectionStart) : 0;
  const ttfbMs    = span(e.responseStart, e.requestStart);
  const transferMs = span(e.responseEnd, e.responseStart);
  /* Everything before the request actually went out, minus the DNS +
     connect we can attribute — i.e. queueing / blocked / stalled. */
  const preRequest = e.requestStart > 0 ? Math.max(0, e.requestStart - e.startTime) : 0;
  const stallMs    = Math.max(0, Math.round(preRequest - dnsMs - connectMs));

  return {
    url:         e.name,
    durationMs:  Math.round(e.duration),
    stallMs,
    dnsMs,
    connectMs,
    tlsMs,
    ttfbMs,
    transferMs,
    crossOrigin: !e.name.startsWith(origin),
  };
}

const DATA_INITIATORS = new Set(["fetch", "xmlhttprequest", "navigation", "other"]);

export function isDataRequest(
  e: ResourceTimingLike,
  opts: { origin: string; supabaseHost: string },
): boolean {
  if (e.name.includes(opts.supabaseHost)) return true;
  if (!DATA_INITIATORS.has(e.initiatorType)) return false;
  /* Same-origin route / RSC / data fetches. Exclude static asset paths
     that slip through as "fetch" (chunks, images, fonts). */
  if (e.name.startsWith(opts.origin)) {
    return !/\/_next\/static\/|\.(?:js|css|png|jpe?g|webp|svg|woff2?|ico)(?:\?|$)/.test(e.name);
  }
  return false;
}

export function pickSlowTransports(
  entries: ResourceTimingLike[],
  opts: { origin: string; supabaseHost: string; sinceMs: number; slowMs: number; max: number },
): TransportSample[] {
  return entries
    .filter(
      (e) =>
        e.startTime >= opts.sinceMs &&
        e.duration >= opts.slowMs &&
        isDataRequest(e, opts),
    )
    .sort((a, b) => b.duration - a.duration)
    .slice(0, opts.max)
    .map((e) => summarizeEntry(e, opts.origin));
}

/* Report the slowest cold-window data transports to Sentry. Browser-only
   (reads no globals here — entries are passed in). */
export function reportSlowTransports(
  entries: ResourceTimingLike[],
  ctx: { origin: string; supabaseHost: string; sinceMs: number; reason: string; slowMs?: number; max?: number },
): TransportSample[] {
  const samples = pickSlowTransports(entries, {
    origin:       ctx.origin,
    supabaseHost: ctx.supabaseHost,
    sinceMs:      ctx.sinceMs,
    slowMs:       ctx.slowMs ?? 3000,
    max:          ctx.max ?? 1,
  });

  for (const s of samples) {
    trackReliability({
      bucket:  "network_resilience",
      subtype: "cold_transport_slow",
      cause:   ctx.reason,
      detail:  s.url,
      extra: {
        duration_ms: s.durationMs,
        stall_ms:    s.stallMs,
        dns_ms:      s.dnsMs,
        connect_ms:  s.connectMs,
        tls_ms:      s.tlsMs,
        ttfb_ms:     s.ttfbMs,
        transfer_ms: s.transferMs,
        cross_origin: s.crossOrigin,
      },
    });
  }
  return samples;
}
