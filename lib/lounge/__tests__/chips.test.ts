import { describe, it, expect } from "vitest";
import {
  parseChip,
  parseView,
  categorySlugForChip,
  chipForCategorySlug,
  roomRedirectQuery,
  feedParamsForView,
} from "../chips";

describe("parseChip", () => {
  it("returns a valid chip value unchanged", () => {
    expect(parseChip("burn-reports")).toBe("burn-reports");
    expect(parseChip("general")).toBe("general");
    expect(parseChip("feedback")).toBe("feedback");
  });
  it("falls back to all for missing or unknown values", () => {
    expect(parseChip(null)).toBe("all");
    expect(parseChip(undefined)).toBe("all");
    expect(parseChip("welcome")).toBe("all");
    expect(parseChip("nonsense")).toBe("all");
  });
});

describe("parseView", () => {
  it("non-feedback: accepts hot and mine, defaults to new", () => {
    expect(parseView("hot", false)).toBe("hot");
    expect(parseView("mine", false)).toBe("mine");
    expect(parseView(null, false)).toBe("new");
    expect(parseView("closed", false)).toBe("new");
  });
  it("feedback: accepts closed and mine, defaults to open", () => {
    expect(parseView("closed", true)).toBe("closed");
    expect(parseView("mine", true)).toBe("mine");
    expect(parseView(null, true)).toBe("open");
    expect(parseView("hot", true)).toBe("open");
  });
});

describe("category slug mapping", () => {
  it("maps chips to real category slugs", () => {
    expect(categorySlugForChip("all")).toBeNull();
    expect(categorySlugForChip("general")).toBe("general-discussion");
    expect(categorySlugForChip("burn-reports")).toBe("burn-reports");
    expect(categorySlugForChip("feedback")).toBe("product-feedback");
  });
  it("maps category slugs back to chips, folding welcome into general", () => {
    expect(chipForCategorySlug("general-discussion")).toBe("general");
    expect(chipForCategorySlug("burn-reports")).toBe("burn-reports");
    expect(chipForCategorySlug("product-feedback")).toBe("feedback");
    expect(chipForCategorySlug("welcome")).toBe("general");
    expect(chipForCategorySlug("lounge-rules")).toBeNull();
  });
});

describe("roomRedirectQuery", () => {
  it("builds the ?c= query for known room slugs", () => {
    expect(roomRedirectQuery("general-discussion")).toBe("?c=general");
    expect(roomRedirectQuery("welcome")).toBe("?c=general");
    expect(roomRedirectQuery("burn-reports")).toBe("?c=burn-reports");
    expect(roomRedirectQuery("product-feedback")).toBe("?c=feedback");
  });
  it("returns empty string for unknown slugs (plain /lounge)", () => {
    expect(roomRedirectQuery("speakeasy")).toBe("");
    expect(roomRedirectQuery("lounge-rules")).toBe("");
  });
});

describe("feedParamsForView", () => {
  it("maps views to fetcher filter + sort", () => {
    expect(feedParamsForView("new")).toEqual({ filter: "all", sort: "new" });
    expect(feedParamsForView("hot")).toEqual({ filter: "all", sort: "hot" });
    expect(feedParamsForView("mine")).toEqual({ filter: "mine", sort: "new" });
    expect(feedParamsForView("open")).toEqual({ filter: "open", sort: "new" });
    expect(feedParamsForView("closed")).toEqual({ filter: "closed", sort: "new" });
  });
});
