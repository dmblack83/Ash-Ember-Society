import type { CatalogContext, Op, VitolaRow } from "./types";
import { validateVitolaFields } from "./ops";

export interface Blocked { opIndex: number; reason: string }

export const normIdent = (brand: string, series: string | null): string =>
  `${brand.trim().toLowerCase()}|${(series ?? "").trim().toLowerCase()}`;

const childrenOf = (ctx: CatalogContext, lineId: string): VitolaRow[] =>
  [...ctx.vitolas.values()].filter((v) => v.line_id === lineId);

export function checkPreconditions(ops: Op[], ctx: CatalogContext): Blocked[] {
  const blocked: Blocked[] = [];
  const mergedAway = new Set<string>();
  const foldedAway = new Set<string>();
  const block = (i: number, reason: string) => blocked.push({ opIndex: i, reason });

  /* Running view of vitola -> line, updated as folds execute in order, so a
     later op sees children an earlier fold in this same run already moved
     into its source line (the generator can legitimately emit childFills for
     such a child; the static ctx.vitolas.line_id would still show it under
     its original line and wrongly block it). */
  const lineOf = new Map<string, string | null>();
  for (const v of ctx.vitolas.values()) lineOf.set(v.id, v.line_id);
  const currentKids = (lineId: string): VitolaRow[] =>
    [...ctx.vitolas.values()].filter((v) => lineOf.get(v.id) === lineId);

  ops.forEach((op, i) => {
    switch (op.type) {
      case "fold_line": {
        const src = ctx.lines.get(op.sourceLineId);
        const tgt = ctx.lines.get(op.targetLineId);
        if (!src) return block(i, `source line ${op.sourceLineId} not found`);
        if (!tgt) return block(i, `target line ${op.targetLineId} not found`);
        if (foldedAway.has(op.sourceLineId)) return block(i, `line ${op.sourceLineId} already folded earlier in this run`);
        if (foldedAway.has(op.targetLineId)) return block(i, `target line ${op.targetLineId} was folded away earlier in this run`);
        const kids = currentKids(src.id);
        if (!op.reviewed) {
          if (src.community_added || kids.some((k) => k.community_added)) return block(i, `unreviewed fold of a community-added line (${src.brand} / ${src.series ?? "-"})`);
          const referenced = kids.filter((k) => (ctx.refs[k.id] ?? 0) > 0);
          if (referenced.length) return block(i, `unreviewed fold: ${referenced.length} child vitola(s) have real references`);
        }
        for (const [vid, fill] of Object.entries(op.childFills)) {
          const kid = ctx.vitolas.get(vid);
          if (!kid || lineOf.get(vid) !== src.id) { block(i, `childFills vitola ${vid} is not a child of the source line`); continue; }
          if (mergedAway.has(vid)) block(i, `childFills vitola ${vid} is merged away in this run`);
          if (fill.shade !== undefined && kid.shade !== null) block(i, `child ${vid} already has shade "${kid.shade}"`);
          if (fill.wrapper !== undefined && kid.wrapper !== null) block(i, `child ${vid} already has wrapper "${kid.wrapper}"`);
        }
        for (const k of kids) lineOf.set(k.id, op.targetLineId);
        foldedAway.add(op.sourceLineId);
        return;
      }
      case "rename_line": {
        const line = ctx.lines.get(op.lineId);
        if (!line) return block(i, `line ${op.lineId} not found`);
        if (foldedAway.has(op.lineId)) return block(i, `line ${op.lineId} was folded away earlier in this run`);
        const ident = normIdent(op.brand, op.series);
        for (const other of ctx.lines.values()) {
          if (other.id !== op.lineId && !foldedAway.has(other.id) && normIdent(other.brand, other.series) === ident) {
            return block(i, `rename collides with line ${other.id} (${other.brand} / ${other.series ?? "-"}); emit fold_line instead`);
          }
        }
        return;
      }
      case "update_vitola": {
        const v = ctx.vitolas.get(op.vitolaId);
        if (!v) return block(i, `vitola ${op.vitolaId} not found`);
        if (mergedAway.has(op.vitolaId)) return block(i, `vitola ${op.vitolaId} is merged away in this run`);
        const errs = validateVitolaFields(op.fields, "fields");
        if (errs.length) return block(i, errs.join("; "));
        return;
      }
      case "write_name": {
        const v = ctx.vitolas.get(op.vitolaId);
        if (!v) return block(i, `vitola ${op.vitolaId} not found`);
        if (mergedAway.has(op.vitolaId)) return block(i, `vitola ${op.vitolaId} is merged away in this run`);
        if (v.name !== null) return block(i, `vitola already has a name ("${v.name}")`);
        return;
      }
      case "merge_vitola": {
        const s = ctx.vitolas.get(op.sourceVitolaId);
        const t = ctx.vitolas.get(op.targetVitolaId);
        if (!s) return block(i, `source vitola ${op.sourceVitolaId} not found`);
        if (!t) return block(i, `target vitola ${op.targetVitolaId} not found`);
        if (mergedAway.has(s.id) || mergedAway.has(t.id)) return block(i, `a vitola in this merge is merged away earlier in this run`);
        if (s.line_id !== t.line_id) return block(i, `source and target are on different lines`);
        if (!op.reviewed && (ctx.refs[s.id] ?? 0) > 0) return block(i, `unreviewed merge: source has ${ctx.refs[s.id]} real reference(s)`);
        mergedAway.add(s.id);
        return;
      }
    }
  });
  return blocked;
}

