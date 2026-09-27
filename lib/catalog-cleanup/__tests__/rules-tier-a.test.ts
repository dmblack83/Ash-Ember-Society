// lib/catalog-cleanup/__tests__/rules-tier-a.test.ts
import { describe, it, expect } from "vitest";
import { generateTierA, NOISE_FILL, norm } from "../rules-tier-a";
import { checkPreconditions } from "../preview";
import { buildContext } from "../catalog-read";
import { buildReceipt, collectTouched, reverseSql } from "../receipt";
import { SHADES, WRAPPERS } from "../../cigar-taxonomy";
import type { LineRow, VitolaRow } from "../types";

let n = 0;
const uid = () => `${(++n).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
const line = (brand: string, series: string | null, extra: Partial<LineRow> = {}): LineRow => ({ id: uid(), brand, series, community_added: false, approved: true, created_at: null, ...extra });
const vit = (l: LineRow, extra: Partial<VitolaRow> = {}): VitolaRow => ({
  id: uid(), line_id: l.id, brand: l.brand, series: l.series, name: null, format: "Robusto", ring_gauge: 50, length_inches: 5,
  wrapper: null, shade: null, wrapper_country: null, binder_country: null, filler_countries: null, usage_count: 0,
  community_added: false, approved: true, image_url: null, source_id: "seed", strength: null, ...extra,
});

describe("NOISE_FILL", () => {
  it("only maps onto names that exist in the taxonomy", () => {
    const shades = new Set(SHADES.map((s) => s.name)), wrappers = new Set(WRAPPERS.map((w) => w.name));
    for (const fill of Object.values(NOISE_FILL)) {
      if (fill.shade) expect(shades.has(fill.shade)).toBe(true);
      if (fill.wrapper) expect(wrappers.has(fill.wrapper)).toBe(true);
    }
    expect(NOISE_FILL.nt).toEqual({ shade: "Natural" });
    expect(NOISE_FILL.connecticut).toEqual({ wrapper: "Connecticut Shade" });
  });
});

describe("generateTierA", () => {
  it("R1: folds case/whitespace duplicate lines into the one with the most vitolas", () => {
    const a = line("Chateau Fuente", null), b = line("chateau fuente ", null);
    const vs = [vit(a), vit(a, { ring_gauge: 54 }), vit(b)];
    const r = generateTierA([a, b], vs, {});
    expect(r.ops).toEqual([expect.objectContaining({ type: "fold_line", sourceLineId: b.id, targetLineId: a.id, childFills: {} })]);
    expect(r.ops[0].reason).toMatch(/case\/whitespace/);
  });
  it("R2: folds a wrapper-noise suffix line and fills the child's null shade", () => {
    const p = line("Arturo Fuente", "Hemingway Best Seller"), x = line("Arturo Fuente", "Hemingway Best Seller NT");
    const kid = vit(x);
    const r = generateTierA([p, x], [vit(p), kid], {});
    expect(r.ops).toEqual([expect.objectContaining({ type: "fold_line", sourceLineId: x.id, targetLineId: p.id, childFills: { [kid.id]: { shade: "Natural" } } })]);
  });
  it("R2: treats 'Sun Grown' as one token and maps it to the Sun Grown shade", () => {
    const p = line("Oliva", "Serie G"), x = line("Oliva", "Serie G Sun Grown");
    const kid = vit(x);
    const r = generateTierA([p, x], [vit(p), kid], {});
    expect(r.ops[0]).toMatchObject({ childFills: { [kid.id]: { shade: "Sun Grown" } } });
  });
  it("R2: does not fill when the child already carries the same value, and defers on a conflicting value", () => {
    const p = line("AF", "Hemingway"), x = line("AF", "Hemingway Maduro"), y = line("AF", "Hemingway Oscuro");
    const same = vit(x, { shade: "Maduro" }), conflict = vit(y, { shade: "Maduro" });
    const r = generateTierA([p, x, y], [vit(p), same, conflict], {});
    expect(r.ops).toEqual([expect.objectContaining({ sourceLineId: x.id, childFills: {} })]);
    expect(r.deferred).toEqual([expect.objectContaining({ kind: "fold_line", sourceLineId: y.id, flaggedWhy: expect.stringMatching(/conflict/) })]);
  });
  it("R2: defers named remainders, community-added lines, and lines with real references", () => {
    const p = line("L'Atelier", "Imports"), sub = line("L'Atelier", "Imports La Mission");
    const c = line("Padron", "1964"), cc = line("Padron", "1964 Maduro", { community_added: true });
    const u = line("Oliva", "V"), ux = line("Oliva", "V Maduro");
    const uKid = vit(ux);
    const r = generateTierA([p, sub, c, cc, u, ux], [vit(p), vit(sub), vit(c), vit(cc), vit(u), uKid], { [uKid.id]: 1 });
    expect(r.ops).toEqual([]);
    expect(r.deferred.map((d) => d.flaggedWhy).sort()).toEqual(["community-added", "named remainder (possible sub-brand)", "real references 1"].sort());
  });
  it("R3: merges identical-composition vitolas within a line, keeping the highest usage, and never merges by name alone", () => {
    const l = line("Perdomo", "Habano Bourbon Barrel-Aged");
    const keep = vit(l, { name: "Maduro", usage_count: 3 }), dup = vit(l, { name: "Maduro", usage_count: 1 });
    const otherSize = vit(l, { name: "Maduro", ring_gauge: 54, length_inches: 6 });
    const r = generateTierA([l], [keep, dup, otherSize], {});
    expect(r.ops).toEqual([expect.objectContaining({ type: "merge_vitola", sourceVitolaId: dup.id, targetVitolaId: keep.id })]);
  });
  it("R3: defers a duplicate whose source has real references", () => {
    const l = line("X", "Y");
    const keep = vit(l), dup = vit(l);
    const r = generateTierA([l], [keep, dup], { [dup.id]: 2 });
    expect(r.ops).toEqual([]);
    expect(r.deferred[0]).toMatchObject({ kind: "merge_vitola", flaggedWhy: "real references 2" });
  });
  it("R3: a group with a community-added or unapproved row emits nothing and defers every would-be source", () => {
    const l = line("X", "Y");
    const keep = vit(l, { usage_count: 5 }), comm = vit(l, { community_added: true });
    const r = generateTierA([l], [keep, comm], {});
    expect(r.ops).toEqual([]);
    expect(r.deferred).toEqual([expect.objectContaining({ kind: "merge_vitola", flaggedWhy: "community-added or unapproved row in group", sourceVitolaId: comm.id, targetVitolaId: keep.id })]);
    const l2 = line("X", "Z");
    const a = vit(l2, { usage_count: 5, approved: false }), b = vit(l2);
    const r2 = generateTierA([l2], [a, b], {});
    expect(r2.ops).toEqual([]);
    expect(r2.deferred).toEqual([expect.objectContaining({ flaggedWhy: "community-added or unapproved row in group", sourceVitolaId: b.id, targetVitolaId: a.id })]);
  });
  it("R3: rows with unknown dims never merge; they are deferred only when another row shares their name/wrapper/shade", () => {
    const l = line("X", "Y");
    const a = vit(l, { name: "Robusto", ring_gauge: null, length_inches: null }), b = vit(l, { name: "Robusto", ring_gauge: null, length_inches: null });
    const r = generateTierA([l], [a, b], {});
    expect(r.ops).toEqual([]);
    expect(r.deferred.length).toBeGreaterThanOrEqual(1);
    for (const d of r.deferred) expect(d).toMatchObject({ kind: "merge_vitola", flaggedWhy: "unknown dims" });
    expect(r.deferred.every((d) => d.targetVitolaId === undefined)).toBe(true);
    const lone = generateTierA([l], [vit(l, { name: "Robusto", format: null }), vit(l, { name: "Toro" })], {});
    expect(lone.ops).toEqual([]);
    expect(lone.deferred).toEqual([]);
  });
  it("reports a summary", () => {
    const r = generateTierA([], [], {});
    expect(r.summary).toEqual({ caseDupeFolds: 0, noiseFolds: 0, vitolaMerges: 0, deferred: 0 });
  });
  it("R2 chained: shorter noise line folds first and the longer one resolves to the root with the full remainder, regardless of row order", () => {
    const root = line("Drew Estate", "Undercrown"), mid = line("Drew Estate", "Undercrown Connecticut"), deep = line("Drew Estate", "Undercrown Connecticut Maduro");
    const midKid = vit(mid), deepKid = vit(deep);
    for (const order of [[deep, mid, root], [root, mid, deep]]) {
      const r = generateTierA(order, [vit(root), midKid, deepKid], {});
      expect(r.ops.map((o) => o.type)).toEqual(["fold_line", "fold_line"]);
      expect(r.ops[0]).toMatchObject({ sourceLineId: mid.id, targetLineId: root.id, childFills: { [midKid.id]: { wrapper: "Connecticut Shade" } } });
      expect(r.ops[1]).toMatchObject({ sourceLineId: deep.id, targetLineId: root.id, childFills: { [deepKid.id]: { wrapper: "Connecticut Shade", shade: "Maduro" } } });
      expect(r.deferred).toEqual([]);
    }
  });
  it("R2 chained: a two-shade suffix is a conflict even when reached through a chain", () => {
    const root = line("X", "Base"), mid = line("X", "Base Maduro"), deep = line("X", "Base Maduro Natural");
    const r = generateTierA([deep, mid, root], [vit(root), vit(mid), vit(deep)], {});
    expect(r.ops).toHaveLength(1);
    expect(r.ops[0]).toMatchObject({ sourceLineId: mid.id });
    expect(r.deferred).toEqual([expect.objectContaining({ sourceLineId: deep.id, flaggedWhy: expect.stringMatching(/two shades/) })]);
  });
  it("R1 keep then R2: children folded in by R1 count toward the R2 gates and fills", () => {
    const parent = line("AF", "Hemingway"), keep = line("AF", "Hemingway Maduro"), dup = line("AF", "hemingway maduro", { community_added: true });
    const dupKid = vit(dup, { community_added: true });
    const r = generateTierA([parent, keep, dup], [vit(parent), vit(keep), dupKid], {});
    expect(r.ops).toEqual([expect.objectContaining({ type: "fold_line", sourceLineId: dup.id, targetLineId: keep.id })]);
    expect(r.deferred).toEqual([expect.objectContaining({ kind: "fold_line", sourceLineId: keep.id, flaggedWhy: "community-added" })]);
  });
  it("R1 keep then R2: a seeded, unreferenced R1 merge folds on with fills for every effective child", () => {
    const parent = line("AF", "Hemingway"), keep = line("AF", "Hemingway Maduro"), dup = line("AF", "Hemingway  Maduro");
    const keepKid = vit(keep), dupKid = vit(dup);
    const r = generateTierA([parent, keep, dup], [vit(parent), keepKid, dupKid], {});
    expect(r.ops).toHaveLength(2);
    expect(r.ops[1]).toMatchObject({ sourceLineId: keep.id, targetLineId: parent.id, childFills: { [keepKid.id]: { shade: "Maduro" }, [dupKid.id]: { shade: "Maduro" } } });
  });
  it("R2: wrapper tokens fill wrapper, and an existing conflicting wrapper defers", () => {
    const p = line("Oliva", "Serie O"), hab = line("Oliva", "Serie O Habano"), cam = line("Oliva", "Serie O Cameroon");
    const habKid = vit(hab), camKid = vit(cam, { wrapper: "Habano" });
    const r = generateTierA([p, hab, cam], [vit(p), habKid, camKid], {});
    expect(r.ops).toEqual([expect.objectContaining({ sourceLineId: hab.id, childFills: { [habKid.id]: { wrapper: "Habano" } } })]);
    expect(r.deferred).toEqual([expect.objectContaining({ sourceLineId: cam.id, flaggedWhy: expect.stringMatching(/conflicts with suffix cameroon/) })]);
  });
});

describe("norm", () => {
  it("lowercases, trims, collapses whitespace, and joins sun grown", () => {
    expect(norm("  Serie  G  Sun Grown ")).toBe("serie g sungrown");
    expect(norm(null)).toBe("");
  });
});

describe("generateTierA output passes checkPreconditions", () => {
  it("R1 keep then R2 with moved-in fills is accepted by the preview layer", () => {
    const parent = line("AF", "Hemingway"), keep = line("AF", "Hemingway Maduro"), dup = line("AF", "Hemingway  Maduro");
    const vitolas = [vit(parent), vit(keep), vit(dup)];
    const lines = [parent, keep, dup];
    const r = generateTierA(lines, vitolas, {});
    expect(r.ops).toHaveLength(2);
    expect(checkPreconditions(r.ops, buildContext(lines, vitolas, {}))).toEqual([]);
  });
  it("R1 duplicate line with two identical vitolas: one fold + one merge, accepted, and undo re-inserts the line before the vitola", () => {
    const keep = line("Padron", "1926"), dup = line("padron", "1926 ");
    const keepKids = [vit(keep, { ring_gauge: 40 }), vit(keep, { ring_gauge: 44 }), vit(keep, { ring_gauge: 48 })];
    const d1 = vit(dup, { usage_count: 5 }), d2 = vit(dup, { usage_count: 1 });
    const lines = [keep, dup], vitolas = [...keepKids, d1, d2];
    const r = generateTierA(lines, vitolas, {});
    expect(r.ops.map((o) => o.type)).toEqual(["fold_line", "merge_vitola"]);
    expect(r.ops[0]).toMatchObject({ sourceLineId: dup.id, targetLineId: keep.id });
    expect(r.ops[1]).toMatchObject({ sourceVitolaId: d2.id, targetVitolaId: d1.id });
    const ctx = buildContext(lines, vitolas, {});
    expect(checkPreconditions(r.ops, ctx)).toEqual([]);
    const touched = collectTouched(r.ops, ctx);
    const receipt = buildReceipt({
      runId: "t", opsFile: "o", ops: r.ops, refs: [], touched,
      lines: touched.lineIds.map((id) => ctx.lines.get(id)!), vitolas: touched.vitolaIds.map((id) => ctx.vitolas.get(id)!),
    });
    const sql = reverseSql(receipt);
    const lineInsert = sql.findIndex((q) => q.startsWith("insert into cigar_lines") && q.includes(dup.id));
    const vitInsert = sql.findIndex((q) => q.startsWith("insert into cigar_catalog") && q.includes(d2.id));
    expect(lineInsert).toBeGreaterThanOrEqual(0);
    expect(vitInsert).toBeGreaterThan(lineInsert);
  });
  it("chained R2 folds are accepted by the preview layer in either row order", () => {
    const root = line("Drew Estate", "Undercrown"), mid = line("Drew Estate", "Undercrown Connecticut"), deep = line("Drew Estate", "Undercrown Connecticut Maduro");
    const vitolas = [vit(root), vit(mid), vit(deep)];
    for (const lines of [[deep, mid, root], [root, mid, deep]]) {
      const r = generateTierA(lines, vitolas, {});
      expect(checkPreconditions(r.ops, buildContext(lines, vitolas, {}))).toEqual([]);
    }
  });
});
