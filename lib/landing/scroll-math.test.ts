import { describe, it, expect } from "vitest";
import {
  pageProgress,
  bloomLevel,
  railDisplayPercent,
  shouldWriteProgress,
} from "./scroll-math";

describe("pageProgress", () => {
  it("returns 0 at top", () => {
    expect(pageProgress(0, 5000)).toBe(0);
  });
  it("returns 1 at bottom", () => {
    expect(pageProgress(5000, 5000)).toBe(1);
  });
  it("clamps above 1", () => {
    expect(pageProgress(6000, 5000)).toBe(1);
  });
  it("never divides by zero (maxScroll floor of 1)", () => {
    expect(pageProgress(100, 0)).toBe(1);
  });
  it("treats negative scrollY as 0", () => {
    expect(pageProgress(-50, 5000)).toBe(0);
  });
});

describe("bloomLevel", () => {
  // spec §4: full at hero (p<.12), .15 mid-page, returns after p>.82
  it("is 1 at p=0", () => {
    expect(bloomLevel(0)).toBe(1);
  });
  it("fades linearly across the hero band (p=.06 -> .7)", () => {
    expect(bloomLevel(0.06)).toBeCloseTo(0.7);
  });
  it("is .15 mid-page", () => {
    expect(bloomLevel(0.5)).toBe(0.15);
  });
  it("returns toward 1 near the finale (p=.91 -> .5)", () => {
    expect(bloomLevel(0.91)).toBeCloseTo(0.5);
  });
  it("is 1 at p=1", () => {
    expect(bloomLevel(1)).toBeCloseTo(1);
  });
});

describe("railDisplayPercent", () => {
  // spec §6: display progress clamped to p*0.76 so the ember ends AT the band
  it("is 0 at top", () => {
    expect(railDisplayPercent(0)).toBe(0);
  });
  it("scales by 0.76 (p=.5 -> 38)", () => {
    expect(railDisplayPercent(0.5)).toBeCloseTo(38);
  });
  it("ends at 76 at page bottom", () => {
    expect(railDisplayPercent(1)).toBeCloseTo(76);
  });
});

describe("shouldWriteProgress", () => {
  // spec §6 JS contract: skip when |delta p| < .0005
  it("skips sub-threshold deltas", () => {
    expect(shouldWriteProgress(0.50004, 0.5)).toBe(false);
  });
  it("writes at/above threshold", () => {
    expect(shouldWriteProgress(0.5006, 0.5)).toBe(true);
  });
  it("writes on first frame (lastP = -1)", () => {
    expect(shouldWriteProgress(0, -1)).toBe(true);
  });
});
