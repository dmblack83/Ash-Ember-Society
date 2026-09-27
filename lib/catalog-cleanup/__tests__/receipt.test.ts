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
const line = (id: string, brand: string, series: string | null): LineRow => ({ id, brand, series, community_added: false, approved: true, created_at: null });
const vit = (id: string, line_id: string, extra: Partial<VitolaRow> = {}): VitolaRow => ({
  id, line_id, brand: "Arturo Fuente", series: "Hemingway NT", name: null, format: "Robusto", ring_gauge: 50, length_inches: 5,
  wrapper: null, shade: null, wrapper_country: "Ecuador", binder_country: null, filler_countries: ["Dom. Rep"], usage_count: 2,
  community_added: false, approved: true, image_url: "https://img", source_id: "seed-9", strength: null, created_at: null, ...extra,
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
      `insert into cigar_lines (id, brand, series, community_added, approved, created_at) values (${uuidLit(B)}, 'Arturo Fuente', 'Hemingway NT', false, true, now()) on conflict (id) do nothing;`,
      `update cigar_catalog set line_id = ${uuidLit(B)}, brand = 'Arturo Fuente', series = 'Hemingway NT' where id = ${uuidLit(V1)};`,
      `update cigar_catalog set line_id = ${uuidLit(B)}, brand = 'Arturo Fuente', series = 'Hemingway NT' where id = ${uuidLit(V2)};`,
      `update cigar_catalog set shade = null where id = ${uuidLit(V1)} and shade is not distinct from 'Natural';`,
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
      `update cigar_catalog set name = null where id = ${uuidLit(V2)} and name is not distinct from 'Classic';`,
      `update cigar_catalog set format = 'Robusto', ring_gauge = 50 where id = ${uuidLit(V1)} and format is not distinct from 'Toro' and ring_gauge is not distinct from 52;`,
      `update cigar_lines set brand = 'Arturo Fuente', series = 'Hemingway' where id = ${uuidLit(A)} and brand is not distinct from 'AF' and series is not distinct from null;`,
    ]);
  });
  it("undoes a merge: re-inserts the source row, repoints recorded refs, restores the target's usage and image", () => {
    const c = ctx();
    const ops: Op[] = [{ ...base, type: "merge_vitola", sourceVitolaId: V1, targetVitolaId: V2 }];
    const r = buildReceipt({ runId: "run3", opsFile: "o", ops, lines: [], vitolas: [...c.vitolas.values()], refs: [{ table: "humidor_items", id: H1, cigar_id: V1 }] });
    const sql = reverseSql(r);
    expect(sql[0]).toBe(
      `insert into cigar_catalog (id, line_id, brand, series, name, format, ring_gauge, length_inches, wrapper, shade, wrapper_country, binder_country, filler_countries, usage_count, community_added, approved, image_url, source_id, strength, created_at) values (${uuidLit(V1)}, ${uuidLit(B)}, 'Arturo Fuente', 'Hemingway NT', null, 'Robusto', 50, 5, null, null, 'Ecuador', null, array['Dom. Rep']::text[], 2, false, true, 'https://img', 'seed-9', null, now()) on conflict (id) do nothing;`,
    );
    expect(sql[1]).toBe(`update humidor_items set cigar_id = ${uuidLit(V1)} where id = ${uuidLit(H1)} and cigar_id = ${uuidLit(V2)};`);
    expect(sql[2]).toBe(`update cigar_catalog set usage_count = 2, image_url = 'https://img' where id = ${uuidLit(V2)};`);
  });
  it("re-inserts folded lines before any vitola insert (fold + merge inside the folded line)", () => {
    const c = ctx();
    const ops: Op[] = [
      { ...base, type: "fold_line", sourceLineId: B, targetLineId: A, childFills: {} },
      { ...base, type: "merge_vitola", sourceVitolaId: V1, targetVitolaId: V2 },
    ];
    const r = buildReceipt({ runId: "run5", opsFile: "o", ops, lines: [...c.lines.values()], vitolas: [...c.vitolas.values()], refs: [] });
    const sql = reverseSql(r);
    expect(sql[0]).toMatch(new RegExp(`^insert into cigar_lines .*values \\(${uuidLit(B).replace(/[()]/g, "\\$&")}`));
    const lineIdx = sql.map((s, i) => (s.startsWith("insert into cigar_lines") ? i : -1)).filter((i) => i >= 0);
    const vitIdx = sql.map((s, i) => (s.startsWith("insert into cigar_catalog") ? i : -1)).filter((i) => i >= 0);
    expect(lineIdx).toHaveLength(1);
    expect(vitIdx.length).toBeGreaterThan(0);
    expect(Math.max(...lineIdx)).toBeLessThan(Math.min(...vitIdx));
  });
  it("re-inserts a folded line with its snapshot created_at when known", () => {
    const c = ctx();
    const withTs = { ...c.lines.get(B)!, created_at: "2026-09-06 10:00:00+00" };
    const ops: Op[] = [{ ...base, type: "fold_line", sourceLineId: B, targetLineId: A, childFills: {} }];
    const r = buildReceipt({ runId: "run6", opsFile: "o", ops, lines: [c.lines.get(A)!, withTs], vitolas: [...c.vitolas.values()], refs: [] });
    expect(reverseSql(r)[0]).toContain(`false, true, '2026-09-06 10:00:00+00') on conflict`);
  });
  it("guards every reverse update (update_vitola, write_name, childFills, rename) with is not distinct from the forward value", () => {
    const c = ctx();
    const ops: Op[] = [
      { ...base, type: "fold_line", sourceLineId: B, targetLineId: A, childFills: { [V1]: { shade: "Natural", wrapper: "Habano" } } },
      { ...base, type: "rename_line", lineId: A, brand: "AF", series: "H" },
      { ...base, type: "update_vitola", vitolaId: V1, fields: { filler_countries: ["Nicaragua"] } },
      { ...base, type: "write_name", vitolaId: V2, name: "Classic" },
    ];
    const r = buildReceipt({ runId: "run7", opsFile: "o", ops, lines: [...c.lines.values()], vitolas: [...c.vitolas.values()], refs: [] });
    const sql = reverseSql(r);
    expect(sql).toContain(`update cigar_catalog set shade = null where id = ${uuidLit(V1)} and shade is not distinct from 'Natural';`);
    expect(sql).toContain(`update cigar_catalog set wrapper = null where id = ${uuidLit(V1)} and wrapper is not distinct from 'Habano';`);
    expect(sql).toContain(`update cigar_catalog set filler_countries = array['Dom. Rep']::text[] where id = ${uuidLit(V1)} and filler_countries is not distinct from array['Nicaragua']::text[];`);
    expect(sql.find((q) => q.startsWith("update cigar_lines"))).toMatch(/and brand is not distinct from 'AF' and series is not distinct from 'H';$/);
    expect(sql.find((q) => q.includes("set name ="))).toMatch(/and name is not distinct from 'Classic';$/);
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
  it("throws when a fold child named in childFills has no snapshot", () => {
    const c = ctx();
    const ops: Op[] = [{ ...base, type: "fold_line", sourceLineId: B, targetLineId: A, childFills: { [V1]: { shade: "Natural" } } }];
    expect(() => buildReceipt({ runId: "r", opsFile: "o", ops, lines: [...c.lines.values()], vitolas: [], refs: [] })).toThrow(/snapshot for vitola/);
  });
  it("throws when a touched id from collectTouched has no snapshot", () => {
    const c = ctx();
    const ops: Op[] = [{ ...base, type: "fold_line", sourceLineId: B, targetLineId: A, childFills: {} }];
    const touched = collectTouched(ops, c);
    expect(touched.vitolaIds.sort()).toEqual([V1, V2].sort());
    expect(() => buildReceipt({ runId: "r", opsFile: "o", ops, lines: [...c.lines.values()], vitolas: [c.vitolas.get(V1)!], refs: [], touched })).toThrow(new RegExp(`snapshot for vitola ${V2}`));
    expect(() => buildReceipt({ runId: "r", opsFile: "o", ops, lines: [...c.lines.values()], vitolas: [...c.vitolas.values()], refs: [], touched })).not.toThrow();
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
