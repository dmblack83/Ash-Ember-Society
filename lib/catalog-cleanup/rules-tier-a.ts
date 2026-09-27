// lib/catalog-cleanup/rules-tier-a.ts
import type { ChildFill, FoldLineOp, LineRow, MergeVitolaOp, Op, RefCounts, VitolaRow } from "./types";

const GEN = "rules-tier-a";

/** Series-suffix tokens that name a wrapper or shade, and what they fill on the child. */
export const NOISE_FILL: Record<string, ChildFill> = {
  nt: { shade: "Natural" }, natural: { shade: "Natural" },
  md: { shade: "Maduro" }, maduro: { shade: "Maduro" },
  oscuro: { shade: "Oscuro / Double Maduro" },
  claro: { shade: "Claro" },
  sungrown: { shade: "Sun Grown" },
  connecticut: { wrapper: "Connecticut Shade" },
  broadleaf: { wrapper: "Connecticut Broadleaf" },
  habano: { wrapper: "Habano" },
  corojo: { wrapper: "Corojo" },
  cameroon: { wrapper: "Cameroon" },
};

export const norm = (s: string | null | undefined): string =>
  (s ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\bsun grown\b/g, "sungrown");
export const tokens = (s: string | null | undefined) => norm(s).split(" ").filter(Boolean);
const rawTokens = (s: string) => s.trim().replace(/\s+/g, " ").replace(/\bSun Grown\b/gi, "SunGrown").split(" ");

export interface Deferred {
  kind: "fold_line" | "merge_vitola";
  flaggedWhy: string;
  sourceLineId?: string; targetLineId?: string;
  sourceVitolaId?: string; targetVitolaId?: string;
  label: string;
}

