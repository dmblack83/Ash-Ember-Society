import { describe, expect, test } from "vitest";
import { rowsToThirdPhotoUrls } from "../burn-report-page-fetchers";

/* ------------------------------------------------------------------
   rowsToThirdPhotoUrls — maps burn_report_thirds rows to the fixed
   [first, second, final] tuple the edit wizard threads into
   PerThirdSheet so a saved per-third photo is visible while editing.
   ------------------------------------------------------------------ */

describe("rowsToThirdPhotoUrls", () => {
  test("maps each third's photo_url to its tuple slot", () => {
    const result = rowsToThirdPhotoUrls([
      { third_index: 1, photo_url: "https://cdn.example/first.jpg" },
      { third_index: 2, photo_url: null },
      { third_index: 3, photo_url: "https://cdn.example/final.jpg" },
    ]);

    expect(result).toEqual([
      "https://cdn.example/first.jpg",
      null,
      "https://cdn.example/final.jpg",
    ]);
  });

  test("pads missing thirds with null", () => {
    const result = rowsToThirdPhotoUrls([
      { third_index: 2, photo_url: "https://cdn.example/mid.jpg" },
    ]);

    expect(result).toEqual([null, "https://cdn.example/mid.jpg", null]);
  });

  test("ignores out-of-range third_index values", () => {
    const result = rowsToThirdPhotoUrls([
      { third_index: 0, photo_url: "https://cdn.example/bad.jpg" },
      { third_index: 4, photo_url: "https://cdn.example/bad.jpg" },
    ]);

    expect(result).toEqual([null, null, null]);
  });

  test("returns all nulls for a report with no thirds rows", () => {
    expect(rowsToThirdPhotoUrls([])).toEqual([null, null, null]);
  });
});
