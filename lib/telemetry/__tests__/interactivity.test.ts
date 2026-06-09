import { describe, it, expect } from "vitest";
import {
  SLOW_HYDRATION_THRESHOLD_MS,
  effectiveDelayMs,
  shouldReportInteractivity,
  type InteractivitySample,
} from "../interactivity";

const sample = (over: Partial<InteractivitySample> = {}): InteractivitySample => ({
  fcpMs:              500,
  hydratedMs:         4000,
  interactiveDelayMs: 3500,
  longtaskCount:      6,
  longtaskTotalMs:    2800,
  longtaskMaxMs:      900,
  navType:            "reload",
  standalone:         true,
  ...over,
});

describe("effectiveDelayMs", () => {
  it("uses the FCP -> hydrated delta when FCP is available", () => {
    expect(effectiveDelayMs(sample({ interactiveDelayMs: 3500 }))).toBe(3500);
  });

  it("falls back to absolute hydration time when FCP is unavailable", () => {
    expect(effectiveDelayMs(sample({ fcpMs: null, interactiveDelayMs: null, hydratedMs: 4200 }))).toBe(4200);
  });
});

describe("shouldReportInteractivity", () => {
  it("reports a slow window (delta over threshold)", () => {
    expect(shouldReportInteractivity(sample({ interactiveDelayMs: SLOW_HYDRATION_THRESHOLD_MS + 1 }))).toBe(true);
  });

  it("reports exactly at the threshold", () => {
    expect(shouldReportInteractivity(sample({ interactiveDelayMs: SLOW_HYDRATION_THRESHOLD_MS }))).toBe(true);
  });

  it("does not report a fast window", () => {
    expect(shouldReportInteractivity(sample({ interactiveDelayMs: 800 }))).toBe(false);
  });

  it("uses the absolute hydration time when FCP is missing", () => {
    expect(
      shouldReportInteractivity(sample({ fcpMs: null, interactiveDelayMs: null, hydratedMs: SLOW_HYDRATION_THRESHOLD_MS + 100 })),
    ).toBe(true);
    expect(
      shouldReportInteractivity(sample({ fcpMs: null, interactiveDelayMs: null, hydratedMs: 1000 })),
    ).toBe(false);
  });
});
