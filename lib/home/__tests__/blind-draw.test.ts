import { describe, test, expect } from "vitest";
import { drawPool, isDrawEligible, pickDraw, type DrawItem } from "../blind-draw";

function item(id: string, cigarId: string, quantity = 1): DrawItem {
  return { id, cigar_id: cigarId, quantity };
}

describe("drawPool", () => {
  test("dedupes by cigar_id keeping one entry per unique cigar", () => {
    const pool = drawPool([item("a", "c1"), item("b", "c1"), item("c", "c2")]);
    expect(pool).toHaveLength(2);
    expect(pool.map((p) => p.cigar_id).sort()).toEqual(["c1", "c2"]);
  });

  test("filters out zero-quantity items", () => {
    const pool = drawPool([item("a", "c1", 0), item("b", "c2", 3)]);
    expect(pool).toHaveLength(1);
    expect(pool[0].cigar_id).toBe("c2");
  });

  test("a cigar whose only rows are zero-quantity is not in the pool", () => {
    const pool = drawPool([item("a", "c1", 0), item("b", "c1", 2)]);
    expect(pool).toHaveLength(1);
    expect(pool[0].id).toBe("b");
  });

  test("empty input yields empty pool", () => {
    expect(drawPool([])).toEqual([]);
  });
});

describe("isDrawEligible", () => {
  test("requires more than 1 unique cigar", () => {
    expect(isDrawEligible([])).toBe(false);
    expect(isDrawEligible([item("a", "c1")])).toBe(false);
    expect(isDrawEligible([item("a", "c1"), item("b", "c2")])).toBe(true);
  });
});

describe("pickDraw", () => {
  const pool = [item("a", "c1"), item("b", "c2"), item("c", "c3")];

  test("uses the rng to pick uniformly", () => {
    expect(pickDraw(pool, undefined, () => 0)?.id).toBe("a");
    expect(pickDraw(pool, undefined, () => 0.99)?.id).toBe("c");
  });

  test("excludes the previous pick so a redraw always changes", () => {
    for (let i = 0; i < 20; i++) {
      const next = pickDraw(pool, "b");
      expect(next?.id).not.toBe("b");
    }
  });

  test("returns null for an empty pool", () => {
    expect(pickDraw([], undefined)).toBeNull();
  });

  test("a two-item pool with exclusion returns the other item", () => {
    const two = [item("a", "c1"), item("b", "c2")];
    expect(pickDraw(two, "a")?.id).toBe("b");
  });
});
