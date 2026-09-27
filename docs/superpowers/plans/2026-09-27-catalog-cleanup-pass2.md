# Catalog Cleanup Pass 2 (web-verified folds + naming) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two generators plus a research-target exporter so that web research (done by subagents, two models for fold verdicts) turns the 144 deferred fold candidates, the near-duplicate series, and the 4,257 nameless vitolas into ops for the existing executor, with Dave reviewing only disagreements.

**Architecture:** The executor from pass 1 is unchanged. New code is three pure generators in `lib/catalog-cleanup/`: `research-targets` exports compact JSON batches for research agents; `verify-folds` consumes two-model verdict files and emits `fold_line` ops only on agreement plus the seeded/zero-refs gates, everything else to a review file that Dave answers and feeds back; `name-vitolas` consumes name research files and emits `write_name` ops at high confidence, parking the rest. Research agents write JSON into `.catalog-cleanup-out/research/` (git-ignored) following schemas the generators validate.

**Tech Stack:** TypeScript (ESM, `npx tsx`), vitest under `lib/**`, existing `lib/catalog-cleanup` modules (`types`, `catalog-read`, `mgmt-client`, `rules-tier-a` helpers `norm`/`tokens`), Management API for reads. Research runs use the harness's subagents with web search.

**Spec:** `docs/superpowers/specs/2026-09-26-catalog-cleanup-executor-design.md` §12 (pass 2). Premise correction (2026-09-27): 437 brands carry nameless vitolas, not ~71; batches are sized by vitola count, not brand count.

## Global Constraints

- Vitola identity = full composition (name + format + ring + length + wrapper + shade). Naming never merges rows.
- Automatic folds: BOTH models answer `fold`, EACH cites at least one URL, source line and every child seeded (`community_added = false`), every child has zero real references. Anything else → `review.json`, never an op.
- Automatic names: `confidence: "high"` only (two sources agree), and only for vitolas whose `name` is still null at generation time. Medium/low → `names-pending.json`.
- Every emitted op carries `evidence: [{ url }]` (fold: from both verdicts; name: `sourceUrl` too) so the preview shows a checkable link.
- Reads go through `mgmt-client` + `catalog-read`; token only from `SUPABASE_MGMT_TOKEN`. No prod writes in generators.
- Research JSON files are untrusted input: validated field by field; a malformed file fails the generator with the file path and reason.
- Ops files are validated by `validateOpsFile` shape (same `reason`, `generator`, `reviewed` fields).
- Unit tests under `lib/catalog-cleanup/__tests__/`; no network in tests.
- No em dashes in README text or CLI output meant for Dave.
- Commit after each task; messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **Two verdicts from the SAME model** (an agent re-run writes a second file for the same batch): must not count as agreement. Pinned in Task 2.
2. **A vitola named between research and generation** (community queue, admin edit): `name-vitolas` must skip it, not emit a `write_name` that preview then blocks the whole file on. Pinned in Task 3.
3. **A verdict for a pair that no longer exists** (line folded by pass 1 re-run, or id typo by the agent): must be reported and skipped, not crash. Pinned in Task 2.
4. **Near-duplicate direction**: a `merge_b_into_a` verdict must produce `sourceLineId = b`, `targetLineId = a`; both models must agree on the DIRECTION, not just on "merge". Pinned in Task 2.
5. **Name length and junk**: a research name over 120 chars, empty, or equal to the format label must be rejected by the generator with the file name, since preview only checks null-ness. Pinned in Task 3.

---

### Task 1: Research target exporter

**Files:**
- Create: `lib/catalog-cleanup/research-targets.ts`
- Create: `scripts/catalog-cleanup/gen-research-targets.ts`
- Test: `lib/catalog-cleanup/__tests__/research-targets.test.ts`

**Interfaces:**
- Consumes: `LineRow`, `VitolaRow`, `RefCounts` (types.ts); `Deferred` shape from `deferred.json` (`{ kind, flaggedWhy, sourceLineId?, targetLineId?, sourceVitolaId?, label }`); `norm`, `tokens` from `rules-tier-a.ts` (export `tokens` if not already exported).
- Produces:
  ```ts
  export interface FoldTarget { kind: "fold" | "near_dupe"; id: string; a: LineSummary; b: LineSummary; remainder?: string; flaggedWhy: string }
  export interface LineSummary { lineId: string; brand: string; series: string | null; communityAdded: boolean; refs: number; vitolas: VitolaSummary[] }
  export interface VitolaSummary { vitolaId: string; name: string | null; format: string | null; ring: number | null; length: number | null; wrapper: string | null; shade: string | null; refs: number }
  export interface NameBatch { batch: string; brands: string[]; vitolas: (VitolaSummary & { brand: string; series: string | null })[] }
  export function buildFoldTargets(deferred: DeferredEntry[], lines: LineRow[], vitolas: VitolaRow[], refs: RefCounts): FoldTarget[]
  export function findNearDupeSeries(lines: LineRow[], threshold?: number): Array<{ a: string; b: string; similarity: number }>  // line ids, same brand, non-prefix, trigram >= 0.6
  export function buildNameBatches(lines: LineRow[], vitolas: VitolaRow[], refs: RefCounts, maxPerBatch?: number): NameBatch[]  // default 40
  export function trigramSimilarity(a: string, b: string): number
  ```
