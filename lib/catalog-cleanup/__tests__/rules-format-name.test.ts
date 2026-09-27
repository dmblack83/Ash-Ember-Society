import { describe, it, expect } from "vitest";
import { generateFormatName, splitFormat } from "../rules-format-name";
import { FORMATS } from "../../cigar-taxonomy";
import type { VitolaRow } from "../types";

let n = 0;
const uid = () => `${(++n).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
const vit = (extra: Partial<VitolaRow>): VitolaRow => ({
  id: uid(), line_id: uid(), brand: "B", series: "S", name: null, format: null, ring_gauge: 50, length_inches: 5, wrapper: null, shade: null,
  wrapper_country: null, binder_country: null, filler_countries: null, usage_count: 0, community_added: false, approved: true, image_url: null, source_id: "seed", ...extra,
});

describe("splitFormat", () => {
  it("keeps the full label as the name and the longest contained canonical shape as the format", () => {
    expect(splitFormat("Best Seller Robusto", FORMATS)).toEqual({ name: "Best Seller Robusto", format: "Robusto" });
    expect(splitFormat("No. 4 petit corona", FORMATS)).toEqual({ name: "No. 4 petit corona", format: "Petit Corona" });
    expect(splitFormat("Double Corona Maduro", FORMATS)).toEqual({ name: "Double Corona Maduro", format: "Double Corona" });
  });
  it("matches whole words only, and returns null for canonical or unsplittable values", () => {
    expect(splitFormat("Coronas Especiales", FORMATS)).toBeNull();
    expect(splitFormat("Toro", FORMATS)).toBeNull();
    expect(splitFormat(" toro ", FORMATS)).toBeNull();
    expect(splitFormat("Short Story", FORMATS)).toBeNull();
    expect(splitFormat("Gordo", FORMATS)).toBeNull();
  });
  it("ignores canonical tokens of 3 letters or fewer", () => {
    expect(splitFormat("Toro XL", ["XL", ...FORMATS])).toEqual({ name: "Toro XL", format: "Toro" });
  });
});

describe("generateFormatName", () => {
  it("emits one update_vitola per splittable nameless row and counts the rest", () => {
    const a = vit({ format: "Best Seller Robusto" });
    const named = vit({ format: "Best Seller Robusto", name: "Already" });
    const canon = vit({ format: "Toro" });
    const nope = vit({ format: "Short Story" });
    const community = vit({ format: "Serie V Torpedo", community_added: true });
    const r = generateFormatName([a, named, canon, nope, community], FORMATS);
    expect(r.ops).toEqual([
      expect.objectContaining({ type: "update_vitola", vitolaId: a.id, fields: { name: "Best Seller Robusto", format: "Robusto" } }),
      expect.objectContaining({ type: "update_vitola", vitolaId: community.id, fields: { name: "Serie V Torpedo", format: "Torpedo" }, reason: expect.stringMatching(/community-added/) }),
    ]);
    expect(r.summary).toEqual({ candidates: 3, splittable: 2, untouched: 1, communityAdded: 1 });
  });
});
