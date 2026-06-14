import { describe, it, expect } from "vitest";
import { wrapIndex, ringOffset } from "@/lib/ui/carousel";

describe("wrapIndex", () => {
  it("wraps in both directions", () => {
    expect(wrapIndex(0, 3)).toBe(0);
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(4, 3)).toBe(1);
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(-3, 3)).toBe(0);
  });
});

describe("ringOffset (n=3)", () => {
  it("places active at 0, next at +1, previous at -1 — wrapping", () => {
    expect(ringOffset(0, 0, 3)).toBe(0);
    expect(ringOffset(1, 0, 3)).toBe(1);
    expect(ringOffset(2, 0, 3)).toBe(-1);
    expect(ringOffset(2, 2, 3)).toBe(0);
    expect(ringOffset(0, 2, 3)).toBe(1);
    expect(ringOffset(1, 2, 3)).toBe(-1);
    expect(ringOffset(1, 1, 3)).toBe(0);
    expect(ringOffset(2, 1, 3)).toBe(1);
    expect(ringOffset(0, 1, 3)).toBe(-1);
  });

  it("handles the single-item case", () => {
    expect(ringOffset(0, 0, 1)).toBe(0);
  });
});
