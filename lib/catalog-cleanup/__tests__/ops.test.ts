import { describe, it, expect } from "vitest";
import { validateOpsFile, validateVitolaFields, OpsValidationError } from "../ops";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const base = { reason: "why", generator: "test", reviewed: false };
const file = (ops: unknown[]) => ({ version: 1, generatedAt: "2026-09-26T00:00:00Z", generator: "test", ops });

describe("validateOpsFile", () => {
  it("accepts a valid file of every op type", () => {
    const f = validateOpsFile(file([
      { ...base, type: "fold_line", sourceLineId: A, targetLineId: B, childFills: { [A]: { shade: "Natural" } } },
      { ...base, type: "rename_line", lineId: A, brand: "Padron", series: null },
      { ...base, type: "update_vitola", vitolaId: A, fields: { ring_gauge: 50, filler_countries: ["Nicaragua"] } },
      { ...base, type: "merge_vitola", sourceVitolaId: A, targetVitolaId: B },
      { ...base, type: "write_name", vitolaId: A, name: "Short Story", confidence: "high", sourceUrl: "https://x" },
    ]));
    expect(f.ops).toHaveLength(5);
  });
  it("rejects wrong version, missing ops, unknown type", () => {
    expect(() => validateOpsFile({ version: 2, ops: [] })).toThrow(OpsValidationError);
    expect(() => validateOpsFile({ version: 1, generatedAt: "x", generator: "t" })).toThrow(/ops/);
    expect(() => validateOpsFile(file([{ ...base, type: "nuke" }]))).toThrow(/unknown op type/);
  });
  it("collects every error instead of stopping at the first", () => {
    try {
      validateOpsFile(file([
        { ...base, type: "merge_vitola", sourceVitolaId: "bad", targetVitolaId: A },
        { ...base, type: "write_name", vitolaId: A, name: "" },
      ]));
      throw new Error("did not throw");
    } catch (e) {
      const err = e as OpsValidationError;
      expect(err.errors).toHaveLength(2);
      expect(err.errors[0]).toMatch(/ops\[0\].sourceVitolaId/);
      expect(err.errors[1]).toMatch(/ops\[1\].name/);
    }
  });
  it("rejects a merge of a row into itself and a fold of a line into itself", () => {
    expect(() => validateOpsFile(file([{ ...base, type: "merge_vitola", sourceVitolaId: A, targetVitolaId: A }]))).toThrow(/same/);
    expect(() => validateOpsFile(file([{ ...base, type: "fold_line", sourceLineId: A, targetLineId: A, childFills: {} }]))).toThrow(/same/);
  });
  it("requires reason, generator and boolean reviewed on every op", () => {
    expect(() => validateOpsFile(file([{ type: "write_name", vitolaId: A, name: "x" }]))).toThrow(/reason/);
    expect(() => validateOpsFile(file([{ ...base, reviewed: "yes", type: "write_name", vitolaId: A, name: "x" }]))).toThrow(/reviewed/);
  });
});

describe("validateVitolaFields", () => {
  it("enforces the admin-route ranges and whitelist", () => {
    expect(validateVitolaFields({ ring_gauge: 19 }, "f")).toEqual(["f.ring_gauge must be 20-90 or null"]);
    expect(validateVitolaFields({ length_inches: 12.5 }, "f")).toEqual(["f.length_inches must be 0-12 or null"]);
    expect(validateVitolaFields({ name: "x".repeat(121) }, "f")).toEqual(["f.name must be a string of at most 120 chars or null"]);
    expect(validateVitolaFields({ brand: "nope" }, "f")).toEqual(["f.brand is not an editable vitola field"]);
    expect(validateVitolaFields({ filler_countries: ["a", 1] }, "f")).toEqual(["f.filler_countries must be a string array or null"]);
    expect(validateVitolaFields({ shade: null, wrapper: "Habano" }, "f")).toEqual([]);
  });
});
