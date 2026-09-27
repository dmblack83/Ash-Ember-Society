import type { LineRow, RefCounts, VitolaRow } from "./types";
import { norm, tokens } from "./rules-tier-a";

export interface DeferredEntry { kind: string; flaggedWhy: string; sourceLineId?: string; targetLineId?: string; sourceVitolaId?: string; label: string }
export interface VitolaSummary { vitolaId: string; name: string | null; format: string | null; ring: number | null; length: number | null; wrapper: string | null; shade: string | null; refs: number }
export interface LineSummary { lineId: string; brand: string; series: string | null; communityAdded: boolean; refs: number; vitolas: VitolaSummary[] }
export interface FoldTarget { kind: "fold" | "near_dupe"; id: string; a: LineSummary; b: LineSummary; remainder?: string; flaggedWhy: string }
export interface NameBatch { batch: string; brands: string[]; vitolas: (VitolaSummary & { brand: string; series: string | null })[] }

const trigrams = (s: string) => { const p = `  ${norm(s)} `; const g = new Set<string>(); for (let i = 0; i < p.length - 2; i++) g.add(p.slice(i, i + 3)); return g; };
export function trigramSimilarity(a: string, b: string): number {
  const A = trigrams(a), B = trigrams(b);
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export function findNearDupeSeries(lines: LineRow[], threshold = 0.6): Array<{ a: string; b: string; similarity: number }> {
  const byBrand = new Map<string, LineRow[]>();
  for (const l of lines) { if (!l.series) continue; const k = norm(l.brand); byBrand.set(k, [...(byBrand.get(k) ?? []), l]); }
  const out: Array<{ a: string; b: string; similarity: number }> = [];
  for (const group of byBrand.values()) {
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const a = group[i], b = group[j];
      const ta = tokens(a.series), tb = tokens(b.series);
      const isPrefix = ta.every((t, k) => t === tb[k]) || tb.every((t, k) => t === ta[k]);
      if (isPrefix) continue;
      const s = trigramSimilarity(a.series!, b.series!);
      if (s >= threshold) { const [x, y] = [a.id, b.id].sort(); out.push({ a: x, b: y, similarity: Math.round(s * 100) / 100 }); }
    }
  }
  return out;
}

function summarize(l: LineRow, vitolas: VitolaRow[], refs: RefCounts): LineSummary {
  const kids = vitolas.filter((v) => v.line_id === l.id);
  const vs = kids.map((v) => ({ vitolaId: v.id, name: v.name, format: v.format, ring: v.ring_gauge, length: v.length_inches, wrapper: v.wrapper, shade: v.shade, refs: refs[v.id] ?? 0 }));
  return { lineId: l.id, brand: l.brand, series: l.series, communityAdded: l.community_added || kids.some((k) => k.community_added), refs: vs.reduce((s, v) => s + v.refs, 0), vitolas: vs };
}

export function buildFoldTargets(deferred: DeferredEntry[], lines: LineRow[], vitolas: VitolaRow[], refs: RefCounts): FoldTarget[] {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const out: FoldTarget[] = [];
  for (const d of deferred) {
    if (d.kind !== "fold_line" || !d.sourceLineId || !d.targetLineId) continue;
    const s = byId.get(d.sourceLineId), t = byId.get(d.targetLineId);
    if (!s || !t) continue;
    const remainderTokens = (s.series ?? "").trim().replace(/\s+/g, " ").split(" ").slice(tokens(t.series).length);
    out.push({ kind: "fold", id: `fold:${s.id}:${t.id}`, a: summarize(s, vitolas, refs), b: summarize(t, vitolas, refs), remainder: remainderTokens.join(" "), flaggedWhy: d.flaggedWhy });
  }
  for (const p of findNearDupeSeries(lines)) {
    const a = byId.get(p.a)!, b = byId.get(p.b)!;
    out.push({ kind: "near_dupe", id: `near_dupe:${p.a}:${p.b}`, a: summarize(a, vitolas, refs), b: summarize(b, vitolas, refs), flaggedWhy: `trigram ${Math.round(p.similarity * 100)}%` });
  }
  return out;
}

export function buildNameBatches(lines: LineRow[], vitolas: VitolaRow[], refs: RefCounts, maxPerBatch = 40): NameBatch[] {
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const byBrand = new Map<string, VitolaRow[]>();
  for (const v of vitolas) { if (v.name !== null) continue; const brand = (v.line_id && lineById.get(v.line_id)?.brand) || v.brand || "?"; byBrand.set(brand, [...(byBrand.get(brand) ?? []), v]); }
  const usage = (vs: VitolaRow[]) => vs.reduce((s, v) => s + v.usage_count + (refs[v.id] ?? 0), 0);
  const brands = [...byBrand.entries()].sort((x, y) => usage(y[1]) - usage(x[1]) || y[1].length - x[1].length || x[0].localeCompare(y[0]));
  const toSummary = (v: VitolaRow) => ({ vitolaId: v.id, brand: (v.line_id && lineById.get(v.line_id)?.brand) || v.brand || "?", series: (v.line_id && lineById.get(v.line_id)?.series) ?? v.series, name: v.name, format: v.format, ring: v.ring_gauge, length: v.length_inches, wrapper: v.wrapper, shade: v.shade, refs: refs[v.id] ?? 0 });
  const batches: NameBatch[] = [];
  let cur: NameBatch | null = null;
  const open = () => { cur = { batch: `names-${String(batches.length + 1).padStart(2, "0")}`, brands: [], vitolas: [] }; batches.push(cur); return cur; };
  for (const [brand, vs] of brands) {
    if (vs.length > maxPerBatch) {
      for (let i = 0; i < vs.length; i += maxPerBatch) { const b = open(); b.brands.push(brand); b.vitolas.push(...vs.slice(i, i + maxPerBatch).map(toSummary)); }
      cur = null; continue;
    }
    if (!cur || cur.vitolas.length + vs.length > maxPerBatch) cur = open();
    cur.brands.push(brand); cur.vitolas.push(...vs.map(toSummary));
  }
  return batches;
}
