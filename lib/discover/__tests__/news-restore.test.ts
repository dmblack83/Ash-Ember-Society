import { describe, it, expect } from "vitest";
import {
  serializeNewsRestore,
  parseNewsRestore,
  NEWS_RESTORE_TTL_MS,
} from "@/lib/discover/news-restore";

const NOW = 1_700_000_000_000;

describe("news scroll restore", () => {
  it("round-trips within the TTL", () => {
    const json = serializeNewsRestore({ y: 2400, size: 3 }, NOW);
    expect(parseNewsRestore(json, NOW + 1000)).toEqual({ y: 2400, size: 3 });
  });

  it("returns null past the TTL", () => {
    const json = serializeNewsRestore({ y: 2400, size: 3 }, NOW);
    expect(parseNewsRestore(json, NOW + NEWS_RESTORE_TTL_MS + 1)).toBeNull();
  });

  it("rejects garbage, negatives, and zero sizes", () => {
    expect(parseNewsRestore(null, NOW)).toBeNull();
    expect(parseNewsRestore("nope", NOW)).toBeNull();
    expect(parseNewsRestore(JSON.stringify({ y: -5, size: 2, savedAt: NOW }), NOW)).toBeNull();
    expect(parseNewsRestore(JSON.stringify({ y: 10, size: 0, savedAt: NOW }), NOW)).toBeNull();
  });
});
