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

const MODEL_FAMILIES = ["fable", "opus", "sonnet", "haiku", "gpt", "gemini", "claude"] as const;

/** Collapses a free-text model name to a canonical family so a re-run of the same underlying
 *  model under a different label (e.g. "opus" and "Claude Opus 5.5") never counts as a second
 *  distinct reviewer. Checked in MODEL_FAMILIES order; falls back to the lowercased, trimmed
 *  input when nothing matches. */
export function modelFamily(model: string): string {
  const m = model.toLowerCase().trim();
  for (const f of MODEL_FAMILIES) if (m.includes(f)) return f;
  return m;
}

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
    if ((r.urls as string[]).some((u) => !/^https?:\/\//.test(u))) fail(`verdicts[${i}].urls must be http(s) urls`);
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

  /* last verdict per (target, model family) wins; family collapses free-text model-name variants */
  const byTarget = new Map<string, Map<string, Verdict & { model: string }>>();
  for (const f of args.verdictFiles) for (const v of f.verdicts) {
    if (!byTarget.has(v.targetId)) byTarget.set(v.targetId, new Map());
    byTarget.get(v.targetId)!.set(modelFamily(f.model), { ...v, model: f.model });
  }
  const targetIds = new Set(args.targets.map((t) => t.id));
  const orphans = [...byTarget.keys()].filter((id) => !targetIds.has(id));

  const emitted: Array<{ op: FoldLineOp; t: FoldTarget; reviewed: boolean; verdicts: ReviewItem["verdicts"] }> = [];
  const emit = (t: FoldTarget, source: string, target: string, reviewed: boolean, verdicts: Array<Verdict & { model: string }>) => {
    const op: FoldLineOp = {
      type: "fold_line", sourceLineId: source, targetLineId: target, childFills: {},
      generator: reviewed ? "verify-folds:dave" : "verify-folds", reviewed,
      reason: reviewed ? `Dave decided: fold (${label(t)})` : `web-verified: ${verdicts.map((v) => `${v.model}: ${v.reason}`).join(" | ")}`,
      evidence: verdicts.flatMap((v) => v.urls.map((url) => ({ url }))),
      ...(!reviewed && verdicts.length >= 2 ? { agreement: { modelA: verdicts[0].model, modelB: verdicts[1].model } } : {}),
    };
    emitted.push({ op, t, reviewed, verdicts: verdicts.map((v) => ({ model: v.model, answer: v.answer, reason: v.reason, urls: v.urls })) });
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
      emit(t, dir[0], dir[1], true, verdicts); continue;
    }

    if (verdicts.length < 2) { toReview(`only ${verdicts.length} model(s) answered`); continue; }
    if (verdicts.some((v) => v.answer === "unsure")) { toReview("a model answered unsure"); continue; }
    if (verdicts.some((v) => v.urls.length === 0)) { toReview("a model cited no url"); continue; }
    if (verdicts.every((v) => v.answer === "keep")) { resolvedKeep.push(t.id); summary.resolvedKeep++; continue; }
    const invalid = verdicts.find((v) => v.answer !== "keep" && ((t.kind === "fold" && v.answer !== "fold") || (t.kind === "near_dupe" && v.answer === "fold")));
    if (invalid) { toReview(`answer "${invalid.answer}" is not valid for a ${t.kind} target`); continue; }
    const dirs = verdicts.map((v) => direction(v.answer));
    if (dirs.some((d) => d === null)) { toReview("models disagree (fold vs keep)"); continue; }
    if (t.kind === "near_dupe" && new Set(dirs.map((d) => d!.join(">"))).size > 1) { toReview("models disagree on merge direction"); continue; }
    const [source, target] = dirs[0]!;
    const sourceLine = source === t.a.lineId ? a : b;
    const children = args.vitolas.filter((vt) => vt.line_id === source);
    const liveCommunity = sourceLine.community_added || children.some((c) => c.community_added);
    const liveRefs = children.reduce((s, c) => s + (args.refs[c.id] ?? 0), 0);
    if (liveCommunity) { toReview("source line is community-added"); continue; }
    if (liveRefs > 0) { toReview(`source line has ${liveRefs} real references`); continue; }
    emit(t, source, target, false, verdicts); summary.autoFolds++;
  }
  /* conflicts: a line folded away by two ops, or folded away while also absorbing another line.
   * Every op involved goes to review (decided ops included - Dave resolves), the rest ship. */
  const asSource = new Map<string, number>(), asTarget = new Map<string, number>();
  for (const { op } of emitted) {
    asSource.set(op.sourceLineId, (asSource.get(op.sourceLineId) ?? 0) + 1);
    asTarget.set(op.targetLineId, (asTarget.get(op.targetLineId) ?? 0) + 1);
  }
  const conflictLines = new Set([...asSource.keys()].filter((id) => asSource.get(id)! > 1 || asTarget.has(id)));
  const touches = (op: FoldLineOp) => conflictLines.has(op.sourceLineId) || conflictLines.has(op.targetLineId);
  const shares = (x: FoldLineOp, y: FoldLineOp) => [x.sourceLineId, x.targetLineId].some((id) => conflictLines.has(id) && (id === y.sourceLineId || id === y.targetLineId));
  for (const e of emitted) {
    if (!touches(e.op)) { ops.push(e.op); continue; }
    const others = emitted.filter((o) => o !== e && shares(e.op, o.op)).map((o) => o.t.id);
    review.push({ targetId: e.t.id, label: label(e.t), why: `conflicts with another fold in this run (${others.join(", ")})`, verdicts: e.verdicts });
    summary.review++;
    if (!e.reviewed) summary.autoFolds--;
  }
  return { ops, resolvedKeep, review, skipped, summary, orphans };
}
