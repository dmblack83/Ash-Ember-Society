import { describe, test, expect } from "vitest";
import { postImages, MAX_POST_IMAGES } from "../post-images";

describe("postImages", () => {
  test("returns empty array when both columns are null", () => {
    expect(postImages(null, null)).toEqual([]);
  });

  test("falls back to legacy single image_url", () => {
    expect(postImages("https://x/a.jpg", null)).toEqual(["https://x/a.jpg"]);
  });

  test("prefers image_urls over legacy image_url", () => {
    expect(postImages("https://x/old.jpg", ["https://x/a.jpg", "https://x/b.jpg"]))
      .toEqual(["https://x/a.jpg", "https://x/b.jpg"]);
  });

  test("empty image_urls array falls back to legacy image_url", () => {
    expect(postImages("https://x/a.jpg", [])).toEqual(["https://x/a.jpg"]);
  });

  test("drops null-ish and blank entries", () => {
    expect(postImages(null, ["https://x/a.jpg", "", "  ", "https://x/b.jpg"]))
      .toEqual(["https://x/a.jpg", "https://x/b.jpg"]);
  });

  test("caps at MAX_POST_IMAGES", () => {
    const urls = ["1", "2", "3", "4", "5"].map((n) => `https://x/${n}.jpg`);
    expect(postImages(null, urls)).toHaveLength(MAX_POST_IMAGES);
    expect(postImages(null, urls)).toEqual(urls.slice(0, MAX_POST_IMAGES));
  });

  test("blank legacy image_url yields empty array", () => {
    expect(postImages("", null)).toEqual([]);
  });
});
