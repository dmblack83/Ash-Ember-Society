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