const cell = (v: unknown) => (v === null || v === undefined ? "(null)" : String(v)).replace(/\|/g, "\\|");
const vitolaLabel = (v: VitolaRow) => `${cell(v.brand)} / ${cell(v.series)} / ${cell(v.name)} / ${cell(v.format)} ${cell(v.length_inches)}x${cell(v.ring_gauge)} ${cell(v.wrapper)} ${cell(v.shade)}`;

function describe(op: Op, ctx: CatalogContext): string {
  switch (op.type) {
    case "fold_line": {
      const s = ctx.lines.get(op.sourceLineId), t = ctx.lines.get(op.targetLineId);
      const fills = Object.entries(op.childFills).map(([vid, f]) => {
        const k = ctx.vitolas.get(vid);
        return [f.shade !== undefined ? `shade: ${cell(k?.shade)} → ${f.shade}` : "", f.wrapper !== undefined ? `wrapper: ${cell(k?.wrapper)} → ${f.wrapper}` : ""].filter(Boolean).join(", ");
      }).filter(Boolean).join("; ");
      return `${cell(s?.brand)} / ${cell(s?.series)} (${childrenOf(ctx, op.sourceLineId).length} vitolas) → ${cell(t?.brand)} / ${cell(t?.series)}${fills ? ` [${fills}]` : ""}`;
    }
    case "rename_line": { const l = ctx.lines.get(op.lineId); return `${cell(l?.brand)} / ${cell(l?.series)} → ${op.brand} / ${cell(op.series)}`; }
    case "update_vitola": {
      const v = ctx.vitolas.get(op.vitolaId);
      const changes = Object.entries(op.fields).map(([k, val]) => `${k}: ${cell((v as never)?.[k])} → ${cell(val)}`).join(", ");
      return `${v ? vitolaLabel(v) : op.vitolaId} [${changes}]`;
    }
    case "merge_vitola": { const s = ctx.vitolas.get(op.sourceVitolaId), t = ctx.vitolas.get(op.targetVitolaId); return `${s ? vitolaLabel(s) : op.sourceVitolaId} → ${t ? vitolaLabel(t) : op.targetVitolaId}`; }
    case "write_name": { const v = ctx.vitolas.get(op.vitolaId); return `${v ? vitolaLabel(v) : op.vitolaId} [name: (null) → ${op.name}]${op.confidence ? ` (${op.confidence})` : ""}`; }
  }
}

export function renderPreview(args: {
  ops: Op[]; ctx: CatalogContext; blocked: Blocked[]; generator: string;
  sampleSize?: number; qaSample?: number[]; warnings?: string[];
}): string {
  const { ops, ctx, blocked, generator } = args;
  const sampleSize = args.sampleSize ?? 20;
  const qa = new Set(args.qaSample ?? []);
  const out: string[] = [`# Catalog cleanup preview`, ``, `Generator: ${generator}  `, `Ops: ${ops.length}  `, `Blocked: ${blocked.length}`, ``];
  for (const w of args.warnings ?? []) out.push(`> WARNING: ${w}`, ``);
  if (ops.length === 0) { out.push(`Nothing to do.`); return out.join("\n"); }

  const byType = new Map<string, number[]>();
  ops.forEach((op, i) => byType.set(op.type, [...(byType.get(op.type) ?? []), i]));
  out.push(`| type | count |`, `|---|---|`);
  for (const [t, idx] of byType) out.push(`| ${t} | ${idx.length} |`);
  out.push(``);

  const touched = new Set<string>();
  for (const op of ops) {
    if (op.type === "fold_line") childrenOf(ctx, op.sourceLineId).forEach((k) => touched.add(k.id));
    if (op.type === "update_vitola" || op.type === "write_name") touched.add(op.vitolaId);
    if (op.type === "merge_vitola") { touched.add(op.sourceVitolaId); touched.add(op.targetVitolaId); }
  }
  const withRefs = [...touched].filter((id) => (ctx.refs[id] ?? 0) > 0);
  out.push(`## Real references`, ``, `${touched.size} vitolas touched, ${withRefs.length} with real references (all must carry reviewed: true).`, ``);

  for (const [t, idx] of byType) {
    out.push(`## ${t} (${idx.length})`, ``, `| # | evidence | change |`, `|---|---|---|`);
    const shown = [...new Set([...idx.filter((i) => qa.has(i)), ...idx])].slice(0, sampleSize);
    for (const i of shown) {
      const op = ops[i];
      const ev = op.evidence?.[0]?.url ?? (op.type === "write_name" ? op.sourceUrl ?? "" : "");
      out.push(`| ${i}${qa.has(i) ? " QA sample" : ""} | ${ev} | ${describe(op, ctx)} |`);
    }
    if (idx.length > shown.length) out.push(`| … | | ${idx.length - shown.length} more |`);
    out.push(``);
  }

  out.push(`## Blocked (${blocked.length})`, ``);
  for (const b of blocked) out.push(`- op ${b.opIndex} (${ops[b.opIndex]?.type}): ${b.reason}`);
  if (blocked.length === 0) out.push(`None.`);
  return out.join("\n");
}
