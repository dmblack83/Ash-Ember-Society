import { describe, it, expect } from "vitest";
import { gradeFor, starFillPct, shouldRenderPage2 } from "../helpers";
import type { ShareImageProps } from "../types";

const base = (): ShareImageProps => ({
  reportNumber:         1,
  smokedAt:             "2026-06-08",
  cigar:                { brand: "Padron", series: "1964", format: "Robusto" },
  overallRating:        88,
  drawRating:           4.5,
  burnRating:           4.0,
  constructionRating:   4.5,
  flavorRating:         4.75,
  reviewText:           null,
  smokeDurationMinutes: 75,
  pairingDrink:         null,
  occasion:             null,
  flavorTagNames:       [],
  photoDataUris:        [],
  thirdsEnabled:        false,
  thirdBeginning:       null,
  thirdMiddle:          null,
  thirdEnd:             null,
  thirdsTaggedRows:     [],
  displayName:          "Dave Black",
  city:                 "Salt Lake City",
});

describe("gradeFor", () => {
  it("returns Poor for 20",            () => expect(gradeFor(20)).toBe("Poor"));
  it("returns Below Average for 40",   () => expect(gradeFor(40)).toBe("Below Average"));
  it("returns Average for 60",         () => expect(gradeFor(60)).toBe("Average"));
  it("returns Good for 80",            () => expect(gradeFor(80)).toBe("Good"));
  it("returns Outstanding for 81",     () => expect(gradeFor(81)).toBe("Outstanding"));
  it("returns Outstanding for 100",    () => expect(gradeFor(100)).toBe("Outstanding"));
});

describe("starFillPct", () => {
  it("returns 100 for whole star (s <= floor(val))", () => {
    expect(starFillPct(1, 3.5)).toBe(100);
    expect(starFillPct(3, 3.5)).toBe(100);
  });
  it("returns 0 for empty star (s > val)", () => {
    expect(starFillPct(5, 3.5)).toBe(0);
    expect(starFillPct(4, 3.0)).toBe(0);
  });
  it("returns partial fill percent for fractional star", () => {
    expect(starFillPct(4, 3.75)).toBe(75);
    expect(starFillPct(2, 1.5)).toBe(50);
  });
  it("returns 100 for exactly matching whole number", () => {
    expect(starFillPct(3, 3.0)).toBe(100);
  });
});

describe("shouldRenderPage2", () => {
  it("returns false with no thirds, no review, no tasting notes", () => {
    expect(shouldRenderPage2(base())).toBe(false);
  });
  it("returns true when thirdsEnabled and at least one third has content", () => {
    expect(shouldRenderPage2({
      ...base(),
      thirdsEnabled:  true,
      thirdBeginning: "Cedar and leather",
    })).toBe(true);
  });
  it("returns false when thirdsEnabled but all thirds are empty", () => {
    expect(shouldRenderPage2({ ...base(), thirdsEnabled: true })).toBe(false);
  });
  it("returns true when reviewText is non-empty", () => {
    expect(shouldRenderPage2({ ...base(), reviewText: "Fantastic smoke" })).toBe(true);
  });
  it("returns true when flavorTagNames has entries", () => {
    expect(shouldRenderPage2({ ...base(), flavorTagNames: ["Cedar", "Leather"] })).toBe(true);
  });
  it("returns false when reviewText is whitespace only", () => {
    expect(shouldRenderPage2({ ...base(), reviewText: "   " })).toBe(false);
  });
});
