import { describe, it, expect } from "vitest";
import { groupMatchesByLine } from "../group-matches";
import type { CatalogResult } from "@/lib/data/cigar-fetchers";

/* Minimal-but-complete CatalogResult fixtures — only id/brand/series
   vary across tests, the rest are dummy filler. */
function mk(id: string, brand: string | null, series: string | null): CatalogResult {
  return {
    id,
    brand,
    series,
    name: null,
    format: null,
    ring_gauge: null,
    length_inches: null,
    wrapper: null,
    wrapper_country: null,
    shade: null,
    usage_count: 0,
    image_url: null,
  };
}

describe("groupMatchesByLine", () => {
  it("returns an empty array for empty input", () => {
    expect(groupMatchesByLine([])).toEqual([]);
  });

  it("groups matches sharing (brand, series) into one line", () => {
    const a1 = mk("a1", "Arturo Fuente", "Hemingway");
    const a2 = mk("a2", "Arturo Fuente", "Hemingway");
    const groups = groupMatchesByLine([a1, a2]);
    expect(groups).toHaveLength(1);
    expect(groups[0].brand).toBe("Arturo Fuente");
    expect(groups[0].series).toBe("Hemingway");
    expect(groups[0].children).toEqual([a1, a2]);
  });

  it("treats null series as its own group, distinct from a real series", () => {
    const withSeries = mk("a1", "Padron", "1964 Anniversary");
    const noSeries1  = mk("a2", "Padron", null);
    const noSeries2  = mk("a3", "Padron", null);
    const groups = groupMatchesByLine([withSeries, noSeries1, noSeries2]);
    expect(groups).toHaveLength(2);
    expect(groups[0].series).toBe("1964 Anniversary");
    expect(groups[1].series).toBeNull();
    expect(groups[1].children).toEqual([noSeries1, noSeries2]);
  });

  it("preserves first-seen order of lines across interleaved matches", () => {
    const a = mk("a", "Arturo Fuente", "Hemingway");
    const b = mk("b", "Padron", "1964 Anniversary");
    const a2 = mk("a2", "Arturo Fuente", "Hemingway");
    const groups = groupMatchesByLine([a, b, a2]);
    expect(groups.map((g) => g.brand)).toEqual(["Arturo Fuente", "Padron"]);
  });

  it("keeps children in original score order within a group", () => {
    const best  = mk("best", "Padron", "1964 Anniversary");
    const other = mk("other", "Arturo Fuente", "Hemingway");
    const worst = mk("worst", "Padron", "1964 Anniversary");
    const groups = groupMatchesByLine([best, other, worst]);
    const padron = groups.find((g) => g.brand === "Padron")!;
    expect(padron.children.map((c) => c.id)).toEqual(["best", "worst"]);
  });

  it("sets topScoreIndex to the group's first-seen index in the original ranking", () => {
    const a = mk("a", "Arturo Fuente", "Hemingway");
    const b = mk("b", "Padron", "1964 Anniversary");
    const a2 = mk("a2", "Arturo Fuente", "Hemingway");
    const groups = groupMatchesByLine([a, b, a2]);
    expect(groups[0].topScoreIndex).toBe(0); // Arturo Fuente first appears at index 0
    expect(groups[1].topScoreIndex).toBe(1); // Padron first appears at index 1
  });

  it("puts each distinct brand+series into its own group, one child each", () => {
    const groups = groupMatchesByLine([
      mk("1", "Brand A", "Series A"),
      mk("2", "Brand B", "Series B"),
      mk("3", "Brand C", null),
    ]);
    expect(groups).toHaveLength(3);
    groups.forEach((g) => expect(g.children).toHaveLength(1));
  });
});
