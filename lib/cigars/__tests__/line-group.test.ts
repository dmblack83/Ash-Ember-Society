import { describe, expect, test } from "vitest";
import {
  sizeDims, sizeLabel, findMatchingSize, childToLine,
  cigarTitle, cigarDisplayName,
} from "@/lib/cigars/line-group";
import type { CatalogResult } from "@/lib/data/cigar-fetchers";

const child = (over: Partial<{ id: string; format: string | null; ring_gauge: number | null; length_inches: number | null }> = {}) => ({
  id: "c1", format: "Churchill", ring_gauge: 48, length_inches: 7, ...over,
});

describe("sizeDims / sizeLabel", () => {
  test("formats length × ring with fraction label", () => {
    expect(sizeDims(child({ length_inches: 7.25 }))).toBe('7 1/4" × 48');
  });
  test("ring only when length missing", () => {
    expect(sizeDims(child({ length_inches: null }))).toBe("48 ring");
  });
  test("length only when ring missing", () => {
    expect(sizeDims(child({ ring_gauge: null, length_inches: 5 }))).toBe('5"');
  });
  test("empty when both missing", () => {
    expect(sizeDims(child({ ring_gauge: null, length_inches: null }))).toBe("");
  });
  test("label joins format and dims", () => {
    expect(sizeLabel(child())).toBe('Churchill 7" × 48');
  });
  test("label prefers the vitola name over format", () => {
    expect(sizeLabel({ ...child(), name: "King B" })).toBe('King B 7" × 48');
  });
  test("label without format is dims only", () => {
    expect(sizeLabel(child({ format: null }))).toBe('7" × 48');
  });
  test("label with nothing is 'Original size'", () => {
    expect(sizeLabel(child({ format: null, ring_gauge: null, length_inches: null }))).toBe("Original size");
  });
});

describe("findMatchingSize", () => {
  const kids = [
    child({ id: "a", format: "Churchill", ring_gauge: 48, length_inches: 7.25 }),
    child({ id: "b", format: "Robusto",   ring_gauge: 50, length_inches: 5 }),
    child({ id: "c", format: null,        ring_gauge: null, length_inches: null }),
  ];
  test("exact match", () => {
    expect(findMatchingSize(kids, { format: "Churchill", ringGauge: 48, lengthInches: 7.25 })?.id).toBe("a");
  });
  test("format compares case-insensitively", () => {
    expect(findMatchingSize(kids, { format: "churchill ", ringGauge: 48, lengthInches: 7.25 })?.id).toBe("a");
  });
  test("length within 1/8 inch matches", () => {
    expect(findMatchingSize(kids, { format: "Churchill", ringGauge: 48, lengthInches: 7.375 })?.id).toBe("a");
  });
  test("length beyond 1/8 inch does not match", () => {
    expect(findMatchingSize(kids, { format: "Churchill", ringGauge: 48, lengthInches: 7.5 })).toBeNull();
  });
  test("ring must be equal", () => {
    expect(findMatchingSize(kids, { format: "Churchill", ringGauge: 50, lengthInches: 7.25 })).toBeNull();
  });
  test("all-null entered size matches an all-null child", () => {
    expect(findMatchingSize(kids, { format: "", ringGauge: null, lengthInches: null })?.id).toBe("c");
  });
  test("empty entered format does not match a named format", () => {
    expect(findMatchingSize([kids[0]], { format: "", ringGauge: 48, lengthInches: 7.25 })).toBeNull();
  });
});

describe("childToLine", () => {
  const cr: CatalogResult = {
    id: "x1", brand: "Padron", series: "1964", format: "Toro",
    ring_gauge: 52, length_inches: 6, wrapper: "Maduro",
    wrapper_country: "NI", shade: null, usage_count: 3, image_url: null,
  };
  test("maps a child row to an ungrouped line (sizeCount 0 = unknown)", () => {
    expect(childToLine(cr)).toEqual({
      brand: "Padron", series: "1964", wrapper: "Maduro", shade: null,
      sizeCount: 0, repId: "x1", imageUrl: null,
    });
  });
});

describe("cigarTitle / cigarDisplayName", () => {
  test("series is the title; name renders quoted after it", () => {
    const c = { series: "Chateau Fuente Sun Grown", name: "Queen B", format: "Torpedo" };
    expect(cigarTitle(c)).toBe("Chateau Fuente Sun Grown");
    expect(cigarDisplayName(c)).toBe('Chateau Fuente Sun Grown "Queen B"');
  });
  test("no series: the name IS the title, unquoted", () => {
    const c = { series: null, name: "Moroni's Trumpet", format: "Toro", brand: "Apostate Cigars" };
    expect(cigarTitle(c)).toBe("Moroni's Trumpet");
    expect(cigarDisplayName(c)).toBe("Moroni's Trumpet");
  });
  test("falls back name -> format -> brand", () => {
    expect(cigarTitle({ format: "Robusto" })).toBe("Robusto");
    expect(cigarTitle({ brand: "Padron" })).toBe("Padron");
    expect(cigarTitle({})).toBe("Cigar");
  });
  test("no name = title only", () => {
    expect(cigarDisplayName({ series: "1964" })).toBe("1964");
  });
});
