import { lit, uuidLit } from "./sql";
import type { CatalogContext, LineRow, Op, Receipt, RefRow, VitolaRow } from "./types";
import { VITOLA_FIELD_KEYS } from "./types";

export function collectTouched(ops: Op[], ctx: CatalogContext) {
  const lineIds = new Set<string>(), vitolaIds = new Set<string>(), mergeSourceIds: string[] = [];
  for (const op of ops) {
    switch (op.type) {
      case "fold_line":
        lineIds.add(op.sourceLineId); lineIds.add(op.targetLineId);
        for (const v of ctx.vitolas.values()) if (v.line_id === op.sourceLineId) vitolaIds.add(v.id);
        for (const vid of Object.keys(op.childFills)) vitolaIds.add(vid);
        break;
      case "rename_line": lineIds.add(op.lineId); break;
      case "update_vitola": case "write_name": vitolaIds.add(op.vitolaId); break;
      case "merge_vitola": vitolaIds.add(op.sourceVitolaId); vitolaIds.add(op.targetVitolaId); mergeSourceIds.push(op.sourceVitolaId); break;
    }
  }
  return { lineIds: [...lineIds], vitolaIds: [...vitolaIds], mergeSourceIds };
}

export function buildReceipt(args: { runId: string; opsFile: string; ops: Op[]; lines: LineRow[]; vitolas: VitolaRow[]; refs: RefRow[] }): Receipt {
  const lines = new Map(args.lines.map((l) => [l.id, l]));
  const vitolas = new Map(args.vitolas.map((v) => [v.id, v]));
  const need = (ok: boolean, what: string) => { if (!ok) throw new Error(`receipt: missing snapshot for ${what}`); };
  for (const op of args.ops) {
    switch (op.type) {
      case "fold_line": need(lines.has(op.sourceLineId), `line ${op.sourceLineId}`); need(lines.has(op.targetLineId), `line ${op.targetLineId}`); break;
      case "rename_line": need(lines.has(op.lineId), `line ${op.lineId}`); break;
      case "update_vitola": case "write_name": need(vitolas.has(op.vitolaId), `vitola ${op.vitolaId}`); break;
      case "merge_vitola": need(vitolas.has(op.sourceVitolaId), `vitola ${op.sourceVitolaId}`); need(vitolas.has(op.targetVitolaId), `vitola ${op.targetVitolaId}`); break;
    }
  }
  return {
    runId: args.runId, executedAt: new Date().toISOString(), opsFile: args.opsFile, committed: false, ops: args.ops,
    snapshots: { lines: args.lines, vitolas: args.vitolas, refs: args.refs },
  };
}

const VITOLA_INSERT_COLS = ["id", "line_id", "brand", "series", "name", "format", "ring_gauge", "length_inches", "wrapper", "shade", "wrapper_country", "binder_country", "filler_countries", "usage_count", "community_added", "approved", "image_url", "source_id"] as const;

function vitolaInsert(v: VitolaRow): string {
  const vals = VITOLA_INSERT_COLS.map((c) => (c === "id" ? uuidLit(v.id) : c === "line_id" ? (v.line_id ? uuidLit(v.line_id) : "null") : lit(v[c] as never)));
  return `insert into cigar_catalog (${VITOLA_INSERT_COLS.join(", ")}) values (${vals.join(", ")}) on conflict (id) do nothing;`;
}

export function reverseSql(receipt: Receipt): string[] {
  const lines = new Map(receipt.snapshots.lines.map((l) => [l.id, l]));
  const vitolas = new Map(receipt.snapshots.vitolas.map((v) => [v.id, v]));
  const out: string[] = [];
  for (const op of [...receipt.ops].reverse()) {
    switch (op.type) {
      case "fold_line": {
        const src = lines.get(op.sourceLineId)!;
        out.push(`insert into cigar_lines (id, brand, series, community_added, approved) values (${uuidLit(src.id)}, ${lit(src.brand)}, ${lit(src.series)}, ${lit(src.community_added)}, ${lit(src.approved)}) on conflict (id) do nothing;`);
        for (const v of receipt.snapshots.vitolas) {
          if (v.line_id === src.id) out.push(`update cigar_catalog set line_id = ${uuidLit(src.id)}, brand = ${lit(v.brand)}, series = ${lit(v.series)} where id = ${uuidLit(v.id)};`);
        }
        for (const [vid, fill] of Object.entries(op.childFills)) {
          const sets = [fill.shade !== undefined ? "shade = null" : "", fill.wrapper !== undefined ? "wrapper = null" : ""].filter(Boolean);
          if (sets.length) out.push(`update cigar_catalog set ${sets.join(", ")} where id = ${uuidLit(vid)};`);
        }
        break;
      }
      case "rename_line": {
        const l = lines.get(op.lineId)!;
        out.push(`update cigar_lines set brand = ${lit(l.brand)}, series = ${lit(l.series)} where id = ${uuidLit(l.id)};`);
        break;
      }
      case "update_vitola": {
        const v = vitolas.get(op.vitolaId)!;
        const sets = VITOLA_FIELD_KEYS.filter((k) => k in op.fields).map((k) => `${k} = ${lit(v[k] as never)}`);
        out.push(`update cigar_catalog set ${sets.join(", ")} where id = ${uuidLit(v.id)};`);
        break;
      }
      case "write_name": {
        const v = vitolas.get(op.vitolaId)!;
        out.push(`update cigar_catalog set name = ${lit(v.name)} where id = ${uuidLit(v.id)};`);
        break;
      }
      case "merge_vitola": {
        const s = vitolas.get(op.sourceVitolaId)!, t = vitolas.get(op.targetVitolaId)!;
        out.push(vitolaInsert(s));
        for (const r of receipt.snapshots.refs) {
          if (r.cigar_id === s.id) out.push(`update ${r.table} set cigar_id = ${uuidLit(s.id)} where id = ${uuidLit(r.id)} and cigar_id = ${uuidLit(t.id)};`);
        }
        out.push(`update cigar_catalog set usage_count = ${lit(t.usage_count)}, image_url = ${lit(t.image_url)} where id = ${uuidLit(t.id)};`);
        break;
      }
    }
  }
  return out;
}

/** Recorded reference rows that no longer point at the merge target cannot be repointed exactly. */
export function reverseWarnings(receipt: Receipt, currentRefs: RefRow[]): string[] {
  const now = new Map(currentRefs.map((r) => [`${r.table}:${r.id}`, r.cigar_id]));
  const targets = new Map(receipt.ops.filter((o) => o.type === "merge_vitola").map((o) => [(o as { sourceVitolaId: string }).sourceVitolaId, (o as { targetVitolaId: string }).targetVitolaId]));
  const out: string[] = [];
  for (const r of receipt.snapshots.refs) {
    const expected = targets.get(r.cigar_id);
    if (!expected) continue;
    if (now.get(`${r.table}:${r.id}`) !== expected) out.push(`${r.table} ${r.id} no longer points at ${expected}; it will not be repointed`);
  }
  return out;
}
