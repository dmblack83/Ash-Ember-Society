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
});
