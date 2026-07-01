import { describe, expect, it, vi, afterEach } from "vitest";

import { agingDays, ratingWord } from "@/lib/format";

afterEach(() => {
  vi.useRealTimers();
});

describe("agingDays", () => {
  it("returns 0 for null start date", () => {
    expect(agingDays(null)).toBe(0);
  });

  it("returns whole days elapsed since the start date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));
    expect(agingDays("2026-06-01T12:00:00Z")).toBe(30);
  });

  it("floors partial days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));
    expect(agingDays("2026-06-30T00:00:00Z")).toBe(1);
  });

  it("clamps future dates to 0", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));
    expect(agingDays("2026-08-01T00:00:00Z")).toBe(0);
  });
});

describe("ratingWord", () => {
  it("maps the 1-5 scale to words", () => {
    expect(ratingWord(1)).toBe("Poor");
    expect(ratingWord(2)).toBe("Below Average");
    expect(ratingWord(3)).toBe("Average");
    expect(ratingWord(4)).toBe("Good");
    expect(ratingWord(5)).toBe("Excellent");
  });

  it("returns a dash for unrated (below 1)", () => {
    expect(ratingWord(0)).toBe("—");
  });
});
