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
const HTTP_RE = /^https?:\/\//;

/** trim + strip a single trailing slash, so "https://a" and "https://a/" count as one source */
const normUrl = (u: string): string => {
  const t = u.trim();
  return t.endsWith("/") ? t.slice(0, -1) : t;
};

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
    if ((r.sourceUrls as string[]).some((u) => !HTTP_RE.test(u))) fail(`names[${i}].sourceUrls must be http(s) urls`);
    if (r.note !== undefined && typeof r.note !== "string") fail(`names[${i}].note must be a string`);
    if (r.dimsFlag !== undefined) {
      if (!isObj(r.dimsFlag)) fail(`names[${i}].dimsFlag must be an object`);
      const d = r.dimsFlag as Record<string, unknown>;
      if (d.ring !== undefined && typeof d.ring !== "number") fail(`names[${i}].dimsFlag.ring must be a number`);
      if (d.length !== undefined && typeof d.length !== "number") fail(`names[${i}].dimsFlag.length must be a number`);
      if (typeof d.sourceUrl !== "string") fail(`names[${i}].dimsFlag.sourceUrl must be a string`);
      if (!HTTP_RE.test(d.sourceUrl as string)) fail(`names[${i}].dimsFlag.sourceUrl must be an http(s) url`);
    }
  });
  return o as unknown as NameFile;
}

const label = (v: VitolaRow) => `${v.brand ?? "?"} / ${v.series ?? "-"} / ${v.format ?? "?"} ${v.length_inches ?? "?"}x${v.ring_gauge ?? "?"}`;

/** Returns the matched brand/series text (as stored on the vitola) when `clean` equals,
 *  case-insensitively, the brand, the series, or "brand series" - null parts are skipped. */
const matchesBrandSeries = (v: VitolaRow, clean: string): string | null => {
  const lc = clean.toLowerCase();
  const brand = v.brand?.trim();
  const series = v.series?.trim();
  const candidates = [brand, series, brand && series ? `${brand} ${series}` : undefined].filter((c): c is string => !!c);
  return candidates.find((c) => c.toLowerCase() === lc) ?? null;
};

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
    for (const r of results) if (r.dimsFlag) { dimsFlags.push({ vitolaId, label: label(v), ours: { ring: v.ring_gauge, length: v.length_inches }, published: { ...(r.dimsFlag.ring !== undefined ? { ring: r.dimsFlag.ring } : {}), ...(r.dimsFlag.length !== undefined ? { length: r.dimsFlag.length } : {}) }, sourceUrl: normUrl(r.dimsFlag.sourceUrl) }); summary.dimsFlags++; }
    const named = results.filter((r) => r.name !== null);
    if (named.length === 0) { summary.notFound++; continue; }
    if (v.name !== null) { summary.alreadyNamed++; continue; }

    /* every non-null cleaned name, independent of whether it will later be rejected -
     * a rejected candidate still counts toward cross-model disagreement */
    const cleanedNamed = named.map((r) => ({ ...r, clean: (r.name as string).trim().replace(/\s+/g, " ") }));
    const distinctAll = new Set(cleanedNamed.map((r) => r.clean.toLowerCase()));

    const valid: Array<NameResult & { file: string; clean: string; urls: string[] }> = [];
    for (const r of cleanedNamed) {
      const clean = r.clean;
      if (!clean) { rejected.push(`${r.file}: empty name for ${vitolaId}`); summary.rejected++; continue; }
      if (clean.length > 120) { rejected.push(`${r.file}: name over 120 chars for ${vitolaId}`); summary.rejected++; continue; }
      if (v.format && clean.toLowerCase() === v.format.trim().toLowerCase()) { rejected.push(`${r.file}: name equals the format "${v.format}" for ${vitolaId}`); summary.rejected++; continue; }
      const brandSeries = matchesBrandSeries(v, clean);
      if (brandSeries) { rejected.push(`${r.file}: name equals the line's brand/series "${brandSeries}" for ${vitolaId}`); summary.rejected++; continue; }
      const urls = r.sourceUrls.map(normUrl);
      if (r.confidence === "high" && new Set(urls).size < 2) { rejected.push(`${r.file}: high confidence needs two distinct sources for ${vitolaId}`); summary.rejected++; continue; }
      valid.push({ ...r, clean, urls });
    }

    if (distinctAll.size > 1) {
      summary.disagreements++; summary.pending++;
      pending.push({
        vitolaId, label: label(v),
        name: cleanedNamed[0].clean, confidence: cleanedNamed[0].confidence,
        sourceUrls: [...new Set(cleanedNamed.flatMap((r) => r.sourceUrls.map(normUrl)))],
        note: `models disagree: ${cleanedNamed.map((r) => `${r.file.split("/")[0]} "${r.clean}"`).join(" vs ")}`,
      });
      continue;
    }

    if (valid.length === 0) continue;
    const best = [...valid].sort((a, b) => rank(a.confidence) - rank(b.confidence))[0];
    const urls = [...new Set(valid.flatMap((r) => r.urls))];
    /* a disputed size is never auto-named: the name may belong to the published size, not ours */
    const disputed = results.find((r) => r.dimsFlag)?.dimsFlag;
    if (disputed) {
      pending.push({ vitolaId, label: label(v), name: best.clean, confidence: best.confidence, sourceUrls: urls, note: `dims disagree with published size (${disputed.ring ?? "?"}/${disputed.length ?? "?"})` }); summary.pending++;
    } else if (rank(best.confidence) <= rank(min)) {
      const op: WriteNameOp = { type: "write_name", vitolaId, name: best.clean, confidence: best.confidence, sourceUrl: urls[0], evidence: urls.map((url) => ({ url })),
        reason: `web research: ${best.note ?? "dims-matched published size name"}`, generator: "name-vitolas", reviewed: false };
      ops.push(op); summary.ops++;
    } else {
      pending.push({ vitolaId, label: label(v), name: best.clean, confidence: best.confidence, sourceUrls: urls, ...(best.note ? { note: best.note } : {}) }); summary.pending++;
    }
  }
  return { ops, pending, dimsFlags, rejected, summary };
}
