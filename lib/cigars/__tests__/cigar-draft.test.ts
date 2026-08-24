import { describe, it, expect } from "vitest";
import { EMPTY_CIGAR_DETAILS, type CigarDetails } from "@/lib/cigars/cigar-details";
import {
  serializeCigarDraft,
  parseCigarDraft,
  DRAFT_TTL_MS,
} from "@/lib/cigars/cigar-draft";

const NOW = 1_700_000_000_000;

const draft: CigarDetails = {
  ...EMPTY_CIGAR_DETAILS,
  brand:  "Padron",
  series: "1964 Anniversary",
};

describe("serializeCigarDraft", () => {
  it("returns null for an all-empty draft (nothing worth saving)", () => {
    expect(serializeCigarDraft(EMPTY_CIGAR_DETAILS, NOW)).toBeNull();
  });

  it("treats whitespace-only fields as empty", () => {
    expect(serializeCigarDraft({ ...EMPTY_CIGAR_DETAILS, brand: "   " }, NOW)).toBeNull();
  });

  it("serializes a draft with content, embedding the timestamp", () => {
    const json = serializeCigarDraft(draft, NOW);
    expect(json).not.toBeNull();
    const obj = JSON.parse(json!);
    expect(obj.savedAt).toBe(NOW);
    expect(obj.details.brand).toBe("Padron");
  });

  it("saves a draft whose only content is filler countries", () => {
    const json = serializeCigarDraft({ ...EMPTY_CIGAR_DETAILS, fillerCountries: ["Nicaragua"] }, NOW);
    expect(json).not.toBeNull();
  });
});

describe("parseCigarDraft", () => {
  it("round-trips a serialized draft within the TTL", () => {
    const json = serializeCigarDraft(draft, NOW)!;
    expect(parseCigarDraft(json, NOW + 1000)).toEqual(draft);
  });

  it("returns null past the TTL", () => {
    const json = serializeCigarDraft(draft, NOW)!;
    expect(parseCigarDraft(json, NOW + DRAFT_TTL_MS + 1)).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(parseCigarDraft("not json", NOW)).toBeNull();
    expect(parseCigarDraft("{}", NOW)).toBeNull();
    expect(parseCigarDraft(null, NOW)).toBeNull();
  });

  it("returns null when the shape is wrong (missing fields)", () => {
    const bad = JSON.stringify({ savedAt: NOW, details: { brand: "Oliva" } });
    expect(parseCigarDraft(bad, NOW)).toBeNull();
  });
});
