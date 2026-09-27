import { describe, it, expect } from "vitest";
import { lit, uuidLit, forwardSql } from "../sql";
import type { CatalogContext, LineRow, VitolaRow } from "../types";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const V1 = "33333333-3333-4333-8333-333333333333";
const V2 = "44444444-4444-4444-8444-444444444444";

const line = (id: string, brand: string, series: string | null): LineRow =>
  ({ id, brand, series, community_added: false, approved: true });
const vitola = (id: string, line_id: string, extra: Partial<VitolaRow> = {}): VitolaRow => ({
  id, line_id, brand: "B", series: "S", name: null, format: null, ring_gauge: null,
  length_inches: null, wrapper: null, shade: null, wrapper_country: null,
  binder_country: null, filler_countries: null, usage_count: 0,
  community_added: false, approved: true, image_url: null, source_id: null, ...extra,
});
const ctx = (): CatalogContext => ({
  lines: new Map([[A, line(A, "Arturo Fuente", "Hemingway")], [B, line(B, "Arturo Fuente", "Hemingway NT")]]),
  vitolas: new Map([[V1, vitola(V1, B)], [V2, vitola(V2, A)]]),
  refs: {},
});

describe("lit", () => {
  it("doubles single quotes and keeps backslashes verbatim", () => {
    expect(lit("L'Atelier")).toBe("'L''Atelier'");
    expect(lit("a\\b")).toBe("'a\\b'");
  });
  it("renders null, numbers, booleans and text arrays", () => {
    expect(lit(null)).toBe("null");
    expect(lit(50)).toBe("50");
    expect(lit(true)).toBe("true");
    expect(lit(["Nicaragua", "Dom. Rep"])).toBe("array['Nicaragua','Dom. Rep']::text[]");
    expect(lit([])).toBe("array[]::text[]");
  });
  it("rejects non-finite numbers", () => {
    expect(() => lit(Number.NaN)).toThrow(/finite/);
  });
});

describe("uuidLit", () => {
  it("renders a valid uuid and rejects anything else", () => {
    expect(uuidLit(A)).toBe(`'${A}'::uuid`);
    expect(() => uuidLit("not-a-uuid")).toThrow(/uuid/);
    expect(() => uuidLit(`${A}' or 1=1`)).toThrow(/uuid/);
  });
});

describe("forwardSql", () => {
  it("fold_line repoints children, fills null-only, deletes the source", () => {
    const sql = forwardSql(
      { type: "fold_line", sourceLineId: B, targetLineId: A, childFills: { [V1]: { shade: "Natural" } },
        reason: "r", generator: "t", reviewed: false },
      ctx(),
    );
    expect(sql).toEqual([
      `update cigar_catalog set line_id = ${uuidLit(A)}, brand = 'Arturo Fuente', series = 'Hemingway' where line_id = ${uuidLit(B)};`,
      `update cigar_catalog set shade = coalesce(shade, 'Natural') where id = ${uuidLit(V1)};`,
      `delete from cigar_lines where id = ${uuidLit(B)};`,
    ]);
  });
  it("fold_line throws when the target line is unknown", () => {
    expect(() => forwardSql(
      { type: "fold_line", sourceLineId: B, targetLineId: V1, childFills: {}, reason: "r", generator: "t", reviewed: false },
      ctx(),
    )).toThrow(/target line/);
  });
  it("rename_line updates brand and series (null series allowed)", () => {
    expect(forwardSql({ type: "rename_line", lineId: A, brand: "Padron", series: null, reason: "r", generator: "t", reviewed: false }, ctx()))
      .toEqual([`update cigar_lines set brand = 'Padron', series = null where id = ${uuidLit(A)};`]);
  });
  it("update_vitola sets only the given fields in key order", () => {
    expect(forwardSql({ type: "update_vitola", vitolaId: V1, fields: { format: "Robusto", name: "Best Seller" }, reason: "r", generator: "t", reviewed: false }, ctx()))
      .toEqual([`update cigar_catalog set name = 'Best Seller', format = 'Robusto' where id = ${uuidLit(V1)};`]);
  });
  it("update_vitola with no fields throws", () => {
    expect(() => forwardSql({ type: "update_vitola", vitolaId: V1, fields: {}, reason: "r", generator: "t", reviewed: false }, ctx())).toThrow(/no fields/);
  });
  it("merge_vitola calls the RPC", () => {
    expect(forwardSql({ type: "merge_vitola", sourceVitolaId: V1, targetVitolaId: V2, reason: "r", generator: "t", reviewed: false }, ctx()))
      .toEqual([`select merge_catalog_vitolas(${uuidLit(V1)}, ${uuidLit(V2)});`]);
  });
  it("write_name only fills a null name", () => {
    expect(forwardSql({ type: "write_name", vitolaId: V1, name: "Short Story", reason: "r", generator: "t", reviewed: false }, ctx()))
      .toEqual([`update cigar_catalog set name = 'Short Story' where id = ${uuidLit(V1)} and name is null;`]);
  });
});