export function generateTierA(lines: LineRow[], vitolas: VitolaRow[], refs: RefCounts) {
  const ops: Op[] = [];
  const deferred: Deferred[] = [];
  const kidsOf = new Map<string, VitolaRow[]>();
  for (const v of vitolas) if (v.line_id) kidsOf.set(v.line_id, [...(kidsOf.get(v.line_id) ?? []), v]);
  const kids = (l: LineRow) => kidsOf.get(l.id) ?? [];
  /** target line id -> children folded into it earlier in this run (R1 or R2). */
  const movedIn = new Map<string, VitolaRow[]>();
  /** a line's own children plus any that already rode a fold into it this run. R2 gates and fills key off this. */
  const effectiveKids = (l: LineRow) => [...kids(l), ...(movedIn.get(l.id) ?? [])];
  const refsOf = (l: LineRow) => effectiveKids(l).reduce((s, k) => s + (refs[k.id] ?? 0), 0);
  const label = (l: LineRow) => `${l.brand} / ${l.series ?? "-"}`;
  const folded = new Set<string>();
  const summary = { caseDupeFolds: 0, noiseFolds: 0, vitolaMerges: 0, deferred: 0 };

  /* R1: case/whitespace duplicate lines */
  const byIdent = new Map<string, LineRow[]>();
  for (const l of lines) { const k = `${norm(l.brand)}|${norm(l.series)}`; byIdent.set(k, [...(byIdent.get(k) ?? []), l]); }
  for (const group of byIdent.values()) {
    if (group.length < 2) continue;
    const [keep, ...drop] = [...group].sort((a, b) => kids(b).length - kids(a).length || a.id.localeCompare(b.id));
    for (const d of drop) {
      const op: FoldLineOp = { type: "fold_line", sourceLineId: d.id, targetLineId: keep.id, childFills: {}, generator: GEN, reviewed: false,
        reason: `case/whitespace duplicate of ${label(keep)}` };
      ops.push(op); folded.add(d.id); summary.caseDupeFolds++;
      movedIn.set(keep.id, [...(movedIn.get(keep.id) ?? []), ...effectiveKids(d)]);
    }
  }

  /* R2: wrapper-noise suffix folds. Process ascending by series token length
     (ties by id) rather than input order: a shorter noise line must fold
     into its parent before a longer line under the same parent is
     considered, so the longer line's own parent search skips the
     already-folded intermediate (excluded via `folded`) and resolves
     straight to the root with the FULL remainder, instead of losing the
     intermediate's fills to row-order chance. */
  const byBrand = new Map<string, LineRow[]>();
  for (const l of lines) byBrand.set(norm(l.brand), [...(byBrand.get(norm(l.brand)) ?? []), l]);
  const r2Candidates = lines
    .filter((l) => l.series && !folded.has(l.id))
    .sort((a, b) => tokens(a.series).length - tokens(b.series).length || a.id.localeCompare(b.id));
  for (const x of r2Candidates) {
    if (!x.series || folded.has(x.id)) continue;
    const group = byBrand.get(norm(x.brand)) ?? [];
    const tx = tokens(x.series);
    let parent: LineRow | null = null;
    for (const p of group) {
      if (p.id === x.id || !p.series || folded.has(p.id)) continue;
      const tp = tokens(p.series);
      if (tp.length >= tx.length || !tp.every((t, i) => t === tx[i])) continue;
      if (!parent || tokens(parent.series).length < tp.length) parent = p;
    }
    if (!parent) continue;
    const remainder = tx.slice(tokens(parent.series).length);
    const remainderRaw = rawTokens(x.series).slice(tokens(parent.series).length).join(" ");
    const defer = (why: string) => { deferred.push({ kind: "fold_line", flaggedWhy: why, sourceLineId: x.id, targetLineId: parent!.id, label: `${label(x)} → ${label(parent!)} [${remainderRaw}]` }); summary.deferred++; };
    if (!remainder.every((t) => t in NOISE_FILL)) { defer("named remainder (possible sub-brand)"); continue; }
    const xs = effectiveKids(x);
    if (x.community_added || xs.some((k) => k.community_added)) { defer("community-added"); continue; }
    const r = refsOf(x);
    if (r > 0) { defer(`real references ${r}`); continue; }
    const childFills: Record<string, ChildFill> = {};
    let conflict: string | null = null;
    for (const k of xs) {
      const fill: ChildFill = {};
      for (const t of remainder) {
        const f = NOISE_FILL[t];
        if (f.shade) {
          if (k.shade === null) { if (fill.shade && fill.shade !== f.shade) conflict = `two shades in suffix (${fill.shade}, ${f.shade})`; fill.shade = f.shade; }
          else if (norm(k.shade) !== norm(f.shade)) conflict = `child shade "${k.shade}" conflicts with suffix ${t}`;
        }
        if (f.wrapper) {
          if (k.wrapper === null) { if (fill.wrapper && fill.wrapper !== f.wrapper) conflict = `two wrappers in suffix (${fill.wrapper}, ${f.wrapper})`; fill.wrapper = f.wrapper; }
          else if (norm(k.wrapper) !== norm(f.wrapper)) conflict = `child wrapper "${k.wrapper}" conflicts with suffix ${t}`;
        }
      }
      if (Object.keys(fill).length) childFills[k.id] = fill;
    }
    if (conflict) { defer(conflict); continue; }
    ops.push({ type: "fold_line", sourceLineId: x.id, targetLineId: parent.id, childFills, generator: GEN, reviewed: false,
      reason: `series extends "${parent.series}" by wrapper-noise "${remainderRaw}"` });
    folded.add(x.id); summary.noiseFolds++;
    movedIn.set(parent.id, [...(movedIn.get(parent.id) ?? []), ...xs]);
  }

  /* R3: identical-composition vitolas within a line. Vitola identity needs
     known dims, and automatic merges only touch seeded, approved rows. */
  const hasUnknownDims = (c: VitolaRow) => c.format === null || c.ring_gauge === null || c.length_inches === null;
  const identity = (c: VitolaRow) => [norm(c.name), norm(c.wrapper), norm(c.shade)].join("|");
  const vitLabel = (l: LineRow, d: VitolaRow) => `${label(l)} / ${d.name ?? "-"} ${d.length_inches ?? "?"}x${d.ring_gauge ?? "?"}`;
  for (const l of lines) {
    const ks = kids(l);
    if (ks.length < 2) continue;
    const identityCount = new Map<string, number>();
    for (const c of ks) identityCount.set(identity(c), (identityCount.get(identity(c)) ?? 0) + 1);
    const seen = new Map<string, VitolaRow[]>();
    for (const c of ks) {
      if (hasUnknownDims(c)) {
        if ((identityCount.get(identity(c)) ?? 0) > 1) {
          deferred.push({ kind: "merge_vitola", flaggedWhy: "unknown dims", sourceVitolaId: c.id, label: vitLabel(l, c) }); summary.deferred++;
        }
        continue;
      }
      const key = [norm(c.name), norm(c.format), c.ring_gauge, c.length_inches, norm(c.wrapper), norm(c.shade)].join("|");
      seen.set(key, [...(seen.get(key) ?? []), c]);
    }
    for (const group of seen.values()) {
      if (group.length < 2) continue;
      const [keep, ...drop] = [...group].sort((a, b) => b.usage_count - a.usage_count || a.id.localeCompare(b.id));
      const unseeded = group.some((c) => c.community_added === true || c.approved === false);
      for (const d of drop) {
        const r = refs[d.id] ?? 0;
        const lbl = vitLabel(l, d);
        if (unseeded) { deferred.push({ kind: "merge_vitola", flaggedWhy: "community-added or unapproved row in group", sourceVitolaId: d.id, targetVitolaId: keep.id, label: lbl }); summary.deferred++; continue; }
        if (r > 0) { deferred.push({ kind: "merge_vitola", flaggedWhy: `real references ${r}`, sourceVitolaId: d.id, targetVitolaId: keep.id, label: lbl }); summary.deferred++; continue; }
        const op: MergeVitolaOp = { type: "merge_vitola", sourceVitolaId: d.id, targetVitolaId: keep.id, generator: GEN, reviewed: false,
          reason: `identical full composition in ${label(l)} (name + format + dims + wrapper + shade)` };
        ops.push(op); summary.vitolaMerges++;
      }
    }
  }

  return { ops, deferred, summary };
}
