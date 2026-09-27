import { describe, it, expect } from "vitest";
import { collectTouched, buildReceipt, reverseSql, reverseWarnings } from "../receipt";
import { uuidLit } from "../sql";
import type { CatalogContext, LineRow, Op, VitolaRow } from "../types";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const V1 = "33333333-3333-4333-8333-333333333333";
const V2 = "44444444-4444-4444-8444-444444444444";
const H1 = "77777777-7777-4777-8777-777777777777";
const base = { reason: "r", generator: "t", reviewed: false };
const line = (id: string, brand: string, series: string | null): LineRow => ({ id, brand, series, community_added: false, approved: true });
const vit = (id: string, line_id: string, extra: Partial<VitolaRow> = {}): VitolaRow => ({
  id, line_id, brand: "Arturo Fuente", series: "Hemingway NT", name: null, format: "Robusto", ring_gauge: 50, length_inches: 5,
  wrapper: null, shade: null, wrapper_country: "Ecuador", binder_country: null, filler_countries: ["Dom. Rep"], usage_count: 2,
  community_added: false, approved: true, image_url: "https://img", source_id: "seed-9", ...extra,
});
const ctx = (): CatalogContext => ({
  lines: new Map([[A, line(A, "Arturo Fuente", "Hemingway")], [B, line(B, "Arturo Fuente", "Hemingway NT")]]),
  vitolas: new Map([[V1, vit(V1, B)], [V2, vit(V2, B, { source_id: "seed-10" })]]),
  refs: {},
});

describe("collectTouched", () => {
  it("includes fold children, both merge rows, and marks merge sources", () => {
    const ops: Op[] = [
      { ...base, type: "fold_line", sourceLineId: B, targetLineId: A, childFills: {} },
      { ...base, type: "merge_vitola", sourceVitolaId: V1, targetVitolaId: V2 },
    ];
    const t = collectTouched(ops, ctx());
    expect(t.lineIds.sort()).toEqual([A, B].sort());
    expect(t.vitolaIds.sort()).toEqual([V1, V2].sort());
    expect(t.mergeSourceIds).toEqual([V1]);
  });
});

describe("buildReceipt + reverseSql", () => {
  it("undoes a fold: re-inserts the line, repoints the children, clears fills", () => {
    const ops: Op[] = [{ ...base, type: "fold_line", sourceLineId: B, targetLineId: A, childFills: { [V1]: { shade: "Natural" } } }];
    const c = ctx();
    const r = buildReceipt({ runId: "run1", opsFile: "ops.json", ops, lines: [...c.lines.values()], vitolas: [...c.vitolas.values()], refs: [] });
    expect(r.committed).toBe(false);
    const sql = reverseSql(r);
    expect(sql).toEqual([
      `insert into cigar_lines (id, brand, series, community_added, approved) values (${uuidLit(B)}, 'Arturo Fuente', 'Hemingway NT', false, true) on conflict (id) do nothing;`,
      `update cigar_catalog set line_id = ${uuidLit(B)}, brand = 'Arturo Fuente', series = 'Hemingway NT' where id = ${uuidLit(V1)};`,
      `update cigar_catalog set line_id = ${uuidLit(B)}, brand = 'Arturo Fuente', series = 'Hemingway NT' where id = ${uuidLit(V2)};`,
      `update cigar_catalog set shade = null where id = ${uuidLit(V1)};`,
    ]);
  });
  it("undoes rename, update and write_name by restoring snapshot values", () => {
    const c = ctx();
    const ops: Op[] = [
      { ...base, type: "rename_line", lineId: A, brand: "AF", series: null },
      { ...base, type: "update_vitola", vitolaId: V1, fields: { format: "Toro", ring_gauge: 52 } },
      { ...base, type: "write_name", vitolaId: V2, name: "Classic" },
    ];
    const r = buildReceipt({ runId: "run2", opsFile: "o", ops, lines: [...c.lines.values()], vitolas: [...c.vitolas.values()], refs: [] });
    expect(reverseSql(r)).toEqual([
      `update cigar_catalog set name = null where id = ${uuidLit(V2)};`,
      `update cigar_catalog set format = 'Robusto', ring_gauge = 50 where id = ${uuidLit(V1)};`,
      `update cigar_lines set brand = 'Arturo Fuente', series = 'Hemingway' where id = ${uuidLit(A)};`,
    ]);
  });
  it("undoes a merge: re-inserts the source row, repoints recorded refs, restores the target's usage and image", () => {
    const c = ctx();
    const ops: Op[] = [{ ...base, type: "merge_vitola", sourceVitolaId: V1, targetVitolaId: V2 }];
    const r = buildReceipt({ runId: "run3", opsFile: "o", ops, lines: [], vitolas: [...c.vitolas.values()], refs: [{ table: "humidor_items", id: H1, cigar_id: V1 }] });
    const sql = reverseSql(r);
    expect(sql[0]).toBe(
      `insert into cigar_catalog (id, line_id, brand, series, name, format, ring_gauge, length_inches, wrapper, shade, wrapper_country, binder_country, filler_countries, usage_count, community_added, approved, image_url, source_id) values (${uuidLit(V1)}, ${uuidLit(B)}, 'Arturo Fuente', 'Hemingway NT', null, 'Robusto', 50, 5, null, null, 'Ecuador', null, array['Dom. Rep']::text[], 2, false, true, 'https://img', 'seed-9') on conflict (id) do nothing;`,
    );
    expect(sql[1]).toBe(`update humidor_items set cigar_id = ${uuidLit(V1)} where id = ${uuidLit(H1)} and cigar_id = ${uuidLit(V2)};`);
    expect(sql[2]).toBe(`update cigar_catalog set usage_count = 2, image_url = 'https://img' where id = ${uuidLit(V2)};`);
  });
  it("reverses ops in reverse order", () => {
    const c = ctx();
    const ops: Op[] = [
      { ...base, type: "write_name", vitolaId: V2, name: "Classic" },
      { ...base, type: "rename_line", lineId: A, brand: "AF", series: null },
    ];
    const r = buildReceipt({ runId: "run4", opsFile: "o", ops, lines: [...c.lines.values()], vitolas: [...c.vitolas.values()], refs: [] });
    expect(reverseSql(r)[0]).toContain("cigar_lines");
  });
  it("throws when a snapshot is missing for a touched row", () => {
    const ops: Op[] = [{ ...base, type: "write_name", vitolaId: V2, name: "Classic" }];
    expect(() => buildReceipt({ runId: "r", opsFile: "o", ops, lines: [], vitolas: [], refs: [] })).toThrow(/snapshot/);
  });
});

describe("reverseWarnings", () => {
  it("reports recorded refs that no longer point where the receipt expects", () => {
    const c = ctx();
    const ops: Op[] = [{ ...base, type: "merge_vitola", sourceVitolaId: V1, targetVitolaId: V2 }];
    const r = buildReceipt({ runId: "r", opsFile: "o", ops, lines: [], vitolas: [...c.vitolas.values()], refs: [{ table: "humidor_items", id: H1, cigar_id: V1 }] });
    expect(reverseWarnings(r, [{ table: "humidor_items", id: H1, cigar_id: V2 }])).toEqual([]);
    expect(reverseWarnings(r, [])).toEqual([`humidor_items ${H1} no longer points at ${V2}; it will not be repointed`]);
  });
});
