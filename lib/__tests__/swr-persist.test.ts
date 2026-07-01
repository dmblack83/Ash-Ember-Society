import { describe, expect, it } from "vitest";

import {
  familyForKey,
  packEntries,
  unpackBlob,
  stripPerUserEntries,
  CACHE_BLOB_VERSION,
} from "@/lib/swr-persist";

/* SWR serializes tuple keys as @"family","arg1", — mirror that here. */
const k = (family: string, ...args: string[]) =>
  `@"${family}",${args.map((a) => `"${a}"`).join(",")},`;

describe("familyForKey", () => {
  it("matches plain and infinite keys by quoted family token", () => {
    expect(familyForKey(k("humidor-items", "u1"))?.family).toBe("humidor-items");
    expect(familyForKey(`$inf$@"news-page",0,`)?.family).toBe("news-page");
  });

  it("does not confuse cigar with cigar-search", () => {
    expect(familyForKey(k("cigar-search", "q"))?.family).toBe("cigar-search");
    expect(familyForKey(k("cigar", "id"))?.family).toBe("cigar");
  });

  it("returns null for non-allowlisted families", () => {
    expect(familyForKey(k("notifications", "u1"))).toBeNull();
    expect(familyForKey("some-random-string")).toBeNull();
  });
});

describe("packEntries", () => {
  const now = 1_000_000;

  it("keeps only allowlisted entries that hold data and no error", () => {
    const blob = packEntries(
      [
        [k("humidor-items", "u1"), { data: [{ id: 1 }] }],
        [k("humidor-items", "u2"), { data: undefined }],
        [k("wishlist", "u1"),      { data: [], error: new Error("boom") }],
        [k("notifications", "u1"), { data: [1] }],
      ],
      { budgetBytes: 100_000, ownerId: "u1", now },
    );

    expect(blob.entries).toHaveLength(1);
    expect(blob.entries[0][0]).toBe(k("humidor-items", "u1"));
    expect(blob.entries[0][1]).toEqual([{ id: 1 }]);
    expect(blob.ownerId).toBe("u1");
    expect(blob.savedAt).toBe(now);
    expect(blob.v).toBe(CACHE_BLOB_VERSION);
  });

  it("skips per-user families when no owner is known", () => {
    const blob = packEntries(
      [
        [k("humidor-items", "u1"), { data: [1] }],
        [k("news-latest"),         { data: [2] }],
      ],
      { budgetBytes: 100_000, ownerId: null, now },
    );
    expect(blob.entries.map(([key]) => key)).toEqual([k("news-latest")]);
  });

  it("stops adding entries once the byte budget is exceeded, in priority order", () => {
    const big = "x".repeat(600);
    const blob = packEntries(
      [
        /* lower priority than humidor-items, listed first on purpose */
        [k("news-page"),           { data: big }],
        [k("humidor-items", "u1"), { data: big }],
      ],
      { budgetBytes: 700, ownerId: "u1", now },
    );
    expect(blob.entries.map(([key]) => key)).toEqual([k("humidor-items", "u1")]);
  });
});

describe("unpackBlob", () => {
  const now = 10_000_000;
  const fresh = JSON.stringify({
    v: CACHE_BLOB_VERSION,
    ownerId: "u1",
    savedAt: now - 1000,
    entries: [[k("wishlist", "u1"), [{ id: "w" }]]],
  });

  it("restores a fresh blob", () => {
    const out = unpackBlob(fresh, { maxAgeMs: 60_000, now });
    expect(out?.ownerId).toBe("u1");
    expect(out?.entries).toHaveLength(1);
  });

  it("rejects null, expired, malformed, and wrong-version blobs", () => {
    expect(unpackBlob(null, { maxAgeMs: 60_000, now })).toBeNull();
    expect(unpackBlob(fresh, { maxAgeMs: 500, now })).toBeNull();
    expect(unpackBlob("not json", { maxAgeMs: 60_000, now })).toBeNull();
    expect(
      unpackBlob(JSON.stringify({ v: -1, entries: [] }), { maxAgeMs: 60_000, now }),
    ).toBeNull();
  });
});

describe("stripPerUserEntries", () => {
  it("removes per-user families and keeps public ones", () => {
    const map = new Map<string, unknown>([
      [k("humidor-items", "u1"), { data: [1] }],
      [k("news-latest"),         { data: [2] }],
      ["unrelated-key",          { data: [3] }],
    ]);
    stripPerUserEntries(map);
    expect(map.has(k("humidor-items", "u1"))).toBe(false);
    expect(map.has(k("news-latest"))).toBe(true);
    expect(map.has("unrelated-key")).toBe(true);
  });
});
