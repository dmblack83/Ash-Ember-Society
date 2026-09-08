import { describe, expect, test } from "vitest";
import {
  emptySaveForm,
  setPurchaseDate,
  setAgingStart,
  defaultAgingTarget,
} from "../add-flow-state";

const TODAY = "2026-09-07";

describe("defaultAgingTarget", () => {
  test("is today plus 14 days (the 2 Weeks preset)", () => {
    expect(defaultAgingTarget(TODAY)).toBe("2026-09-21");
  });

  test("crosses month boundaries correctly", () => {
    expect(defaultAgingTarget("2026-09-20")).toBe("2026-10-04");
  });

  test("crosses year boundaries correctly", () => {
    expect(defaultAgingTarget("2026-12-25")).toBe("2027-01-08");
  });
});

describe("emptySaveForm", () => {
  test("defaults every field for a fresh sheet open", () => {
    expect(emptySaveForm(TODAY)).toEqual({
      quantity:     1,
      purchaseDate: TODAY,
      priceStr:     "",
      source:       "",
      agingStart:   TODAY,
      /* Saving without ever expanding purchase details must produce
         what today's always-mounted AgingTargetSelect produces: the
         2 Weeks preset date, not null (spec: "saving collapsed must
         produce exactly what today's form produces"). */
      agingTarget:  "2026-09-21",
      notes:        "",
      agingSynced:  true,
    });
  });
});

describe("setPurchaseDate", () => {
  test("moves agingStart along while synced", () => {
    const start = emptySaveForm(TODAY);
    const next = setPurchaseDate(start, "2026-09-10");
    expect(next.purchaseDate).toBe("2026-09-10");
    expect(next.agingStart).toBe("2026-09-10");
    expect(next.agingSynced).toBe(true);
  });

  test("leaves agingStart alone once sync is broken", () => {
    const start = emptySaveForm(TODAY);
    const unsynced = setAgingStart(start, "2026-09-08");
    const next = setPurchaseDate(unsynced, "2026-09-10");
    expect(next.purchaseDate).toBe("2026-09-10");
    expect(next.agingStart).toBe("2026-09-08");
    expect(next.agingSynced).toBe(false);
  });

  test("does not mutate the original state object", () => {
    const start = emptySaveForm(TODAY);
    setPurchaseDate(start, "2026-09-10");
    expect(start.purchaseDate).toBe(TODAY);
    expect(start.agingStart).toBe(TODAY);
  });
});

describe("setAgingStart", () => {
  test("breaks the purchase-date sync", () => {
    const start = emptySaveForm(TODAY);
    const next = setAgingStart(start, "2026-09-08");
    expect(next.agingStart).toBe("2026-09-08");
    expect(next.agingSynced).toBe(false);
    // purchaseDate is untouched by editing agingStart directly.
    expect(next.purchaseDate).toBe(TODAY);
  });

  test("does not mutate the original state object", () => {
    const start = emptySaveForm(TODAY);
    setAgingStart(start, "2026-09-08");
    expect(start.agingStart).toBe(TODAY);
    expect(start.agingSynced).toBe(true);
  });
});
