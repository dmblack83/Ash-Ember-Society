import { describe, it, expect } from "vitest";
import {
  serializeCatalogRestore,
  parseCatalogRestore,
  CATALOG_RESTORE_TTL_MS,
} from "@/lib/cigars/catalog-restore";

const NOW = 1_700_000_000_000;

describe("catalog list-state restore", () => {
  it("round-trips a search state within the TTL", () => {
    const state = { query: "maduro", brand: null, brandsShown: 20, size: 2, y: 1480 };
    const json = serializeCatalogRestore(state, NOW);
    expect(parseCatalogRestore(json, NOW + 1000)).toEqual(state);
  });

  it("round-trips a brand drill-down state", () => {
    const state = { query: "", brand: "Padrón", brandsShown: 40, size: 3, y: 900 };
    const json = serializeCatalogRestore(state, NOW);
    expect(parseCatalogRestore(json, NOW + 1000)).toEqual(state);
  });

  it("returns null past the TTL", () => {
    const json = serializeCatalogRestore(
      { query: "", brand: null, brandsShown: 20, size: 1, y: 0 },
      NOW,
    );
    expect(parseCatalogRestore(json, NOW + CATALOG_RESTORE_TTL_MS + 1)).toBeNull();
  });

  it("rejects garbage, negatives, and invalid counts", () => {
    expect(parseCatalogRestore(null, NOW)).toBeNull();
    expect(parseCatalogRestore("nope", NOW)).toBeNull();
    expect(parseCatalogRestore(
      JSON.stringify({ query: "x", brand: null, brandsShown: 0, size: 1, y: 0, savedAt: NOW }),
      NOW,
    )).toBeNull();
    expect(parseCatalogRestore(
      JSON.stringify({ query: "x", brand: 42, brandsShown: 20, size: 1, y: 0, savedAt: NOW }),
      NOW,
    )).toBeNull();
    expect(parseCatalogRestore(
      JSON.stringify({ query: "x", brand: null, brandsShown: 20, size: 1, y: -1, savedAt: NOW }),
      NOW,
    )).toBeNull();
  });
});
