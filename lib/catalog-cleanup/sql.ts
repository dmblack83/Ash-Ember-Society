import type { CatalogContext, Op, VitolaFields } from "./types";
import { VITOLA_FIELD_KEYS } from "./types";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Postgres literal. Strings are single-quoted with '' doubling; backslashes are literal
 *  (standard_conforming_strings is on). Arrays render as text[]. */
export function lit(v: string | number | boolean | string[] | null | undefined): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`lit: number must be finite, got ${v}`);
    return String(v);
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return "array[]::text[]";
    return `array[${v.map((s) => lit(s)).join(",")}]::text[]`;
  }
  return `'${v.replace(/'/g, "''")}'`;
}

export function uuidLit(id: string): string {
  if (typeof id !== "string" || !UUID_RE.test(id)) throw new Error(`uuidLit: not a uuid: ${JSON.stringify(id)}`);
  return `'${id.toLowerCase()}'::uuid`;
}

function setClause(fields: VitolaFields): string {
  const parts: string[] = [];
  for (const k of VITOLA_FIELD_KEYS) {
    if (k in fields) parts.push(`${k} = ${lit(fields[k] as never)}`);
  }
  if (parts.length === 0) throw new Error("update_vitola: no fields");
  return parts.join(", ");
}

/** Forward SQL statements for one op. Each returned string is one statement ending in ';'. */
export function forwardSql(op: Op, ctx: CatalogContext): string[] {
  switch (op.type) {
    case "fold_line": {
      const target = ctx.lines.get(op.targetLineId);
      if (!target) throw new Error(`fold_line: target line ${op.targetLineId} not in context`);
      const out = [
        `update cigar_catalog set line_id = ${uuidLit(target.id)}, brand = ${lit(target.brand)}, series = ${lit(target.series)} where line_id = ${uuidLit(op.sourceLineId)};`,
      ];
      for (const [vid, fill] of Object.entries(op.childFills)) {
        const sets: string[] = [];
        if (fill.shade !== undefined) sets.push(`shade = coalesce(shade, ${lit(fill.shade)})`);
        if (fill.wrapper !== undefined) sets.push(`wrapper = coalesce(wrapper, ${lit(fill.wrapper)})`);
        if (sets.length) out.push(`update cigar_catalog set ${sets.join(", ")} where id = ${uuidLit(vid)};`);
      }
      out.push(`delete from cigar_lines where id = ${uuidLit(op.sourceLineId)};`);
      return out;
    }
    case "rename_line":
      return [`update cigar_lines set brand = ${lit(op.brand)}, series = ${lit(op.series)} where id = ${uuidLit(op.lineId)};`];
    case "update_vitola":
      return [`update cigar_catalog set ${setClause(op.fields)} where id = ${uuidLit(op.vitolaId)};`];
    case "merge_vitola":
      return [`select merge_catalog_vitolas(${uuidLit(op.sourceVitolaId)}, ${uuidLit(op.targetVitolaId)});`];
    case "write_name":
      return [`update cigar_catalog set name = ${lit(op.name)} where id = ${uuidLit(op.vitolaId)} and name is null;`];
  }
}
