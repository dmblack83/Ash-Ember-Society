import { UUID_RE } from "./sql";
import type { Op, VitolaRow, WriteNameOp } from "./types";
import { modelFamily } from "./verify-folds";

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

  /* last result per (vitola, model family) wins; family collapses free-text model-name variants */
  const byVitola = new Map<string, Map<string, NameResult & { file: string }>>();
  for (const f of args.nameFiles) for (const r of f.names) {
    summary.results++;
    if (!byVitola.has(r.vitolaId)) byVitola.set(r.vitolaId, new Map());
    byVitola.get(r.vitolaId)!.set(modelFamily(f.model), { ...r, file: `${f.model}/${f.batch}` });
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
