import { describe, expect, test } from "vitest";
import {
  relativeBurnTime, onThisDayCandidates, nudgeLine, yearsAgoLabel,
} from "@/lib/home/last-burn";

const NOW = new Date(2026, 7, 14, 15, 30); // local Aug 14 2026, 3:30 PM

describe("relativeBurnTime", () => {
  test("same day", () => expect(relativeBurnTime("2026-08-14", NOW)).toBe("Today"));
  test("yesterday", () => expect(relativeBurnTime("2026-08-13", NOW)).toBe("Yesterday"));
  test("2 days", () => expect(relativeBurnTime("2026-08-12", NOW)).toBe("2 days ago"));
  test("13 days", () => expect(relativeBurnTime("2026-08-01", NOW)).toBe("13 days ago"));
  test("14 days flips to weeks", () => expect(relativeBurnTime("2026-07-31", NOW)).toBe("2 weeks ago"));
  test("29 days still weeks", () => expect(relativeBurnTime("2026-07-16", NOW)).toBe("4 weeks ago"));
  test("30 days becomes absolute", () => expect(relativeBurnTime("2026-07-15", NOW)).toBe("Jul 15"));
});

describe("onThisDayCandidates", () => {
  test("plain day: five prior years", () => {
    expect(onThisDayCandidates(NOW)).toEqual([
      "2025-08-14", "2024-08-14", "2023-08-14", "2022-08-14", "2021-08-14",
    ]);
  });
  test("Mar 1 adds Feb 29 for leap years", () => {
    const mar1 = new Date(2026, 2, 1);
    const c = onThisDayCandidates(mar1);
    expect(c).toContain("2024-02-29");
    expect(c).toContain("2025-03-01");
    expect(c).not.toContain("2025-02-29");
  });
});

describe("nudgeLine", () => {
  test("singular", () => expect(nudgeLine(1)).toBe("One stick is rested and ready."));
  test("plural", () => expect(nudgeLine(3)).toBe("3 sticks are rested and ready."));
});

describe("yearsAgoLabel", () => {
  test("one year", () => expect(yearsAgoLabel("2025-08-14", NOW)).toBe("One year ago today"));
  test("three years", () => expect(yearsAgoLabel("2023-08-14", NOW)).toBe("3 years ago today"));
});
