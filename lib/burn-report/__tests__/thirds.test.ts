import { describe, it, expect } from "vitest";
import {
  averageThirdsToQuarter,
  roundUpToQuarter,
  type PerThirdData,
} from "../thirds";

describe("roundUpToQuarter", () => {
  it("rounds 4.67 up to 4.75", () => {
    expect(roundUpToQuarter(4.67)).toBe(4.75);
  });
  it("rounds 4.30 up to 4.5", () => {
    expect(roundUpToQuarter(4.30)).toBe(4.5);
  });
  it("rounds 4.05 up to 4.25", () => {
    expect(roundUpToQuarter(4.05)).toBe(4.25);
  });
  it("leaves an exact quarter unchanged", () => {
    expect(roundUpToQuarter(4.5)).toBe(4.5);
    expect(roundUpToQuarter(4.0)).toBe(4.0);
  });
  it("caps at 5.0", () => {
    expect(roundUpToQuarter(4.9)).toBe(5.0);
    expect(roundUpToQuarter(5.0)).toBe(5.0);
  });
  it("handles zero", () => {
    expect(roundUpToQuarter(0)).toBe(0);
  });
  it("returns 0 for NaN", () => {
    expect(roundUpToQuarter(Number.NaN)).toBe(0);
  });
  it("returns 0 for Infinity (negative direction handled by the cap, positive returns 5)", () => {
    expect(roundUpToQuarter(-Infinity)).toBe(0);
    expect(roundUpToQuarter(Infinity)).toBe(5);
  });
});

describe("averageThirdsToQuarter", () => {
  const t = (draw: number, burn: number, build: number, flavor: number): PerThirdData => ({
    notes: "x",
    draw_rating: draw,
    burn_rating: burn,
    construction_rating: build,
    flavor_rating: flavor,
    flavor_tag_ids: [],
  });

  it("averages three thirds per dimension and rounds up to quarter", () => {
    const result = averageThirdsToQuarter([
      t(5, 5, 5, 5),
      t(4, 5, 4, 4),
      t(5, 5, 4, 5),
    ]);
    // draw: (5+4+5)/3 = 4.666... → 4.75
    expect(result.draw_rating).toBe(4.75);
    // burn: (5+5+5)/3 = 5.0
    expect(result.burn_rating).toBe(5.0);
    // construction: (5+4+4)/3 = 4.333... → 4.5
    expect(result.construction_rating).toBe(4.5);
    // flavor: (5+4+5)/3 = 4.666... → 4.75
    expect(result.flavor_rating).toBe(4.75);
  });
  it("works at the low end (all 1s)", () => {
    const r = averageThirdsToQuarter([t(1, 1, 1, 1), t(1, 1, 1, 1), t(1, 1, 1, 1)]);
    expect(r).toEqual({ draw_rating: 1, burn_rating: 1, construction_rating: 1, flavor_rating: 1 });
  });
  it("returns all zeros for an empty array (guards the early-return branch)", () => {
    const r = averageThirdsToQuarter([]);
    expect(r).toEqual({ draw_rating: 0, burn_rating: 0, construction_rating: 0, flavor_rating: 0 });
  });
  it("handles a single-third input without special casing", () => {
    const r = averageThirdsToQuarter([t(3, 2, 4, 1)]);
    expect(r).toEqual({ draw_rating: 3, burn_rating: 2, construction_rating: 4, flavor_rating: 1 });
  });
});
