import { describe, it, expect } from "vitest";
import { generateNameVitolas, validateNameFile } from "../name-vitolas";
import type { NameFile, NameResult } from "../name-vitolas";
import type { VitolaRow } from "../types";

let n = 0;
const uid = () => `${(++n).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
const vit = (extra: Partial<VitolaRow> = {}): VitolaRow => ({
  id: uid(), line_id: uid(), brand: "Arturo Fuente", series: "Hemingway", name: null, format: "Perfecto", ring_gauge: 49, length_inches: 4, wrapper: null, shade: null,
  wrapper_country: null, binder_country: null, filler_countries: null, usage_count: 0, community_added: false, approved: true, image_url: null, source_id: "seed", strength: null, created_at: null, ...extra,
});
const file = (model: string, names: unknown[]): NameFile => ({ model, batch: "names-01", names: names as NameResult[] });
const res = (vitolaId: string, name: string | null, confidence = "high", sourceUrls = ["https://a", "https://b"], extra: Record<string, unknown> = {}) => ({ vitolaId, name, confidence, sourceUrls, ...extra });

describe("validateNameFile", () => {
  it("accepts a valid file and names the file in every rejection", () => {
    expect(validateNameFile(file("opus", [res(uid(), "Short Story")]), "n.json").names).toHaveLength(1);
    expect(() => validateNameFile(file("opus", [{ vitolaId: uid(), name: "x", confidence: "sure", sourceUrls: [] }]), "n.json")).toThrow(/n\.json.*confidence/);
    expect(() => validateNameFile(file("opus", [{ vitolaId: "nope", name: "x", confidence: "high", sourceUrls: [] }]), "n.json")).toThrow(/vitolaId/);
    expect(() => validateNameFile(file("opus", [res(uid(), "x", "high", ["https://a"], { dimsFlag: { ring: "50" } })]), "n.json")).toThrow(/dimsFlag/);
  });
});

describe("generateNameVitolas", () => {
  it("emits write_name for high confidence with two sources and parks medium/low", () => {
    const a = vit(), b = vit(), c = vit();
    const r = generateNameVitolas({ nameFiles: [file("opus", [res(a.id, "Short Story"), res(b.id, "Best Seller", "medium", ["https://a"]), res(c.id, "Classic", "low", [])])], vitolas: [a, b, c] });
    expect(r.ops).toEqual([expect.objectContaining({ type: "write_name", vitolaId: a.id, name: "Short Story", confidence: "high", sourceUrl: "https://a", generator: "name-vitolas", reviewed: false })]);
    expect((r.ops[0] as { evidence: { url: string }[] }).evidence).toEqual([{ url: "https://a" }, { url: "https://b" }]);
    expect(r.pending.map((p) => [p.vitolaId, p.confidence])).toEqual([[b.id, "medium"], [c.id, "low"]]);
    expect(r.summary).toMatchObject({ results: 3, ops: 1, pending: 2 });
  });
  it("skips vitolas that already have a name and counts null names as not found", () => {
    const named = vit({ name: "Already" }), miss = vit();
    const r = generateNameVitolas({ nameFiles: [file("opus", [res(named.id, "Other"), res(miss.id, null, "low", [])])], vitolas: [named, miss] });
    expect(r.ops).toEqual([]);
    expect(r.summary).toMatchObject({ alreadyNamed: 1, notFound: 1 });
  });
  it("rejects unknown ids, empty or overlong names, names equal to the format, and high confidence with one source", () => {
    const v = vit();
    const r = generateNameVitolas({ nameFiles: [
      file("m1", [res(uid(), "x")]), file("m2", [res(v.id, "  ")]), file("m3", [res(v.id, "y".repeat(121))]),
      file("m4", [res(v.id, "perfecto")]), file("m5", [res(v.id, "Short Story", "high", ["https://only"])]),
    ], vitolas: [v] });
    expect(r.ops).toEqual([]);
    expect(r.rejected).toHaveLength(5);
    expect(r.rejected.join("\n")).toMatch(/unknown vitola/);
    expect(r.rejected.join("\n")).toMatch(/empty/);
    expect(r.rejected.join("\n")).toMatch(/120/);
    expect(r.rejected.join("\n")).toMatch(/equals the format/);
    expect(r.rejected.join("\n")).toMatch(/two distinct sources/);
  });
  it("uses the last file per model and parks a vitola two models named differently", () => {
    const v = vit(), w = vit();
    const r = generateNameVitolas({ nameFiles: [
      file("opus", [res(v.id, "Wrong"), res(w.id, "Same")]),
      file("opus", [res(v.id, "Right")]),
      file("fable", [res(v.id, "Right"), res(w.id, "Different")]),
    ], vitolas: [v, w] });
    expect(r.ops).toEqual([expect.objectContaining({ vitolaId: v.id, name: "Right" })]);
    expect(r.pending).toEqual([expect.objectContaining({ vitolaId: w.id, note: expect.stringMatching(/models disagree/) })]);
  });
  it("collects dims flags and honours --min-confidence medium", () => {
    const v = vit(), w = vit();
    const r = generateNameVitolas({ nameFiles: [file("opus", [res(v.id, "Signature", "medium", ["https://a"], { dimsFlag: { ring: 50, sourceUrl: "https://a" } }), res(w.id, "Corona", "medium", ["https://a"])])], vitolas: [v, w], minConfidence: "medium" });
    expect(r.ops).toEqual([expect.objectContaining({ vitolaId: w.id, name: "Corona" })]);
    expect(r.pending).toEqual([expect.objectContaining({ vitolaId: v.id, note: "dims disagree with published size (50/?)" })]);
    expect(r.dimsFlags).toEqual([{ vitolaId: v.id, label: "Arturo Fuente / Hemingway / Perfecto 4x49", ours: { ring: 49, length: 4 }, published: { ring: 50 }, sourceUrl: "https://a" }]);
  });
  it("never writes a name for a result carrying dimsFlag, even at high confidence with two sources", () => {
    const v = vit();
    const r = generateNameVitolas({ nameFiles: [file("opus", [res(v.id, "Short Story", "high", ["https://a", "https://b"], { dimsFlag: { ring: 48, length: 4.25, sourceUrl: "https://a" } })])], vitolas: [v] });
    expect(r.ops).toEqual([]);
    expect(r.pending).toEqual([expect.objectContaining({ vitolaId: v.id, name: "Short Story", note: expect.stringMatching(/dims disagree/) })]);
    expect(r.dimsFlags).toHaveLength(1);
    expect(r.summary).toMatchObject({ ops: 0, pending: 1, dimsFlags: 1 });
  });
  it("collapses model families so a re-labeled same model overrides its earlier name with no disagreement", () => {
    const v = vit();
    const r = generateNameVitolas({ nameFiles: [
      file("opus", [res(v.id, "Wrong")]),
      file("Claude Opus 5.5", [res(v.id, "Right")]),
    ], vitolas: [v] });
    expect(r.ops).toEqual([expect.objectContaining({ vitolaId: v.id, name: "Right" })]);
    expect(r.pending).toEqual([]);
  });
  it("treats a rejected result as still contributing to model disagreement", () => {
    const v = vit();
    const r = generateNameVitolas({ nameFiles: [
      file("modelA", [res(v.id, "Short Story", "high", ["https://only"])]),
      file("modelB", [res(v.id, "Best Seller", "high", ["https://a", "https://b"])]),
    ], vitolas: [v] });
    expect(r.ops).toEqual([]);
    expect(r.pending).toEqual([expect.objectContaining({ vitolaId: v.id, note: expect.stringMatching(/models disagree/) })]);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected.join("\n")).toMatch(/two distinct sources/);
  });
  it("validates url format and normalizes urls before counting distinct sources", () => {
    expect(() => validateNameFile(file("opus", [res(uid(), "x", "high", ["", "n/a"])]), "n.json")).toThrow(/sourceUrls must be http\(s\)/);
    expect(() => validateNameFile(file("opus", [res(uid(), "x", "high", ["https://a"], { dimsFlag: { ring: 50, sourceUrl: "not-a-url" } })]), "n.json")).toThrow(/dimsFlag\.sourceUrl must be an http\(s\) url/);
    const v = vit();
    const r = generateNameVitolas({ nameFiles: [file("opus", [res(v.id, "Short Story", "high", ["https://a", "https://a/"])])], vitolas: [v] });
    expect(r.ops).toEqual([]);
    expect(r.rejected.join("\n")).toMatch(/two distinct sources/);
  });
  it("rejects a name equal to the brand or series but accepts a distinct name", () => {
    const bad = vit(), good = vit();
    const r = generateNameVitolas({ nameFiles: [file("opus", [res(bad.id, "Hemingway"), res(good.id, "Short Story")])], vitolas: [bad, good] });
    expect(r.ops).toEqual([expect.objectContaining({ vitolaId: good.id, name: "Short Story" })]);
    expect(r.rejected.join("\n")).toMatch(/name equals the line's brand\/series "Hemingway"/);
  });
});
