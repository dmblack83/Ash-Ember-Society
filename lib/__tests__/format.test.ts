/* Pin a timezone west of UTC so the smokedAtToLocalDate assertions catch
   the UTC-midnight off-by-one regardless of the machine running the tests
   (CI is UTC, where naive parsing would pass by accident). */
process.env.TZ = "America/Denver";

import { describe, expect, it, vi, afterEach } from "vitest";

import { agingDays, ratingWord, smokedAtToLocalDate, todayLocalYmd } from "@/lib/format";

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

describe("smokedAtToLocalDate", () => {
  it("parses a date-only string to that calendar day in local time", () => {
    const d = smokedAtToLocalDate("2026-07-08");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(6);
    expect(d?.getDate()).toBe(8);
  });

  it("shows the UTC calendar day for a timestamptz value, not the local-shifted day", () => {
    // smoked_at is timestamptz; the wizard writes date-only values that land
    // as UTC midnight. Naive new Date() parsing renders the PREVIOUS day in
    // timezones west of UTC (the bug this helper exists to prevent).
    const d = smokedAtToLocalDate("2026-07-08T00:00:00+00:00");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(6);
    expect(d?.getDate()).toBe(8);
  });

  it("returns null for unparseable input", () => {
    expect(smokedAtToLocalDate("not-a-date")).toBeNull();
    expect(smokedAtToLocalDate("")).toBeNull();
  });
});

describe("todayLocalYmd", () => {
  it("returns the LOCAL calendar date, not the UTC one, late in the evening", () => {
    // 02:00 UTC on Jul 8 is 8pm Jul 7 in Denver. toISOString-based
    // "today" would say Jul 8 — a day the user hasn't reached yet.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T02:00:00Z"));
    expect(todayLocalYmd()).toBe("2026-07-07");
  });

  it("zero-pads month and day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-03T18:00:00Z"));
    expect(todayLocalYmd()).toBe("2026-02-03");
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
