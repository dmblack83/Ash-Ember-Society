import { describe, it, expect } from "vitest";
import { orderByIds } from "../lounge-fetchers";

describe("orderByIds", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("reorders rows to match the id list (hot RPC ranking)", () => {
    expect(orderByIds(rows, ["c", "a", "b"]).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("drops ids with no matching row", () => {
    expect(orderByIds(rows, ["b", "missing", "a"]).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("returns empty for empty ids", () => {
    expect(orderByIds(rows, [])).toEqual([]);
  });
});
