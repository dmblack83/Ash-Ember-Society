// lib/catalog-cleanup/__tests__/verify-folds.test.ts
import { describe, it, expect } from "vitest";
import { generateVerifyFolds, validateVerdictFile } from "../verify-folds";
import type { FoldTarget, LineSummary } from "../research-targets";
import type { LineRow, VitolaRow } from "../types";

let n = 0;
const uid = () => `${(++n).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
const line = (brand: string, series: string | null, extra: Partial<LineRow> = {}): LineRow => ({ id: uid(), brand, series, community_added: false, approved: true, created_at: null, ...extra });
const vit = (l: LineRow, extra: Partial<VitolaRow> = {}): VitolaRow => ({
  id: uid(), line_id: l.id, brand: l.brand, series: l.series, name: null, format: "Robusto", ring_gauge: 50, length_inches: 5, wrapper: null, shade: null,
  wrapper_country: null, binder_country: null, filler_countries: null, usage_count: 0, community_added: false, approved: true, image_url: null, source_id: "seed", strength: null, created_at: null, ...extra,
});
const sum = (l: LineRow, refs = 0, community = false): LineSummary => ({ lineId: l.id, brand: l.brand, series: l.series, communityAdded: community, refs, vitolas: [] });
const v = (model: string, targetId: string, answer: string, urls: string[] = ["https://x"]) => ({ model, batch: "b1", verdicts: [{ targetId, answer: answer as never, reason: `${model} says ${answer}`, urls }] });

describe("validateVerdictFile", () => {
  it("accepts a valid file and rejects bad answers, missing urls array, non-http(s) urls, and bad ids", () => {
    expect(validateVerdictFile(v("opus", "fold:a:b", "fold"), "f.json").verdicts).toHaveLength(1);
    expect(() => validateVerdictFile({ model: "opus", batch: "b", verdicts: [{ targetId: "x", answer: "maybe", reason: "r", urls: [] }] }, "f.json")).toThrow(/f\.json.*answer/);
    expect(() => validateVerdictFile({ model: "opus", batch: "b", verdicts: [{ targetId: "x", answer: "fold", reason: "r" }] }, "f.json")).toThrow(/urls/);
    expect(() => validateVerdictFile({ model: "opus", batch: "b", verdicts: [{ targetId: "x", answer: "fold", reason: "r", urls: ["not-a-url"] }] }, "f.json")).toThrow(/http\(s\)/);
    expect(() => validateVerdictFile({ model: "", batch: "b", verdicts: [] }, "f.json")).toThrow(/model/);
  });
});

describe("generateVerifyFolds", () => {
  it("emits a reviewed:false fold when two models agree with urls and the gates pass", () => {
    const p = line("Drew Estate", "Blackened"), s = line("Drew Estate", "Blackened S84");
    const t: FoldTarget = { kind: "fold", id: `fold:${s.id}:${p.id}`, a: sum(s), b: sum(p), remainder: "S84", flaggedWhy: "named remainder" };
    const r = generateVerifyFolds({ targets: [t], verdictFiles: [v("fable", t.id, "fold", ["https://drewestate.com/blackened"]), v("opus", t.id, "fold", ["https://retailer.example/blackened-s84"])], lines: [p, s], vitolas: [vit(p), vit(s)], refs: {} });
    expect(r.ops).toEqual([expect.objectContaining({ type: "fold_line", sourceLineId: s.id, targetLineId: p.id, reviewed: false, generator: "verify-folds", agreement: { modelA: "fable", modelB: "opus" } })]);
    expect((r.ops[0] as { evidence: { url: string }[] }).evidence.map((e) => e.url)).toEqual(["https://drewestate.com/blackened", "https://retailer.example/blackened-s84"]);
    expect(r.review).toEqual([]);
  });
  it("does not count two verdicts from the same model as agreement", () => {
    const p = line("A", "B"), s = line("A", "B C");
    const t: FoldTarget = { kind: "fold", id: `fold:${s.id}:${p.id}`, a: sum(s), b: sum(p), flaggedWhy: "x" };
    const r = generateVerifyFolds({ targets: [t], verdictFiles: [v("opus", t.id, "fold"), v("opus", t.id, "fold")], lines: [p, s], vitolas: [], refs: {} });
    expect(r.ops).toEqual([]);
    expect(r.review[0].why).toMatch(/only 1 model/);
  });
  it("collapses model name variants to the same family (so 'opus' and 'Claude Opus 5.5' count as one model)", () => {
    const p = line("A", "B"), s = line("A", "B C");
    const t: FoldTarget = { kind: "fold", id: `fold:${s.id}:${p.id}`, a: sum(s), b: sum(p), flaggedWhy: "x" };
    const r = generateVerifyFolds({ targets: [t], verdictFiles: [v("opus", t.id, "fold"), v("Claude Opus 5.5", t.id, "fold")], lines: [p, s], vitolas: [], refs: {} });
    expect(r.review[0].why).toMatch(/only 1 model/);
  });
  it("sends disagreement, unsure, and a verdict without urls to review", () => {
    const p = line("A", "B"), s = line("A", "B C");
    const t: FoldTarget = { kind: "fold", id: `fold:${s.id}:${p.id}`, a: sum(s), b: sum(p), flaggedWhy: "x" };
    expect(generateVerifyFolds({ targets: [t], verdictFiles: [v("fable", t.id, "fold"), v("opus", t.id, "keep")], lines: [p, s], vitolas: [], refs: {} }).review[0].why).toMatch(/disagree/);
    expect(generateVerifyFolds({ targets: [t], verdictFiles: [v("fable", t.id, "fold"), v("opus", t.id, "unsure")], lines: [p, s], vitolas: [], refs: {} }).review[0].why).toMatch(/unsure/);
    expect(generateVerifyFolds({ targets: [t], verdictFiles: [v("fable", t.id, "fold", []), v("opus", t.id, "fold")], lines: [p, s], vitolas: [], refs: {} }).review[0].why).toMatch(/no url/);
  });
  it("flags an answer that's not valid for the target's kind before checking agreement", () => {
    const p = line("A", "B"), s = line("A", "B C");
    const t: FoldTarget = { kind: "fold", id: `fold:${s.id}:${p.id}`, a: sum(s), b: sum(p), flaggedWhy: "x" };
    const r = generateVerifyFolds({ targets: [t], verdictFiles: [v("fable", t.id, "merge_a_into_b"), v("opus", t.id, "merge_a_into_b")], lines: [p, s], vitolas: [], refs: {} });
    expect(r.ops).toEqual([]);
    expect(r.review[0].why).toMatch(/not valid for a fold target/);
  });
  it("resolves keep when both say keep, and gates agreement on live seeded status + zero refs", () => {
    const p = line("A", "B"), s = line("A", "B C");
    const keepT: FoldTarget = { kind: "fold", id: `fold:${s.id}:${p.id}`, a: sum(s), b: sum(p), flaggedWhy: "x" };
    expect(generateVerifyFolds({ targets: [keepT], verdictFiles: [v("fable", keepT.id, "keep"), v("opus", keepT.id, "keep")], lines: [p, s], vitolas: [], refs: {} }).resolvedKeep).toEqual([keepT.id]);
    const unevidenced = generateVerifyFolds({ targets: [keepT], verdictFiles: [v("fable", keepT.id, "keep", []), v("opus", keepT.id, "keep", [])], lines: [p, s], vitolas: [], refs: {} });
    expect(unevidenced.resolvedKeep).toEqual([]);
    expect(unevidenced.review[0].why).toBe("a model cited no url");

    const refChild = vit(s);
    const refT: FoldTarget = { ...keepT };
    expect(generateVerifyFolds({ targets: [refT], verdictFiles: [v("fable", refT.id, "fold"), v("opus", refT.id, "fold")], lines: [p, s], vitolas: [refChild], refs: { [refChild.id]: 2 } }).review[0].why).toMatch(/real references/);

    const comChild = vit(s, { community_added: true });
    const comT: FoldTarget = { ...keepT };
    expect(generateVerifyFolds({ targets: [comT], verdictFiles: [v("fable", comT.id, "fold"), v("opus", comT.id, "fold")], lines: [p, s], vitolas: [comChild], refs: {} }).review[0].why).toMatch(/community/);
  });
  it("near_dupe: both models must agree on the direction; the op folds the named source into the other", () => {
    const x = line("Oliva", "Serie V Melanio"), y = line("Oliva", "Serie V Melano");
    const [a, b] = [x, y].sort((p, q) => p.id.localeCompare(q.id));
    const t: FoldTarget = { kind: "near_dupe", id: `near_dupe:${a.id}:${b.id}`, a: sum(a), b: sum(b), flaggedWhy: "trigram 80%" };
    const ok = generateVerifyFolds({ targets: [t], verdictFiles: [v("fable", t.id, "merge_b_into_a"), v("opus", t.id, "merge_b_into_a")], lines: [x, y], vitolas: [], refs: {} });
    expect(ok.ops[0]).toMatchObject({ type: "fold_line", sourceLineId: b.id, targetLineId: a.id });
    const dir = generateVerifyFolds({ targets: [t], verdictFiles: [v("fable", t.id, "merge_b_into_a"), v("opus", t.id, "merge_a_into_b")], lines: [x, y], vitolas: [], refs: {} });
    expect(dir.ops).toEqual([]);
    expect(dir.review[0].why).toMatch(/direction/);
  });
  it("skips targets whose lines no longer exist or whose series text changed", () => {
    const p = line("A", "B"), s = line("A", "B C");
    const t: FoldTarget = { kind: "fold", id: `fold:${s.id}:${p.id}`, a: sum(s), b: sum(p), flaggedWhy: "x" };
    const gone = generateVerifyFolds({ targets: [t], verdictFiles: [v("fable", t.id, "fold"), v("opus", t.id, "fold")], lines: [p], vitolas: [], refs: {} });
    expect(gone.ops).toEqual([]);
    expect(gone.skipped[0]).toMatch(/no longer exists/);
    const renamed = generateVerifyFolds({ targets: [t], verdictFiles: [v("fable", t.id, "fold"), v("opus", t.id, "fold")], lines: [p, { ...s, series: "B D" }], vitolas: [], refs: {} });
    expect(renamed.skipped[0]).toMatch(/series changed/);
  });
  it("applies Dave's decisions as reviewed ops, bypassing the gates but not existence", () => {
    const p = line("A", "B"), s = line("A", "B C", { community_added: true });
    const t: FoldTarget = { kind: "fold", id: `fold:${s.id}:${p.id}`, a: sum(s, 2, true), b: sum(p), flaggedWhy: "x" };
    const r = generateVerifyFolds({ targets: [t], verdictFiles: [v("fable", t.id, "fold"), v("opus", t.id, "keep")], decisions: [{ targetId: t.id, decision: "fold" }], lines: [p, s], vitolas: [], refs: {} });
    expect(r.ops).toEqual([expect.objectContaining({ sourceLineId: s.id, targetLineId: p.id, reviewed: true, generator: "verify-folds:dave" })]);
    expect((r.ops[0] as { agreement?: unknown }).agreement).toBeUndefined();
    expect(r.review).toEqual([]);
    const keep = generateVerifyFolds({ targets: [t], verdictFiles: [], decisions: [{ targetId: t.id, decision: "keep" }], lines: [p, s], vitolas: [], refs: {} });
    expect(keep.resolvedKeep).toEqual([t.id]);
  });
  it("reports orphan verdicts whose targetId doesn't match any target", () => {
    const p = line("A", "B"), s = line("A", "B C");
    const t: FoldTarget = { kind: "fold", id: `fold:${s.id}:${p.id}`, a: sum(s), b: sum(p), flaggedWhy: "x" };
    const r = generateVerifyFolds({ targets: [t], verdictFiles: [v("fable", "fold:unknown:unknown", "fold")], lines: [p, s], vitolas: [], refs: {} });
    expect(r.orphans).toContain("fold:unknown:unknown");
  });
  it("sends two agreed folds of the same source line (A into B, A near-dupe into C) to review as a conflict", () => {
    const b = line("A", "B"), a = line("A", "B C"), c = line("A", "B  C.");
    const t1: FoldTarget = { kind: "fold", id: `fold:${a.id}:${b.id}`, a: sum(a), b: sum(b), flaggedWhy: "x" };
    const t2: FoldTarget = { kind: "near_dupe", id: `near_dupe:${a.id}:${c.id}`, a: sum(a), b: sum(c), flaggedWhy: "trigram 90%" };
    const r = generateVerifyFolds({ targets: [t1, t2], verdictFiles: [v("fable", t1.id, "fold"), v("opus", t1.id, "fold"), v("fable", t2.id, "merge_a_into_b"), v("opus", t2.id, "merge_a_into_b")], lines: [a, b, c], vitolas: [], refs: {} });
    expect(r.ops).toEqual([]);
    expect(r.review.map((i) => i.targetId)).toEqual([t1.id, t2.id]);
    expect(r.review.every((i) => /conflicts with another fold/.test(i.why))).toBe(true);
    expect(r.review[0].why).toContain(t2.id);
    expect(r.review[0].verdicts).toHaveLength(2);
    expect(r.summary).toMatchObject({ autoFolds: 0, review: 2 });
  });
  it("sends a chain (A into B, B into C) to review because B is both a source and a target", () => {
    const a = line("A", "X Y Z"), b = line("A", "X Y"), c = line("A", "X");
    const t1: FoldTarget = { kind: "fold", id: `fold:${a.id}:${b.id}`, a: sum(a), b: sum(b), flaggedWhy: "x" };
    const t2: FoldTarget = { kind: "fold", id: `fold:${b.id}:${c.id}`, a: sum(b), b: sum(c), flaggedWhy: "x" };
    const r = generateVerifyFolds({ targets: [t1, t2], verdictFiles: [v("fable", t1.id, "fold"), v("opus", t1.id, "fold"), v("fable", t2.id, "fold"), v("opus", t2.id, "fold")], lines: [a, b, c], vitolas: [], refs: {} });
    expect(r.ops).toEqual([]);
    expect(r.review).toHaveLength(2);
    expect(r.review.every((i) => /conflicts with another fold/.test(i.why))).toBe(true);
  });
  it("includes decided ops in conflict detection", () => {
    const a = line("A", "X Y Z"), b = line("A", "X Y"), c = line("A", "X");
    const t1: FoldTarget = { kind: "fold", id: `fold:${a.id}:${b.id}`, a: sum(a), b: sum(b), flaggedWhy: "x" };
    const t2: FoldTarget = { kind: "fold", id: `fold:${b.id}:${c.id}`, a: sum(b), b: sum(c), flaggedWhy: "x" };
    const r = generateVerifyFolds({ targets: [t1, t2], verdictFiles: [v("fable", t1.id, "fold"), v("opus", t1.id, "fold")], decisions: [{ targetId: t2.id, decision: "fold" }], lines: [a, b, c], vitolas: [], refs: {} });
    expect(r.ops).toEqual([]);
    expect(r.review.map((i) => i.targetId).sort()).toEqual([t1.id, t2.id].sort());
  });
  it("reports a summary", () => {
    expect(generateVerifyFolds({ targets: [], verdictFiles: [], lines: [], vitolas: [], refs: {} }).summary).toEqual({ targets: 0, autoFolds: 0, resolvedKeep: 0, review: 0, skipped: 0, decided: 0 });
  });
});
