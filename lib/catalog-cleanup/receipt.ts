import { VITOLA_COLUMN_LIST } from "./catalog-read";
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

export function buildReceipt(args: { runId: string; opsFile: string; ops: Op[]; lines: LineRow[]; vitolas: VitolaRow[]; refs: RefRow[]; touched?: { lineIds: string[]; vitolaIds: string[] } }): Receipt {
  const lines = new Map(args.lines.map((l) => [l.id, l]));
  const vitolas = new Map(args.vitolas.map((v) => [v.id, v]));
  const need = (ok: boolean, what: string) => { if (!ok) throw new Error(`receipt: missing snapshot for ${what}`); };
  for (const op of args.ops) {
    switch (op.type) {
      case "fold_line":
        need(lines.has(op.sourceLineId), `line ${op.sourceLineId}`);
        need(lines.has(op.targetLineId), `line ${op.targetLineId}`);
        for (const vid of Object.keys(op.childFills)) need(vitolas.has(vid), `vitola ${vid}`);
        break;
      case "rename_line": need(lines.has(op.lineId), `line ${op.lineId}`); break;
      case "update_vitola": case "write_name": need(vitolas.has(op.vitolaId), `vitola ${op.vitolaId}`); break;
      case "merge_vitola": need(vitolas.has(op.sourceVitolaId), `vitola ${op.sourceVitolaId}`); need(vitolas.has(op.targetVitolaId), `vitola ${op.targetVitolaId}`); break;
    }
  }
  if (args.touched) {
    for (const lid of args.touched.lineIds) need(lines.has(lid), `line ${lid}`);
    for (const vid of args.touched.vitolaIds) need(vitolas.has(vid), `vitola ${vid}`);
  }
  return {
    runId: args.runId, executedAt: new Date().toISOString(), opsFile: args.opsFile, committed: false, ops: args.ops,
    snapshots: { lines: args.lines, vitolas: args.vitolas, refs: args.refs },
  };
}

function vitolaInsert(v: VitolaRow): string {
  const row = v as unknown as Record<string, unknown>;
  const vals = VITOLA_COLUMN_LIST.map((c) => (c === "id" ? uuidLit(v.id) : c === "line_id" ? (v.line_id ? uuidLit(v.line_id) : "null") : c === "created_at" ? (v.created_at === null ? "now()" : lit(v.created_at)) : lit(row[c] as never)));
  return `insert into cigar_catalog (${VITOLA_COLUMN_LIST.join(", ")}) values (${vals.join(", ")}) on conflict (id) do nothing;`;
}

function lineInsert(l: LineRow): string {
  const createdAt = l.created_at === null ? "now()" : lit(l.created_at);
  return `insert into cigar_lines (id, brand, series, community_added, approved, created_at) values (${uuidLit(l.id)}, ${lit(l.brand)}, ${lit(l.series)}, ${lit(l.community_added)}, ${lit(l.approved)}, ${createdAt}) on conflict (id) do nothing;`;
}

/** Reverse statements carry drift guards ("is not distinct from" the forward
 *  value), so a row edited after the run is left alone rather than clobbered. */
export function reverseSql(receipt: Receipt): string[] {
  const lines = new Map(receipt.snapshots.lines.map((l) => [l.id, l]));
  const vitolas = new Map(receipt.snapshots.vitolas.map((v) => [v.id, v]));
  const out: string[] = [];
  const reversed = [...receipt.ops].reverse();
  /* Every folded-away line comes back FIRST: a later merge_vitola reverse
     re-inserts a vitola whose line_id may be a line this run deleted, and
     cigar_catalog.line_id is on delete restrict, so the line must exist
     before any cigar_catalog insert in the batch. */
  for (const op of reversed) {
    if (op.type === "fold_line") out.push(lineInsert(lines.get(op.sourceLineId)!));
  }
  for (const op of reversed) {
    switch (op.type) {
      case "fold_line": {
        const src = lines.get(op.sourceLineId)!;
        for (const v of receipt.snapshots.vitolas) {
          if (v.line_id === src.id) out.push(`update cigar_catalog set line_id = ${uuidLit(src.id)}, brand = ${lit(v.brand)}, series = ${lit(v.series)} where id = ${uuidLit(v.id)};`);
        }
        for (const [vid, fill] of Object.entries(op.childFills)) {
          if (fill.shade !== undefined) out.push(`update cigar_catalog set shade = null where id = ${uuidLit(vid)} and shade is not distinct from ${lit(fill.shade)};`);
          if (fill.wrapper !== undefined) out.push(`update cigar_catalog set wrapper = null where id = ${uuidLit(vid)} and wrapper is not distinct from ${lit(fill.wrapper)};`);
        }
        break;
      }
      case "rename_line": {
        const l = lines.get(op.lineId)!;
        out.push(`update cigar_lines set brand = ${lit(l.brand)}, series = ${lit(l.series)} where id = ${uuidLit(l.id)} and brand is not distinct from ${lit(op.brand)} and series is not distinct from ${lit(op.series)};`);
        break;
      }
      case "update_vitola": {
        const v = vitolas.get(op.vitolaId)!;
        const keys = VITOLA_FIELD_KEYS.filter((k) => k in op.fields);
        const sets = keys.map((k) => `${k} = ${lit(v[k] as never)}`);
        const guards = keys.map((k) => ` and ${k} is not distinct from ${lit(op.fields[k] as never)}`).join("");
        out.push(`update cigar_catalog set ${sets.join(", ")} where id = ${uuidLit(v.id)}${guards};`);
        break;
      }
      case "write_name": {
        const v = vitolas.get(op.vitolaId)!;
        out.push(`update cigar_catalog set name = ${lit(v.name)} where id = ${uuidLit(v.id)} and name is not distinct from ${lit(op.name)};`);
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
