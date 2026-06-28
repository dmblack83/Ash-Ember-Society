import { describe, it, expect } from "vitest";
import {
  tokenizeSearch,
  escapeLike,
  toLikePattern,
  MAX_SEARCH_TOKENS,
} from "../cigar-search-query";

describe("tokenizeSearch", () => {
  it("splits on whitespace and lowercases", () => {
    expect(tokenizeSearch("Padron 1926 35")).toEqual(["padron", "1926", "35"]);
  });

  it("collapses runs of whitespace and trims", () => {
    expect(tokenizeSearch("  maduro   toro ")).toEqual(["maduro", "toro"]);
  });

  it("returns [] for blank input", () => {
    expect(tokenizeSearch("   ")).toEqual([]);
  });

  it("de-duplicates repeated words", () => {
    expect(tokenizeSearch("padron padron 1926")).toEqual(["padron", "1926"]);
  });

  it("caps the number of tokens at MAX_SEARCH_TOKENS", () => {
    const input = "a b c d e f g h";
    expect(tokenizeSearch(input)).toHaveLength(MAX_SEARCH_TOKENS);
  });

  it("preserves numeric tokens", () => {
    expect(tokenizeSearch("maduro 50")).toEqual(["maduro", "50"]);
  });
});

describe("escapeLike", () => {
  it("escapes percent signs", () => {
    expect(escapeLike("50%")).toBe("50\\%");
  });

  it("escapes underscores", () => {
    expect(escapeLike("a_b")).toBe("a\\_b");
  });

  it("escapes backslashes first", () => {
    expect(escapeLike("a\\b")).toBe("a\\\\b");
  });
});

describe("toLikePattern", () => {
  it("wraps an escaped token in wildcards", () => {
    expect(toLikePattern("toro")).toBe("%toro%");
  });

  it("wraps an escaped wildcard token literally", () => {
    expect(toLikePattern("50%")).toBe("%50\\%%");
  });
});
