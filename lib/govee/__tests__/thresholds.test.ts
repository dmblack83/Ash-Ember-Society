import { describe, expect, test } from "vitest";
import {
  evaluateReading, validateThresholds, isMetricOutOfRange,
  DEFAULT_THRESHOLDS, ALERT_COOLDOWN_MS,
} from "../thresholds";

const CFG = DEFAULT_THRESHOLDS; // 62-72 RH, 60-72 F
const NOW = Date.parse("2026-07-19T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("evaluateReading", () => {
  test("in-range reading produces no alerts and in-range state", () => {
    const r = evaluateReading({ tempF: 68, humidity: 66 }, CFG, {}, NOW);
    expect(r.alerts).toEqual([]);
    expect(r.nextState.temp?.outOfRange).toBe(false);
    expect(r.nextState.humidity?.outOfRange).toBe(false);
  });

  test("transition into low humidity fires one alert and stamps lastAlertAt", () => {
    const r = evaluateReading({ tempF: 68, humidity: 58 }, CFG, {}, NOW);
    expect(r.alerts).toEqual([{ metric: "humidity", direction: "low", value: 58 }]);
    expect(r.nextState.humidity).toEqual({ outOfRange: true, lastAlertAt: iso(NOW) });
  });

  test("staying out of range does NOT re-alert (transition-only)", () => {
    const prev = { humidity: { outOfRange: true, lastAlertAt: iso(NOW - 10 * 60_000) } };
    const r = evaluateReading({ tempF: 68, humidity: 57 }, CFG, prev, NOW);
    expect(r.alerts).toEqual([]);
    expect(r.nextState.humidity?.lastAlertAt).toBe(iso(NOW - 10 * 60_000));
  });

  test("bounce back out within cooldown is silenced, lastAlertAt preserved", () => {
    const last = iso(NOW - ALERT_COOLDOWN_MS + 60_000); // 5h59m ago
    const prev = { humidity: { outOfRange: false, lastAlertAt: last } };
    const r = evaluateReading({ tempF: 68, humidity: 58 }, CFG, prev, NOW);
    expect(r.alerts).toEqual([]);
    expect(r.nextState.humidity).toEqual({ outOfRange: true, lastAlertAt: last });
  });

  test("re-entry after cooldown expiry alerts again", () => {
    const prev = { humidity: { outOfRange: false, lastAlertAt: iso(NOW - ALERT_COOLDOWN_MS - 1) } };
    const r = evaluateReading({ tempF: 68, humidity: 58 }, CFG, prev, NOW);
    expect(r.alerts).toHaveLength(1);
    expect(r.nextState.humidity?.lastAlertAt).toBe(iso(NOW));
  });

  test("recovery clears outOfRange without alerting", () => {
    const last = iso(NOW - 60_000);
    const prev = { temp: { outOfRange: true, lastAlertAt: last } };
    const r = evaluateReading({ tempF: 68, humidity: 66 }, CFG, prev, NOW);
    expect(r.alerts).toEqual([]);
    expect(r.nextState.temp).toEqual({ outOfRange: false, lastAlertAt: last });
  });

  test("both metrics can alert in one pass, high direction reported", () => {
    const r = evaluateReading({ tempF: 80, humidity: 78 }, CFG, {}, NOW);
    expect(r.alerts).toEqual([
      { metric: "temp",     direction: "high", value: 80 },
      { metric: "humidity", direction: "high", value: 78 },
    ]);
  });
});

describe("isMetricOutOfRange", () => {
  test("boundary values are in range (inclusive)", () => {
    expect(isMetricOutOfRange({ tempF: 60, humidity: 62 }, CFG, "temp")).toBe(false);
    expect(isMetricOutOfRange({ tempF: 72, humidity: 72 }, CFG, "humidity")).toBe(false);
    expect(isMetricOutOfRange({ tempF: 59.9, humidity: 66 }, CFG, "temp")).toBe(true);
  });
});

describe("validateThresholds", () => {
  test("accepts sane config", () => {
    expect(validateThresholds({ humidityMin: 60, humidityMax: 75, tempMinF: 55, tempMaxF: 75 }))
      .toEqual({ humidityMin: 60, humidityMax: 75, tempMinF: 55, tempMaxF: 75 });
  });
  test("rejects min >= max", () => {
    expect(validateThresholds({ humidityMin: 72, humidityMax: 62, tempMinF: 60, tempMaxF: 72 })).toBeNull();
  });
  test("rejects out-of-band values (RH outside 30-90, temp outside 40-90)", () => {
    expect(validateThresholds({ humidityMin: 10, humidityMax: 72, tempMinF: 60, tempMaxF: 72 })).toBeNull();
    expect(validateThresholds({ humidityMin: 62, humidityMax: 72, tempMinF: 60, tempMaxF: 95 })).toBeNull();
  });
  test("rejects non-numeric / missing fields", () => {
    expect(validateThresholds({ humidityMin: "62" })).toBeNull();
    expect(validateThresholds(null)).toBeNull();
  });
});
