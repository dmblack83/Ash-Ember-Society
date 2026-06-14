import { describe, it, expect } from "vitest";
import {
  summarizeEntry,
  isDataRequest,
  pickSlowTransports,
  type ResourceTimingLike,
} from "@/lib/telemetry/transport";

const ORIGIN = "https://app.example.com";
const SUPA   = "xyz.supabase.co";

/* A slow same-origin route request dominated by connection setup
   (the QUIC-stall signature: connect spans ~20s). */
const slowConnect: ResourceTimingLike = {
  name:                  `${ORIGIN}/home`,
  initiatorType:         "navigation",
  startTime:             1000,
  duration:             20080,
  domainLookupStart:     1005,
  domainLookupEnd:       1010,
  connectStart:          1010,
  connectEnd:           21000,
  secureConnectionStart: 1100,
  requestStart:         21000,
  responseStart:        21050,
  responseEnd:          21080,
};

/* A fast same-origin fetch. */
const fast: ResourceTimingLike = {
  name:                  `${ORIGIN}/api/notifications`,
  initiatorType:         "fetch",
  startTime:             1000,
  duration:               200,
  domainLookupStart:     1000,
  domainLookupEnd:       1000,
  connectStart:          1000,
  connectEnd:            1000,
  secureConnectionStart: 1000,
  requestStart:          1010,
  responseStart:         1180,
  responseEnd:           1200,
};

/* A cross-origin Supabase request with phases zeroed (no Timing-Allow-Origin). */
const crossOrigin: ResourceTimingLike = {
  name:                  `https://${SUPA}/rest/v1/humidor_items`,
  initiatorType:         "fetch",
  startTime:             1000,
  duration:              5000,
  domainLookupStart:     0,
  domainLookupEnd:       0,
  connectStart:          0,
  connectEnd:            0,
  secureConnectionStart: 0,
  requestStart:          0,
  responseStart:         0,
  responseEnd:           6000,
};

/* A static asset that should never be treated as a data request. */
const staticAsset: ResourceTimingLike = {
  ...fast,
  name:          `${ORIGIN}/_next/static/chunks/main.js`,
  initiatorType: "script",
  duration:      9000,
};

describe("summarizeEntry", () => {
  it("attributes a 20s stall to the connection phase for a same-origin request", () => {
    const s = summarizeEntry(slowConnect, ORIGIN);
    expect(s.crossOrigin).toBe(false);
    expect(s.connectMs).toBe(19990);
    expect(s.dnsMs).toBe(5);
    expect(s.ttfbMs).toBe(50);
    expect(s.transferMs).toBe(30);
    expect(s.durationMs).toBe(20080);
  });

  it("flags cross-origin and reports duration only when phases are zeroed", () => {
    const s = summarizeEntry(crossOrigin, ORIGIN);
    expect(s.crossOrigin).toBe(true);
    expect(s.connectMs).toBe(0);
    expect(s.ttfbMs).toBe(0);
    expect(s.durationMs).toBe(5000);
  });
});

describe("isDataRequest", () => {
  const opts = { origin: ORIGIN, supabaseHost: SUPA };
  it("accepts same-origin route/fetch requests", () => {
    expect(isDataRequest(slowConnect, opts)).toBe(true);
    expect(isDataRequest(fast, opts)).toBe(true);
  });
  it("accepts any request to the Supabase host", () => {
    expect(isDataRequest(crossOrigin, opts)).toBe(true);
  });
  it("rejects same-origin static assets", () => {
    expect(isDataRequest(staticAsset, opts)).toBe(false);
  });
});

describe("pickSlowTransports", () => {
  const base = { origin: ORIGIN, supabaseHost: SUPA, sinceMs: 0, slowMs: 3000, max: 3 };

  it("returns slow data requests sorted slowest-first, excluding fast + static", () => {
    const out = pickSlowTransports([fast, slowConnect, crossOrigin, staticAsset], base);
    expect(out.map((s) => s.durationMs)).toEqual([20080, 5000]);
    expect(out[0].connectMs).toBe(19990);
  });

  it("excludes entries before the sinceMs anchor", () => {
    const out = pickSlowTransports([slowConnect], { ...base, sinceMs: 5000 });
    expect(out).toEqual([]);
  });

  it("respects the max cap", () => {
    const out = pickSlowTransports([slowConnect, crossOrigin], { ...base, max: 1 });
    expect(out).toHaveLength(1);
    expect(out[0].durationMs).toBe(20080);
  });
});
