import { describe, it, expect } from "vitest";
import { gradeFor, starFillPct, shouldRenderPage2, clampText, fitWithin, singlePhotoBandHeight, photoRowHeight } from "../helpers";
import { T } from "../tokens";
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
  photos:               [],
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

describe("clampText", () => {
  it("returns short text trimmed and unchanged", () => {
    expect(clampText("  a short note  ", 100)).toBe("a short note");
  });

  it("returns empty string for null, undefined, or blank", () => {
    expect(clampText(null, 50)).toBe("");
    expect(clampText(undefined, 50)).toBe("");
    expect(clampText("   ", 50)).toBe("");
  });

  it("clamps long text and ends with a single ellipsis", () => {
    const out = clampText("a".repeat(200), 50);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
  });

  it("cuts at a word boundary, not mid-word", () => {
    const text = "the quick brown fox jumps over the lazy dog";
    const out  = clampText(text, 25);
    const visible = out.slice(0, -1); // drop the ellipsis
    expect(out.endsWith("…")).toBe(true);
    expect(text.startsWith(visible)).toBe(true);
    expect(text[visible.length]).toBe(" "); // clean cut at a space
  });
});

describe("fitWithin — contain math for photo cells (scale to fit, never crop)", () => {
  it("fits a landscape image into a wide band by height", () => {
    // 4:3 landscape into 984×360 → height-bound: 480×360
    expect(fitWithin(4000, 3000, 984, 360)).toEqual({ width: 480, height: 360 });
  });

  it("fits a panoramic image by width", () => {
    // 4:1 pano into 984×360 → width-bound: 984×246
    expect(fitWithin(4000, 1000, 984, 360)).toEqual({ width: 984, height: 246 });
  });

  it("fits a portrait image by height", () => {
    // 3:4 portrait into 489×360 → 270×360
    expect(fitWithin(3000, 4000, 489, 360)).toEqual({ width: 270, height: 360 });
  });

  it("never exceeds the cell in either dimension", () => {
    const cases: Array<[number, number]> = [[1, 1000], [1000, 1], [123, 457], [4032, 3024]];
    for (const [w, h] of cases) {
      const fit = fitWithin(w, h, 984, 360);
      expect(fit.width).toBeLessThanOrEqual(984);
      expect(fit.height).toBeLessThanOrEqual(360);
    }
  });

  it("an exact-ratio image fills the cell exactly (no visible letterbox)", () => {
    expect(fitWithin(1968, 720, 984, 360)).toEqual({ width: 984, height: 360 });
  });

  it("falls back to the full cell when dimensions are unknown", () => {
    expect(fitWithin(null, null, 984, 360)).toEqual({ width: 984, height: 360 });
    expect(fitWithin(0, 0, 984, 360)).toEqual({ width: 984, height: 360 });
  });
});

describe("photoRowHeight — equal side-by-side cells sized to the tallest fitted photo", () => {
  it("uses the tallest photo's fitted height when under the band", () => {
    // Two 4:3 landscapes at cellW 324 → 243 each → row 243
    const photos = [
      { width: 1600, height: 1200 },
      { width: 4000, height: 3000 },
    ];
    expect(photoRowHeight(photos, 324)).toBe(243);
  });

  it("caps at PHOTO_BAND_H when a portrait would exceed it", () => {
    const photos = [
      { width: 1600, height: 1200 },
      { width: 1200, height: 1600 }, // 3:4 at 324 wide → 432, over the band
    ];
    expect(photoRowHeight(photos, 324)).toBe(T.PHOTO_BAND_H);
  });

  it("falls back to the band when any photo has unknown dimensions", () => {
    const photos = [
      { width: 2400, height: 1000 },
      { width: null, height: null },
    ];
    expect(photoRowHeight(photos, 324)).toBe(T.PHOTO_BAND_H);
  });
});

describe("singlePhotoBandHeight — natural aspect, capped for the square card", () => {
  it("uses the image's natural ratio at content width when under the cap", () => {
    // 3:2 landscape at 984 wide → 656 tall
    expect(singlePhotoBandHeight(3000, 2000)).toBe(Math.min(656, T.PHOTO_MAX_H));
  });

  it("caps tall portraits at PHOTO_MAX_H so page 1 text stays legible after squaring", () => {
    expect(singlePhotoBandHeight(3000, 4000)).toBe(T.PHOTO_MAX_H);
  });

  it("falls back to the standard band when dimensions are unknown", () => {
    expect(singlePhotoBandHeight(null, null)).toBe(T.PHOTO_BAND_H);
    expect(singlePhotoBandHeight(0, 0)).toBe(T.PHOTO_BAND_H);
  });
});