- `FoldTarget.id` = `${kind}:${a.lineId}:${b.lineId}` (stable key the verdict files echo back). For `kind: "fold"`, `a` = source (the suffixed line), `b` = target (the parent). For `near_dupe`, `a`/`b` ordered by line id ascending.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/catalog-cleanup/__tests__/research-targets.test.ts
import { describe, it, expect } from "vitest";
import { buildFoldTargets, buildNameBatches, findNearDupeSeries, trigramSimilarity } from "../research-targets";
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
  it("ignores deferred entries that are not folds and folds whose lines no longer exist", () => {
    const p = line("A", "B");
    const t = buildFoldTargets([
      { kind: "merge_vitola", flaggedWhy: "unknown dims", sourceVitolaId: uid(), label: "x" },
      { kind: "fold_line", flaggedWhy: "community-added", sourceLineId: uid(), targetLineId: p.id, label: "gone" },
    ], [p], [vit(p)], {});
    expect(t).toEqual([]);
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/catalog-cleanup/__tests__/research-targets.test.ts`
Expected: FAIL, cannot resolve `../research-targets`.

- [ ] **Step 3: Export `tokens` from rules-tier-a if needed, then write the module**

In `lib/catalog-cleanup/rules-tier-a.ts`, change `const tokens = ...` to `export const tokens = ...` (leave `norm` exported as is).

```ts
// lib/catalog-cleanup/research-targets.ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/catalog-cleanup/__tests__/research-targets.test.ts lib/catalog-cleanup/__tests__/rules-tier-a.test.ts`
Expected: PASS (7 new + existing tier-a tests still green).

- [ ] **Step 5: Write the CLI**

```ts
// scripts/catalog-cleanup/gen-research-targets.ts
/* Pass-2 exporter: writes research batches for the fold-verdict and naming agents.
 * Run: SUPABASE_MGMT_TOKEN=... npx tsx scripts/catalog-cleanup/gen-research-targets.ts [--out .catalog-cleanup-out] [--max-per-batch 40]
 * Reads <out>/deferred.json (from gen-tier-a). Writes <out>/research/targets/folds.json and <out>/research/targets/names-NN.json */
import * as fs from "node:fs";
import * as path from "node:path";
import { createMgmtClient } from "../../lib/catalog-cleanup/mgmt-client";
import { fetchLines, fetchRefCounts, fetchVitolas } from "../../lib/catalog-cleanup/catalog-read";
import { buildFoldTargets, buildNameBatches } from "../../lib/catalog-cleanup/research-targets";
import { parseOut } from "../../lib/catalog-cleanup/cli-args";

const { outDir, rest } = parseOut(process.argv.slice(2));
const mIdx = rest.indexOf("--max-per-batch");
const maxPerBatch = mIdx >= 0 ? Number(rest[mIdx + 1]) : 40;
if (!Number.isInteger(maxPerBatch) || maxPerBatch < 5) { console.error("--max-per-batch needs an integer >= 5"); process.exit(2); }

async function main() {
  const token = process.env.SUPABASE_MGMT_TOKEN ?? "";
  if (!token) { console.error("SUPABASE_MGMT_TOKEN is not set"); process.exit(2); }
  const deferredPath = path.join(outDir, "deferred.json");
  if (!fs.existsSync(deferredPath)) { console.error(`missing ${deferredPath}; run gen-tier-a first`); process.exit(2); }
  const deferred = JSON.parse(fs.readFileSync(deferredPath, "utf8"));
  const client = createMgmtClient({ token, projectRef: process.env.SUPABASE_PROJECT_REF });
  const [lines, vitolas, refs] = await Promise.all([fetchLines(client), fetchVitolas(client), fetchRefCounts(client)]);
  const folds = buildFoldTargets(deferred, lines, vitolas, refs);
  const names = buildNameBatches(lines, vitolas, refs, maxPerBatch);
  const dir = path.join(outDir, "research", "targets");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "folds.json"), JSON.stringify(folds, null, 2));
  for (const b of names) fs.writeFileSync(path.join(dir, `${b.batch}.json`), JSON.stringify(b, null, 2));
  console.log(`fold targets: ${folds.filter((f) => f.kind === "fold").length} folds + ${folds.filter((f) => f.kind === "near_dupe").length} near-dupes -> ${path.join(dir, "folds.json")}`);
  console.log(`name batches: ${names.length} files, ${names.reduce((s, b) => s + b.vitolas.length, 0)} nameless vitolas, max ${maxPerBatch} per batch`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
```

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run lib/catalog-cleanup`
Expected: clean; all catalog-cleanup tests pass.

```bash
git add lib/catalog-cleanup/research-targets.ts lib/catalog-cleanup/rules-tier-a.ts lib/catalog-cleanup/__tests__/research-targets.test.ts scripts/catalog-cleanup/gen-research-targets.ts
git commit -m "feat(catalog-cleanup): pass-2 research target exporter (fold candidates, near-dupes, name batches)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: verify-folds generator

**Files:**
- Create: `lib/catalog-cleanup/verify-folds.ts`
- Create: `scripts/catalog-cleanup/gen-verify-folds.ts`
- Test: `lib/catalog-cleanup/__tests__/verify-folds.test.ts`

**Interfaces:**
- Consumes: `FoldTarget` (Task 1), `LineRow`, `VitolaRow`, `RefCounts`, `FoldLineOp`, `Op` (types.ts), `UUID_RE` (sql.ts).
- Produces:
  ```ts
  export interface VerdictFile { model: string; batch: string; verdicts: Verdict[] }
  export interface Verdict { targetId: string; answer: "fold" | "keep" | "merge_a_into_b" | "merge_b_into_a" | "unsure"; reason: string; urls: string[] }
  export interface Decision { targetId: string; decision: "fold" | "keep" | "merge_a_into_b" | "merge_b_into_a" }
  export function validateVerdictFile(input: unknown, fileName: string): VerdictFile   // throws with fileName + reason
  export function generateVerifyFolds(args: { targets: FoldTarget[]; verdictFiles: VerdictFile[]; decisions?: Decision[]; lines: LineRow[]; vitolas: VitolaRow[]; refs: RefCounts }): { ops: Op[]; resolvedKeep: string[]; review: ReviewItem[]; skipped: string[]; summary: Record<string, number> }
  export interface ReviewItem { targetId: string; label: string; why: string; verdicts: Array<{ model: string; answer: string; reason: string; urls: string[] }> }
  ```
- Agreement rule: for a target, take the LAST verdict per distinct `model` (a re-run of the same model overwrites, never adds). Need ≥ 2 distinct models. For `fold` targets both answers must be `fold`; for `near_dupe` targets both answers must be the same `merge_*` direction. Each agreeing verdict needs ≥ 1 url. Then the gates: source line (the one being folded away) is seeded (`communityAdded === false`) and has `refs === 0` (from the `LineSummary`, which already sums children), and both lines still exist in `lines` with the same `series` text as the target file (if the catalog moved, → skipped with reason).
- Both `keep` → `resolvedKeep`. Otherwise (disagree, unsure, missing model, missing url, gate failed) → `review` with `why`.
- `decisions` (Dave's answers, from a hand-edited copy of `review.json`): a decision of fold/merge emits the op with `reviewed: true`, `generator: "verify-folds:dave"`, evidence from whatever urls the verdicts had; a decision of keep → `resolvedKeep`. Decisions bypass the community/refs gates (that is what reviewed means) but still require both lines to exist.
- Op shape: `{ type: "fold_line", sourceLineId, targetLineId, childFills: {}, reason: "web-verified: <modelA reason> | <modelB reason>", generator: "verify-folds", reviewed: false, evidence: [{ url }...], agreement: { modelA, modelB } }`.

- [ ] **Step 1: Write the failing tests**

```ts
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
  it("accepts a valid file and rejects bad answers, missing urls array, and bad ids", () => {
    expect(validateVerdictFile(v("opus", "fold:a:b", "fold"), "f.json").verdicts).toHaveLength(1);
    expect(() => validateVerdictFile({ model: "opus", batch: "b", verdicts: [{ targetId: "x", answer: "maybe", reason: "r", urls: [] }] }, "f.json")).toThrow(/f\.json.*answer/);
    expect(() => validateVerdictFile({ model: "opus", batch: "b", verdicts: [{ targetId: "x", answer: "fold", reason: "r" }] }, "f.json")).toThrow(/urls/);
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
  it("sends disagreement, unsure, and a verdict without urls to review", () => {
    const p = line("A", "B"), s = line("A", "B C");
    const t: FoldTarget = { kind: "fold", id: `fold:${s.id}:${p.id}`, a: sum(s), b: sum(p), flaggedWhy: "x" };
    expect(generateVerifyFolds({ targets: [t], verdictFiles: [v("fable", t.id, "fold"), v("opus", t.id, "keep")], lines: [p, s], vitolas: [], refs: {} }).review[0].why).toMatch(/disagree/);
    expect(generateVerifyFolds({ targets: [t], verdictFiles: [v("fable", t.id, "fold"), v("opus", t.id, "unsure")], lines: [p, s], vitolas: [], refs: {} }).review[0].why).toMatch(/unsure/);
    expect(generateVerifyFolds({ targets: [t], verdictFiles: [v("fable", t.id, "fold", []), v("opus", t.id, "fold")], lines: [p, s], vitolas: [], refs: {} }).review[0].why).toMatch(/no url/);
  });
  it("resolves keep when both say keep, and gates agreement on seeded + zero refs", () => {
    const p = line("A", "B"), s = line("A", "B C");
    const keepT: FoldTarget = { kind: "fold", id: `fold:${s.id}:${p.id}`, a: sum(s), b: sum(p), flaggedWhy: "x" };
    expect(generateVerifyFolds({ targets: [keepT], verdictFiles: [v("fable", keepT.id, "keep"), v("opus", keepT.id, "keep")], lines: [p, s], vitolas: [], refs: {} }).resolvedKeep).toEqual([keepT.id]);
    const refT: FoldTarget = { ...keepT, a: sum(s, 3) };
    expect(generateVerifyFolds({ targets: [refT], verdictFiles: [v("fable", refT.id, "fold"), v("opus", refT.id, "fold")], lines: [p, s], vitolas: [], refs: {} }).review[0].why).toMatch(/real references/);
    const comT: FoldTarget = { ...keepT, a: sum(s, 0, true) };
    expect(generateVerifyFolds({ targets: [comT], verdictFiles: [v("fable", comT.id, "fold"), v("opus", comT.id, "fold")], lines: [p, s], vitolas: [], refs: {} }).review[0].why).toMatch(/community/);
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
    expect(r.review).toEqual([]);
    const keep = generateVerifyFolds({ targets: [t], verdictFiles: [], decisions: [{ targetId: t.id, decision: "keep" }], lines: [p, s], vitolas: [], refs: {} });
    expect(keep.resolvedKeep).toEqual([t.id]);
  });
  it("reports a summary", () => {
    expect(generateVerifyFolds({ targets: [], verdictFiles: [], lines: [], vitolas: [], refs: {} }).summary).toEqual({ targets: 0, autoFolds: 0, resolvedKeep: 0, review: 0, skipped: 0, decided: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/catalog-cleanup/__tests__/verify-folds.test.ts`
Expected: FAIL, cannot resolve `../verify-folds`.

- [ ] **Step 3: Write the generator**

```ts
// lib/catalog-cleanup/verify-folds.ts
import type { FoldTarget } from "./research-targets";
import type { FoldLineOp, LineRow, Op, RefCounts, VitolaRow } from "./types";

const ANSWERS = ["fold", "keep", "merge_a_into_b", "merge_b_into_a", "unsure"] as const;
export type Answer = (typeof ANSWERS)[number];
export interface Verdict { targetId: string; answer: Answer; reason: string; urls: string[] }
export interface VerdictFile { model: string; batch: string; verdicts: Verdict[] }
export interface Decision { targetId: string; decision: Exclude<Answer, "unsure"> }
export interface ReviewItem { targetId: string; label: string; why: string; verdicts: Array<{ model: string; answer: string; reason: string; urls: string[] }> }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function validateVerdictFile(input: unknown, fileName: string): VerdictFile {
  const fail = (why: string): never => { throw new Error(`${fileName}: ${why}`); };
  if (!isObj(input)) fail("must be an object");
  const o = input as Record<string, unknown>;
  if (typeof o.model !== "string" || !o.model) fail("model must be a non-empty string");
  if (typeof o.batch !== "string") fail("batch must be a string");
  if (!Array.isArray(o.verdicts)) fail("verdicts must be an array");
  (o.verdicts as unknown[]).forEach((raw, i) => {
    if (!isObj(raw)) fail(`verdicts[${i}] must be an object`);
    const r = raw as Record<string, unknown>;
    if (typeof r.targetId !== "string" || !r.targetId) fail(`verdicts[${i}].targetId must be a string`);
    if (!ANSWERS.includes(r.answer as Answer)) fail(`verdicts[${i}].answer must be one of ${ANSWERS.join("|")}`);
    if (typeof r.reason !== "string") fail(`verdicts[${i}].reason must be a string`);
    if (!Array.isArray(r.urls) || r.urls.some((u) => typeof u !== "string")) fail(`verdicts[${i}].urls must be a string array`);
  });
  return o as unknown as VerdictFile;
}

const label = (t: FoldTarget) => `${t.a.brand} / ${t.a.series ?? "-"} ~ ${t.b.brand} / ${t.b.series ?? "-"}`;

export function generateVerifyFolds(args: { targets: FoldTarget[]; verdictFiles: VerdictFile[]; decisions?: Decision[]; lines: LineRow[]; vitolas: VitolaRow[]; refs: RefCounts }) {
  const ops: Op[] = [];
  const resolvedKeep: string[] = [];
  const review: ReviewItem[] = [];
  const skipped: string[] = [];
  const summary = { targets: args.targets.length, autoFolds: 0, resolvedKeep: 0, review: 0, skipped: 0, decided: 0 };
  const lineById = new Map(args.lines.map((l) => [l.id, l]));
  const decisions = new Map((args.decisions ?? []).map((d) => [d.targetId, d.decision]));

  /* last verdict per (target, model) wins */
  const byTarget = new Map<string, Map<string, Verdict & { model: string }>>();
  for (const f of args.verdictFiles) for (const v of f.verdicts) {
    if (!byTarget.has(v.targetId)) byTarget.set(v.targetId, new Map());
    byTarget.get(v.targetId)!.set(f.model, { ...v, model: f.model });
  }

  const emit = (t: FoldTarget, source: string, target: string, reviewed: boolean, verdicts: Array<Verdict & { model: string }>) => {
    const op: FoldLineOp = {
      type: "fold_line", sourceLineId: source, targetLineId: target, childFills: {},
      generator: reviewed ? "verify-folds:dave" : "verify-folds", reviewed,
      reason: reviewed ? `Dave decided: fold (${label(t)})` : `web-verified: ${verdicts.map((v) => `${v.model}: ${v.reason}`).join(" | ")}`,
      evidence: verdicts.flatMap((v) => v.urls.map((url) => ({ url }))),
      ...(verdicts.length >= 2 ? { agreement: { modelA: verdicts[0].model, modelB: verdicts[1].model } } : {}),
    };
    ops.push(op);
  };

  for (const t of args.targets) {
    const a = lineById.get(t.a.lineId), b = lineById.get(t.b.lineId);
    if (!a || !b) { skipped.push(`${t.id}: a line no longer exists (${label(t)})`); summary.skipped++; continue; }
    if ((a.series ?? "") !== (t.a.series ?? "") || (b.series ?? "") !== (t.b.series ?? "")) { skipped.push(`${t.id}: series changed since research (${label(t)})`); summary.skipped++; continue; }
    const verdicts = [...(byTarget.get(t.id)?.values() ?? [])].sort((x, y) => x.model.localeCompare(y.model));
    const toReview = (why: string) => { review.push({ targetId: t.id, label: label(t), why, verdicts: verdicts.map((v) => ({ model: v.model, answer: v.answer, reason: v.reason, urls: v.urls })) }); summary.review++; };
    const direction = (ans: Answer): [string, string] | null =>
      t.kind === "fold" ? (ans === "fold" ? [t.a.lineId, t.b.lineId] : null)
      : ans === "merge_a_into_b" ? [t.a.lineId, t.b.lineId] : ans === "merge_b_into_a" ? [t.b.lineId, t.a.lineId] : null;

    const decided = decisions.get(t.id);
    if (decided) {
      summary.decided++;
      if (decided === "keep") { resolvedKeep.push(t.id); summary.resolvedKeep++; continue; }
      const dir = direction(decided);
      if (!dir) { toReview(`decision "${decided}" does not apply to a ${t.kind} target`); continue; }
      emit(t, dir[0], dir[1], true, verdicts); summary.autoFolds++; continue;
    }

    if (verdicts.length < 2) { toReview(`only ${verdicts.length} model(s) answered`); continue; }
    if (verdicts.some((v) => v.answer === "unsure")) { toReview("a model answered unsure"); continue; }
    if (verdicts.every((v) => v.answer === "keep")) { resolvedKeep.push(t.id); summary.resolvedKeep++; continue; }
    const dirs = verdicts.map((v) => direction(v.answer));
    if (dirs.some((d) => d === null)) { toReview("models disagree (fold vs keep)"); continue; }
    if (t.kind === "near_dupe" && new Set(dirs.map((d) => d!.join(">"))).size > 1) { toReview("models disagree on merge direction"); continue; }
    if (verdicts.some((v) => v.urls.length === 0)) { toReview("a model cited no url"); continue; }
    const [source, target] = dirs[0]!;
    const src = source === t.a.lineId ? t.a : t.b;
    if (src.communityAdded) { toReview("source line is community-added"); continue; }
    if (src.refs > 0) { toReview(`source line has ${src.refs} real references`); continue; }
    emit(t, source, target, false, verdicts); summary.autoFolds++;
  }
  return { ops, resolvedKeep, review, skipped, summary };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/catalog-cleanup/__tests__/verify-folds.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Write the CLI**

```ts
// scripts/catalog-cleanup/gen-verify-folds.ts
/* Pass-2 generator: fold verdicts -> ops-verify-folds.json, review.json, resolved-keep.json.
 * Run: SUPABASE_MGMT_TOKEN=... npx tsx scripts/catalog-cleanup/gen-verify-folds.ts [--out .catalog-cleanup-out] [--decisions <review-decided.json>]
 * Reads <out>/research/targets/folds.json and every <out>/research/verdicts/*.json */
import * as fs from "node:fs";
import * as path from "node:path";
import { createMgmtClient } from "../../lib/catalog-cleanup/mgmt-client";
import { fetchLines, fetchRefCounts, fetchVitolas } from "../../lib/catalog-cleanup/catalog-read";
import { generateVerifyFolds, validateVerdictFile, type Decision } from "../../lib/catalog-cleanup/verify-folds";
import { parseOut } from "../../lib/catalog-cleanup/cli-args";
import type { OpsFile } from "../../lib/catalog-cleanup/types";

const { outDir, rest } = parseOut(process.argv.slice(2));
const dIdx = rest.indexOf("--decisions");
const decisionsPath = dIdx >= 0 ? rest[dIdx + 1] : null;
if (dIdx >= 0 && !decisionsPath) { console.error("--decisions needs a file"); process.exit(2); }

async function main() {
  const token = process.env.SUPABASE_MGMT_TOKEN ?? "";
  if (!token) { console.error("SUPABASE_MGMT_TOKEN is not set"); process.exit(2); }
  const targetsPath = path.join(outDir, "research", "targets", "folds.json");
  if (!fs.existsSync(targetsPath)) { console.error(`missing ${targetsPath}; run gen-research-targets first`); process.exit(2); }
  const targets = JSON.parse(fs.readFileSync(targetsPath, "utf8"));
  const vdir = path.join(outDir, "research", "verdicts");
  const files = fs.existsSync(vdir) ? fs.readdirSync(vdir).filter((f) => f.endsWith(".json")).sort() : [];
  const verdictFiles = files.map((f) => validateVerdictFile(JSON.parse(fs.readFileSync(path.join(vdir, f), "utf8")), f));
  const decisions: Decision[] | undefined = decisionsPath ? (JSON.parse(fs.readFileSync(decisionsPath, "utf8")) as Decision[]) : undefined;
  const client = createMgmtClient({ token, projectRef: process.env.SUPABASE_PROJECT_REF });
  const [lines, vitolas, refs] = await Promise.all([fetchLines(client), fetchVitolas(client), fetchRefCounts(client)]);
  const r = generateVerifyFolds({ targets, verdictFiles, decisions, lines, vitolas, refs });
  const file: OpsFile = { version: 1, generatedAt: new Date().toISOString(), generator: "verify-folds", ops: r.ops };
  fs.writeFileSync(path.join(outDir, "ops-verify-folds.json"), JSON.stringify(file, null, 2));
  fs.writeFileSync(path.join(outDir, "review.json"), JSON.stringify(r.review, null, 2));
  fs.writeFileSync(path.join(outDir, "resolved-keep.json"), JSON.stringify(r.resolvedKeep, null, 2));
  console.log(`verdict files: ${files.length}; ${JSON.stringify(r.summary)}`);
  for (const s of r.skipped) console.log(`skipped: ${s}`);
  console.log(`wrote ops-verify-folds.json (${r.ops.length} ops), review.json (${r.review.length} for Dave), resolved-keep.json (${r.resolvedKeep.length})`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
```

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run lib/catalog-cleanup`
Expected: clean and green.

```bash
git add lib/catalog-cleanup/verify-folds.ts lib/catalog-cleanup/__tests__/verify-folds.test.ts scripts/catalog-cleanup/gen-verify-folds.ts
git commit -m "feat(catalog-cleanup): verify-folds generator (two-model agreement, review file, decisions)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: name-vitolas generator

**Files:**
- Create: `lib/catalog-cleanup/name-vitolas.ts`
- Create: `scripts/catalog-cleanup/gen-name-vitolas.ts`
- Test: `lib/catalog-cleanup/__tests__/name-vitolas.test.ts`

**Interfaces:**
- Consumes: `VitolaRow` (types.ts), `WriteNameOp`, `Op`; `UUID_RE` (sql.ts).
- Produces:
  ```ts
  export interface NameFile { model: string; batch: string; names: NameResult[] }
  export interface NameResult { vitolaId: string; name: string | null; confidence: "high" | "medium" | "low"; sourceUrls: string[]; note?: string; dimsFlag?: { ring?: number; length?: number; sourceUrl: string } }
  export function validateNameFile(input: unknown, fileName: string): NameFile
  export function generateNameVitolas(args: { nameFiles: NameFile[]; vitolas: VitolaRow[]; minConfidence?: "high" | "medium" | "low" }): { ops: Op[]; pending: PendingName[]; dimsFlags: DimsFlag[]; rejected: string[]; summary: Record<string, number> }
  export interface PendingName { vitolaId: string; label: string; name: string; confidence: string; sourceUrls: string[]; note?: string }
  export interface DimsFlag { vitolaId: string; label: string; ours: { ring: number | null; length: number | null }; published: { ring?: number; length?: number }; sourceUrl: string }
  ```
- Rules: a `name: null` result is a "could not find" and is counted, not an op. A vitola whose catalog `name` is no longer null → skipped (counted as `alreadyNamed`). Rejections (with file name and vitola id): unknown vitola id; name empty after trim or > 120 chars; name equal (case-insensitive) to the vitola's current `format`; `confidence: "high"` with fewer than 2 distinct source URLs (high means two sources agree). Confidence ≥ min → `write_name` op `{ vitolaId, name, confidence, sourceUrl: sourceUrls[0], evidence: sourceUrls.map(url => ({url})), reason: "web research: <note or 'dims-matched published size name'>", generator: "name-vitolas", reviewed: false }`; below min → `pending`. `dimsFlag` present → `dimsFlags` entry regardless of confidence. Last file per model wins per vitola; if two DIFFERENT models named the same vitola differently, the vitola goes to `pending` with note `models disagree: <a> vs <b>` (no op) even if both are high.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/catalog-cleanup/__tests__/name-vitolas.test.ts
import { describe, it, expect } from "vitest";
import { generateNameVitolas, validateNameFile } from "../name-vitolas";
import type { VitolaRow } from "../types";

let n = 0;
const uid = () => `${(++n).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
const vit = (extra: Partial<VitolaRow> = {}): VitolaRow => ({
  id: uid(), line_id: uid(), brand: "Arturo Fuente", series: "Hemingway", name: null, format: "Perfecto", ring_gauge: 49, length_inches: 4, wrapper: null, shade: null,
  wrapper_country: null, binder_country: null, filler_countries: null, usage_count: 0, community_added: false, approved: true, image_url: null, source_id: "seed", strength: null, created_at: null, ...extra,
});
const file = (model: string, names: unknown[]) => ({ model, batch: "names-01", names });
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
    const v = vit();
    const r = generateNameVitolas({ nameFiles: [file("opus", [res(v.id, "Signature", "medium", ["https://a"], { dimsFlag: { ring: 50, sourceUrl: "https://a" } })])], vitolas: [v], minConfidence: "medium" });
    expect(r.ops).toHaveLength(1);
    expect(r.dimsFlags).toEqual([{ vitolaId: v.id, label: "Arturo Fuente / Hemingway / Perfecto 4x49", ours: { ring: 49, length: 4 }, published: { ring: 50 }, sourceUrl: "https://a" }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/catalog-cleanup/__tests__/name-vitolas.test.ts`
Expected: FAIL, cannot resolve `../name-vitolas`.

- [ ] **Step 3: Write the generator**

```ts
// lib/catalog-cleanup/name-vitolas.ts
import { UUID_RE } from "./sql";
import type { Op, VitolaRow, WriteNameOp } from "./types";

const CONF = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONF)[number];
export interface NameResult { vitolaId: string; name: string | null; confidence: Confidence; sourceUrls: string[]; note?: string; dimsFlag?: { ring?: number; length?: number; sourceUrl: string } }
export interface NameFile { model: string; batch: string; names: NameResult[] }
export interface PendingName { vitolaId: string; label: string; name: string; confidence: string; sourceUrls: string[]; note?: string }
export interface DimsFlag { vitolaId: string; label: string; ours: { ring: number | null; length: number | null }; published: { ring?: number; length?: number }; sourceUrl: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const rank = (c: Confidence) => CONF.indexOf(c);

export function validateNameFile(input: unknown, fileName: string): NameFile {
  const fail = (why: string): never => { throw new Error(`${fileName}: ${why}`); };
  if (!isObj(input)) fail("must be an object");
  const o = input as Record<string, unknown>;
  if (typeof o.model !== "string" || !o.model) fail("model must be a non-empty string");
  if (typeof o.batch !== "string") fail("batch must be a string");
  if (!Array.isArray(o.names)) fail("names must be an array");
  (o.names as unknown[]).forEach((raw, i) => {
    if (!isObj(raw)) fail(`names[${i}] must be an object`);
    const r = raw as Record<string, unknown>;
    if (typeof r.vitolaId !== "string" || !UUID_RE.test(r.vitolaId)) fail(`names[${i}].vitolaId must be a uuid`);
    if (r.name !== null && typeof r.name !== "string") fail(`names[${i}].name must be a string or null`);
    if (!CONF.includes(r.confidence as Confidence)) fail(`names[${i}].confidence must be high|medium|low`);
    if (!Array.isArray(r.sourceUrls) || r.sourceUrls.some((u) => typeof u !== "string")) fail(`names[${i}].sourceUrls must be a string array`);
    if (r.note !== undefined && typeof r.note !== "string") fail(`names[${i}].note must be a string`);
    if (r.dimsFlag !== undefined) {
      if (!isObj(r.dimsFlag)) fail(`names[${i}].dimsFlag must be an object`);
      const d = r.dimsFlag as Record<string, unknown>;
      if (d.ring !== undefined && typeof d.ring !== "number") fail(`names[${i}].dimsFlag.ring must be a number`);
      if (d.length !== undefined && typeof d.length !== "number") fail(`names[${i}].dimsFlag.length must be a number`);
      if (typeof d.sourceUrl !== "string") fail(`names[${i}].dimsFlag.sourceUrl must be a string`);
    }
  });
  return o as unknown as NameFile;
}

const label = (v: VitolaRow) => `${v.brand ?? "?"} / ${v.series ?? "-"} / ${v.format ?? "?"} ${v.length_inches ?? "?"}x${v.ring_gauge ?? "?"}`;

export function generateNameVitolas(args: { nameFiles: NameFile[]; vitolas: VitolaRow[]; minConfidence?: Confidence }) {
  const min = args.minConfidence ?? "high";
  const byId = new Map(args.vitolas.map((v) => [v.id, v]));
  const ops: Op[] = []; const pending: PendingName[] = []; const dimsFlags: DimsFlag[] = []; const rejected: string[] = [];
  const summary = { results: 0, ops: 0, pending: 0, rejected: 0, alreadyNamed: 0, notFound: 0, dimsFlags: 0, disagreements: 0 };

  /* last result per (vitola, model) wins */
  const byVitola = new Map<string, Map<string, NameResult & { file: string }>>();
  for (const f of args.nameFiles) for (const r of f.names) {
    summary.results++;
    if (!byVitola.has(r.vitolaId)) byVitola.set(r.vitolaId, new Map());
    byVitola.get(r.vitolaId)!.set(f.model, { ...r, file: `${f.model}/${f.batch}` });
  }

  for (const [vitolaId, perModel] of byVitola) {
    const v = byId.get(vitolaId);
    const results = [...perModel.values()];
    if (!v) { for (const r of results) { rejected.push(`${r.file}: unknown vitola ${vitolaId}`); summary.rejected++; } continue; }
    for (const r of results) if (r.dimsFlag) { dimsFlags.push({ vitolaId, label: label(v), ours: { ring: v.ring_gauge, length: v.length_inches }, published: { ...(r.dimsFlag.ring !== undefined ? { ring: r.dimsFlag.ring } : {}), ...(r.dimsFlag.length !== undefined ? { length: r.dimsFlag.length } : {}) }, sourceUrl: r.dimsFlag.sourceUrl }); summary.dimsFlags++; }
    const named = results.filter((r) => r.name !== null);
    if (named.length === 0) { summary.notFound++; continue; }
    if (v.name !== null) { summary.alreadyNamed++; continue; }
    const valid: Array<NameResult & { file: string; clean: string }> = [];
    for (const r of named) {
      const clean = (r.name as string).trim().replace(/\s+/g, " ");
      if (!clean) { rejected.push(`${r.file}: empty name for ${vitolaId}`); summary.rejected++; continue; }
      if (clean.length > 120) { rejected.push(`${r.file}: name over 120 chars for ${vitolaId}`); summary.rejected++; continue; }
      if (v.format && clean.toLowerCase() === v.format.trim().toLowerCase()) { rejected.push(`${r.file}: name equals the format "${v.format}" for ${vitolaId}`); summary.rejected++; continue; }
      if (r.confidence === "high" && new Set(r.sourceUrls).size < 2) { rejected.push(`${r.file}: high confidence needs two distinct sources for ${vitolaId}`); summary.rejected++; continue; }
      valid.push({ ...r, clean });
    }
    if (valid.length === 0) continue;
    const distinct = new Set(valid.map((r) => r.clean.toLowerCase()));
    if (distinct.size > 1) {
      summary.disagreements++; summary.pending++;
      pending.push({ vitolaId, label: label(v), name: valid[0].clean, confidence: valid[0].confidence, sourceUrls: valid.flatMap((r) => r.sourceUrls), note: `models disagree: ${valid.map((r) => `${r.file.split("/")[0]} "${r.clean}"`).join(" vs ")}` });
      continue;
    }
    const best = [...valid].sort((a, b) => rank(a.confidence) - rank(b.confidence))[0];
    const urls = [...new Set(valid.flatMap((r) => r.sourceUrls))];
    if (rank(best.confidence) <= rank(min)) {
      const op: WriteNameOp = { type: "write_name", vitolaId, name: best.clean, confidence: best.confidence, sourceUrl: urls[0], evidence: urls.map((url) => ({ url })),
        reason: `web research: ${best.note ?? "dims-matched published size name"}`, generator: "name-vitolas", reviewed: false };
      ops.push(op); summary.ops++;
    } else {
      pending.push({ vitolaId, label: label(v), name: best.clean, confidence: best.confidence, sourceUrls: urls, ...(best.note ? { note: best.note } : {}) }); summary.pending++;
    }
  }
  return { ops, pending, dimsFlags, rejected, summary };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/catalog-cleanup/__tests__/name-vitolas.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the CLI**

```ts
// scripts/catalog-cleanup/gen-name-vitolas.ts
/* Pass-2 generator: name research -> ops-name-vitolas.json, names-pending.json, dims-flags.json.
 * Run: SUPABASE_MGMT_TOKEN=... npx tsx scripts/catalog-cleanup/gen-name-vitolas.ts [--out .catalog-cleanup-out] [--min-confidence high|medium|low]
 * Reads every <out>/research/names/*.json */
import * as fs from "node:fs";
import * as path from "node:path";
import { createMgmtClient } from "../../lib/catalog-cleanup/mgmt-client";
import { fetchVitolas } from "../../lib/catalog-cleanup/catalog-read";
import { generateNameVitolas, validateNameFile, type Confidence } from "../../lib/catalog-cleanup/name-vitolas";
import { parseOut } from "../../lib/catalog-cleanup/cli-args";
import type { OpsFile } from "../../lib/catalog-cleanup/types";

const { outDir, rest } = parseOut(process.argv.slice(2));
const cIdx = rest.indexOf("--min-confidence");
const minConfidence = (cIdx >= 0 ? rest[cIdx + 1] : "high") as Confidence;
if (!["high", "medium", "low"].includes(minConfidence)) { console.error("--min-confidence must be high|medium|low"); process.exit(2); }

async function main() {
  const token = process.env.SUPABASE_MGMT_TOKEN ?? "";
  if (!token) { console.error("SUPABASE_MGMT_TOKEN is not set"); process.exit(2); }
  const ndir = path.join(outDir, "research", "names");
  const files = fs.existsSync(ndir) ? fs.readdirSync(ndir).filter((f) => f.endsWith(".json")).sort() : [];
  if (files.length === 0) { console.error(`no research files in ${ndir}`); process.exit(2); }
  const nameFiles = files.map((f) => validateNameFile(JSON.parse(fs.readFileSync(path.join(ndir, f), "utf8")), f));
  const client = createMgmtClient({ token, projectRef: process.env.SUPABASE_PROJECT_REF });
  const vitolas = await fetchVitolas(client);
  const r = generateNameVitolas({ nameFiles, vitolas, minConfidence });
  const file: OpsFile = { version: 1, generatedAt: new Date().toISOString(), generator: "name-vitolas", ops: r.ops };
  fs.writeFileSync(path.join(outDir, "ops-name-vitolas.json"), JSON.stringify(file, null, 2));
  fs.writeFileSync(path.join(outDir, "names-pending.json"), JSON.stringify(r.pending, null, 2));
  fs.writeFileSync(path.join(outDir, "dims-flags.json"), JSON.stringify(r.dimsFlags, null, 2));
  fs.writeFileSync(path.join(outDir, "names-rejected.txt"), r.rejected.join("\n"));
  console.log(`research files: ${files.length}; ${JSON.stringify(r.summary)}`);
  console.log(`wrote ops-name-vitolas.json (${r.ops.length} ops at >= ${minConfidence}), names-pending.json (${r.pending.length}), dims-flags.json (${r.dimsFlags.length}), names-rejected.txt (${r.rejected.length})`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
```

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run lib/catalog-cleanup`
Expected: clean and green.

```bash
git add lib/catalog-cleanup/name-vitolas.ts lib/catalog-cleanup/__tests__/name-vitolas.test.ts scripts/catalog-cleanup/gen-name-vitolas.ts
git commit -m "feat(catalog-cleanup): name-vitolas generator (high-confidence auto, pending, dims flags)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Research prompts, README, gate

**Files:**
- Create: `scripts/catalog-cleanup/research/fold-verdict-prompt.md`
- Create: `scripts/catalog-cleanup/research/name-vitolas-prompt.md`
- Modify: `scripts/catalog-cleanup/README.md` (append a "Pass 2" section)

- [ ] **Step 1: Write the fold-verdict prompt**

```markdown
# Fold verdict research (one batch)

You are given a JSON file of catalog "fold targets". Each has two cigar lines from the same brand, `a` and `b`, with their vitolas (sizes). Decide, from published sources, whether they are the same product line.

For `kind: "fold"`: `a` is a line whose series name extends `b`'s by `remainder` (for example "Blackened S84" extends "Blackened"). Answer `fold` if the remainder is a size, vitola, wrapper, or edition suffix of the SAME line (a's cigars belong under b). Answer `keep` if the remainder names a distinct line or sub-brand that the maker markets separately (its own page, own blend, own name). Answer `unsure` if the sources do not settle it.

For `kind: "near_dupe"`: `a` and `b` have similar series names (typo, abbreviation, spelling). Answer `merge_a_into_b` or `merge_b_into_a` when they are the same line and one spelling is the maker's; put the maker's spelling as the target (the one that survives). Answer `keep` if they are genuinely different lines. `unsure` otherwise.

Rules:
- Search the maker's own site first, then one retailer or database. Cite every page you relied on in `urls`. A verdict with no url is discarded.
- Never guess from the name alone. If you cannot open a page that mentions both names, answer `unsure`.
- Do not modify the catalog. Do not write anything except the output file.

Output: write ONE file `<outDir>/research/verdicts/<batch>-<model>.json` shaped exactly:
{ "model": "<your model name>", "batch": "<batch>", "verdicts": [ { "targetId": "<id from the input>", "answer": "fold|keep|merge_a_into_b|merge_b_into_a|unsure", "reason": "<one sentence>", "urls": ["https://..."] } ] }
Every target in the input gets exactly one verdict. Reply with only the output path and counts per answer.
```

- [ ] **Step 2: Write the naming prompt**

```markdown
# Vitola naming research (one batch)

You are given a JSON batch of nameless cigar vitolas: brand, series, shape (`format`), ring gauge (`ring`), length in inches (`length`), wrapper and shade. Find the maker's published NAME for each size.

Method:
1. For each brand/series in the batch, open the maker's product page and one retailer or database page that lists the line's sizes with dimensions.
2. Match each vitola to a listed size by dimensions: ring exact, length within 1/8 inch. Read the size's published name (for example "Short Story", "Best Seller", "No. 4", "Toro Gordo").
3. Confidence: `high` when two different pages list the same name for those dimensions; `medium` when one page does; `low` when you inferred it (for example from a photo caption or a partial list). Never mark `high` with only one page.
4. If the published dimensions differ from ours, still name the size and add `dimsFlag` with the published `ring` and/or `length` and its `sourceUrl`.
5. If no page names the size, set `name` to null with confidence `low` and say why in `note`.

Rules:
- The name must not be just the shape word again ("Robusto" for a Robusto is not a name; leave null unless the maker really calls the size "Robusto").
- Keep names under 60 characters, in the maker's spelling and capitalisation, without the brand or series prefix.
- Cite every page in `sourceUrls`. Do not write anything except the output file.

Output: write ONE file `<outDir>/research/names/<batch>-<model>.json` shaped exactly:
{ "model": "<your model name>", "batch": "<batch>", "names": [ { "vitolaId": "<id>", "name": "<name or null>", "confidence": "high|medium|low", "sourceUrls": ["https://..."], "note": "<optional>", "dimsFlag": { "ring": 50, "length": 5.5, "sourceUrl": "https://..." } } ] }
Every vitola in the input gets exactly one entry. Reply with only the output path and counts per confidence.
```

- [ ] **Step 3: Append the Pass 2 section to the README**

```markdown
## Pass 2: web-verified folds and names

1. `npx tsx scripts/catalog-cleanup/gen-research-targets.ts` writes `research/targets/folds.json` and `research/targets/names-NN.json` (40 vitolas per batch, biggest brands first).
2. Claude runs research agents: for folds, TWO agents on different models per batch, each writing `research/verdicts/folds-<model>.json`, using `scripts/catalog-cleanup/research/fold-verdict-prompt.md`; for names, one agent per batch writing `research/names/<batch>-<model>.json`, using `name-vitolas-prompt.md`.
3. `npx tsx scripts/catalog-cleanup/gen-verify-folds.ts` writes `ops-verify-folds.json` (both models agreed, seeded, no references), `review.json` (everything else, with both reasons and links) and `resolved-keep.json`.
4. Dave answers `review.json`: copy it to `review-decided.json` as a list of `{ "targetId": "...", "decision": "fold|keep|merge_a_into_b|merge_b_into_a" }`, then re-run `gen-verify-folds.ts --decisions review-decided.json`. Decided items become reviewed ops.
5. `preview`, approve, `execute` the fold ops (same executor commands as pass 1).
6. `npx tsx scripts/catalog-cleanup/gen-name-vitolas.ts` writes `ops-name-vitolas.json` (high confidence only), `names-pending.json` (medium, low, disagreements), `dims-flags.json`, `names-rejected.txt`.
7. `preview` (spot-check the QA rows and their links), `execute`.

Name research can run in rounds: every batch file that exists is used; batches not yet researched are simply absent from the ops file. Re-running a batch with the same model replaces its earlier answers.
```

- [ ] **Step 4: Gate and commit**

Run: `npx tsc --noEmit -p tsconfig.json && npm run test:unit && npx eslint lib/catalog-cleanup scripts/catalog-cleanup && npm run build`
Expected: all green; README has no em dashes (`grep -c '—' scripts/catalog-cleanup/README.md` prints 0).

```bash
git add scripts/catalog-cleanup/research/fold-verdict-prompt.md scripts/catalog-cleanup/research/name-vitolas-prompt.md scripts/catalog-cleanup/README.md
git commit -m "docs(catalog-cleanup): pass-2 research prompts and runbook

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Manual steps after the branch merges (Dave + Claude)

1. `gen-research-targets` (needs a token). Expect: about 144 fold targets plus near-dupes; about 107 name batches at 40 per batch.
2. Fold research: 2 agents (fable, opus) over `folds.json`, split into files of at most 40 targets. Then `gen-verify-folds`, preview, Dave reviews `review.json`, decisions, execute.
3. Name research in rounds of ~8 parallel agents (a round covers ~320 vitolas); first round = the 32 big brands. `gen-name-vitolas` after each round, preview, execute; later rounds append.
4. Revoke the token after each session.
