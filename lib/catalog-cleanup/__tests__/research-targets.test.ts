import { describe, it, expect } from "vitest";
import { batchFoldTargets, buildFoldTargets, buildNameBatches, findNearDupeSeries, trigramSimilarity } from "../research-targets";
import type { LineRow, VitolaRow } from "../types";

let n = 0;
const uid = () => `${(++n).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
const line = (brand: string, series: string | null, extra: Partial<LineRow> = {}): LineRow => ({ id: uid(), brand, series, community_added: false, approved: true, created_at: null, ...extra });
const vit = (l: LineRow, extra: Partial<VitolaRow> = {}): VitolaRow => ({
  id: uid(), line_id: l.id, brand: l.brand, series: l.series, name: null, format: "Robusto", ring_gauge: 50, length_inches: 5,
  wrapper: null, shade: null, wrapper_country: null, binder_country: null, filler_countries: null, usage_count: 0,
  community_added: false, approved: true, image_url: null, source_id: "seed", strength: null, created_at: null, ...extra,
});

describe("trigramSimilarity", () => {
  it("is 1 for equal strings after normalization and near 0 for unrelated", () => {
    expect(trigramSimilarity("Serie V", "serie  v")).toBe(1);
    expect(trigramSimilarity("Serie V", "Nicaragua")).toBeLessThan(0.2);
  });
});

describe("findNearDupeSeries", () => {
  it("pairs same-brand series above the threshold, skipping prefix pairs and other brands", () => {
    const a = line("Oliva", "Serie V Melanio"), b = line("Oliva", "Serie V Melanio Fino"), c = line("Oliva", "Serie V Melano"), d = line("Padron", "Serie V Melanio");
    const pairs = findNearDupeSeries([a, b, c, d]);
    const keys = pairs.map((p) => [p.a, p.b].sort().join("|"));
    expect(keys).toContain([a.id, c.id].sort().join("|"));
    expect(keys).not.toContain([a.id, b.id].sort().join("|"));
    expect(pairs.some((p) => p.a === d.id || p.b === d.id)).toBe(false);
    expect(pairs.every((p) => p.similarity >= 0.6)).toBe(true);
  });
});

describe("buildFoldTargets", () => {
  it("expands deferred fold candidates and near-dupes with both lines' vitolas and refs", () => {
    const p = line("Drew Estate", "Blackened"), s = line("Drew Estate", "Blackened S84"), x = line("Oliva", "Serie V Melanio"), y = line("Oliva", "Serie V Melano");
    const sv = vit(s), pv = vit(p), xv = vit(x), yv = vit(y);
    const deferred = [{ kind: "fold_line", flaggedWhy: "named remainder (possible sub-brand)", sourceLineId: s.id, targetLineId: p.id, label: "Drew Estate / Blackened S84 → Drew Estate / Blackened [S84]" }];
    const t = buildFoldTargets(deferred, [p, s, x, y], [sv, pv, xv, yv], { [sv.id]: 2 });
    const fold = t.find((f) => f.kind === "fold")!;
    expect(fold.id).toBe(`fold:${s.id}:${p.id}`);
    expect(fold.a).toMatchObject({ lineId: s.id, series: "Blackened S84", refs: 2, vitolas: [expect.objectContaining({ vitolaId: sv.id, refs: 2 })] });
    expect(fold.b).toMatchObject({ lineId: p.id, series: "Blackened", refs: 0 });
    expect(fold.remainder).toBe("S84");
    const nd = t.find((f) => f.kind === "near_dupe")!;
    expect([nd.a.lineId, nd.b.lineId]).toEqual([x.id, y.id].sort());
    expect(nd.id).toBe(`near_dupe:${[x.id, y.id].sort().join(":")}`);
  });
  it("computes the remainder from raw tokens on both sides (Sun Grown parent, Sun Grown Toro child -> Toro)", () => {
    const p = line("Brand", "Sun Grown"), s = line("Brand", "Sun Grown Toro");
    const t = buildFoldTargets([{ kind: "fold_line", flaggedWhy: "x", sourceLineId: s.id, targetLineId: p.id, label: "x" }], [p, s], [], {});
    expect(t[0].remainder).toBe("Toro");
  });
  it("ignores deferred entries that are not folds and folds whose lines no longer exist", () => {
    const p = line("A", "B");
    const t = buildFoldTargets([
      { kind: "merge_vitola", flaggedWhy: "unknown dims", sourceVitolaId: uid(), label: "x" },
      { kind: "fold_line", flaggedWhy: "community-added", sourceLineId: uid(), targetLineId: p.id, label: "gone" },
    ], [p], [vit(p)], {});
    expect(t).toEqual([]);
  });
});

describe("batchFoldTargets", () => {
  it("splits 90 targets at cap 40 into folds-01..03 of 40/40/10 in input order", () => {
    const l = line("A", "B");
    const targets = Array.from({ length: 90 }, (_, i) => ({ kind: "fold" as const, id: `t${i}`, a: { lineId: l.id, brand: "A", series: "B", communityAdded: false, refs: 0, vitolas: [] }, b: { lineId: l.id, brand: "A", series: "B", communityAdded: false, refs: 0, vitolas: [] }, flaggedWhy: "x" }));
    const batches = batchFoldTargets(targets, 40);
    expect(batches.map((b) => b.batch)).toEqual(["folds-01", "folds-02", "folds-03"]);
    expect(batches.map((b) => b.targets.length)).toEqual([40, 40, 10]);
    expect(batches.flatMap((b) => b.targets.map((t) => t.id))).toEqual(targets.map((t) => t.id));
  });
});

describe("buildNameBatches", () => {
  it("groups nameless vitolas by brand, biggest usage first, capped per batch, never splitting a brand across batches unless it alone exceeds the cap", () => {
    const big = line("Rocky Patel", "Edge"), mid = line("Oliva", "Serie G"), small = line("Zino", null);
    const vitolas = [
      ...Array.from({ length: 3 }, () => vit(big, { usage_count: 5 })),
      ...Array.from({ length: 2 }, () => vit(mid)),
      vit(small), vit(small, { name: "Already" }),
    ];
    const batches = buildNameBatches([big, mid, small], vitolas, {}, 4);
    expect(batches.map((b) => b.brands)).toEqual([["Rocky Patel"], ["Oliva", "Zino"]]);
    expect(batches[0].batch).toBe("names-01");
    expect(batches[1].vitolas).toHaveLength(3);
    expect(batches[1].vitolas.every((v) => v.name === null)).toBe(true);
    expect(batches[1].vitolas[0]).toMatchObject({ brand: "Oliva", series: "Serie G", format: "Robusto", ring: 50, length: 5 });
  });
  it("splits a single brand larger than the cap into consecutive batches", () => {
    const l = line("Arturo Fuente", "Hemingway");
    const batches = buildNameBatches([l], Array.from({ length: 9 }, () => vit(l)), {}, 4);
    expect(batches.map((b) => b.vitolas.length)).toEqual([4, 4, 1]);
    expect(batches.every((b) => b.brands[0] === "Arturo Fuente")).toBe(true);
  });
});
