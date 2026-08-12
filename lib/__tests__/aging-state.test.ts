import { describe, expect, test } from "vitest";
import { agingState, formatShortDate } from "@/lib/humidor/aging-state";

const NOW = new Date(Date.UTC(2026, 7, 12)); // 2026-08-12

describe("agingState", () => {
  test("no start, no target: none", () => {
    expect(agingState(null, null, NOW)).toEqual({ kind: "none" });
  });
  test("start only: plain day count", () => {
    expect(agingState("2026-07-01", null, NOW)).toEqual({ kind: "plain", days: 42 });
  });
  test("target more than 14 days out: aging with ready label", () => {
    expect(agingState("2026-05-20", "2026-11-16", NOW)).toEqual({
      kind: "aging", days: 84, readyLabel: "Nov 16",
    });
  });
  test("target exactly 15 days out is still aging", () => {
    expect(agingState("2026-05-20", "2026-08-27", NOW).kind).toBe("aging");
  });
  test("target 14 days out flips to almost", () => {
    expect(agingState("2026-05-20", "2026-08-26", NOW)).toEqual({
      kind: "almost", days: 84, daysToTarget: 14,
    });
  });
  test("target today is ready", () => {
    expect(agingState("2026-01-22", "2026-08-12", NOW)).toEqual({ kind: "ready", days: 202 });
  });
  test("target passed is ready", () => {
    expect(agingState("2026-01-22", "2026-08-10", NOW).kind).toBe("ready");
  });
  test("target set with no start still reports states", () => {
    expect(agingState(null, "2026-08-10", NOW)).toEqual({ kind: "ready", days: 0 });
  });
});

test("formatShortDate", () => {
  expect(formatShortDate("2026-11-16")).toBe("Nov 16");
});
