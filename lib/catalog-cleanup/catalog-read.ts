import type { MgmtClient } from "./mgmt-client";
import { uuidLit, UUID_RE } from "./sql";
import type { CatalogContext, LineRow, RefCounts, RefRow, RefTable, VitolaRow } from "./types";

/** Every non-generated cigar_catalog column. Snapshots, undo re-inserts, and the
 *  execute-time schema check all derive from this one list. */
export const VITOLA_COLUMN_LIST: readonly string[] = [
  "id", "line_id", "brand", "series", "name", "format", "ring_gauge", "length_inches", "wrapper", "shade",
  "wrapper_country", "binder_country", "filler_countries", "usage_count", "community_added", "approved",
  "image_url", "source_id", "strength",
];
export const VITOLA_COLUMNS = VITOLA_COLUMN_LIST.join(", ");
export const LINE_COLUMNS = "id, brand, series, community_added, approved, created_at";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error(`expected a number, got ${JSON.stringify(v)}`);
  return n;
};
const bool = (v: unknown): boolean => v === true || v === "t" || v === "true";
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const textArray = (v: unknown): string[] | null => {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.startsWith("{") && v.endsWith("}")) {
    const inner = v.slice(1, -1);
    if (inner === "") return [];
    return inner.match(/"(?:[^"\\]|\\.)*"|[^,]+/g)!.map((s) => (s.startsWith("\"") ? s.slice(1, -1).replace(/\\(.)/g, "$1") : s));
  }
  throw new Error(`expected a text array, got ${JSON.stringify(v)}`);
};
const id = (v: unknown, field: string): string => {
  if (typeof v !== "string" || !UUID_RE.test(v)) throw new Error(`${field} must be a uuid, got ${JSON.stringify(v)}`);
  return v.toLowerCase();
};

export function normalizeVitola(raw: Record<string, unknown>): VitolaRow {
  return {
    id: id(raw.id, "id"),
    line_id: raw.line_id === null || raw.line_id === undefined ? null : id(raw.line_id, "line_id"),
    brand: str(raw.brand), series: str(raw.series), name: str(raw.name), format: str(raw.format),
    ring_gauge: num(raw.ring_gauge), length_inches: num(raw.length_inches),
    wrapper: str(raw.wrapper), shade: str(raw.shade), wrapper_country: str(raw.wrapper_country),
    binder_country: str(raw.binder_country), filler_countries: textArray(raw.filler_countries),
    usage_count: num(raw.usage_count) ?? 0,
    community_added: bool(raw.community_added), approved: bool(raw.approved),
    image_url: str(raw.image_url), source_id: str(raw.source_id), strength: str(raw.strength),
  };
}

export function normalizeLine(raw: Record<string, unknown>): LineRow {
  const brand = str(raw.brand);
  if (!brand) throw new Error(`line ${String(raw.id)}: brand is required`);
  return {
    id: id(raw.id, "id"), brand, series: str(raw.series), community_added: bool(raw.community_added), approved: bool(raw.approved),
    created_at: str(raw.created_at),
  };
}

const idList = (ids: string[]) => `any(array[${ids.map(uuidLit).join(",")}])`;

export async function fetchLines(client: MgmtClient): Promise<LineRow[]> {
  return (await client.query(`select ${LINE_COLUMNS} from cigar_lines order by id;`)).map(normalizeLine);
}
export async function fetchVitolas(client: MgmtClient): Promise<VitolaRow[]> {
  return (await client.query(`select ${VITOLA_COLUMNS} from cigar_catalog order by id;`)).map(normalizeVitola);
}
export async function fetchLinesById(client: MgmtClient, ids: string[]): Promise<LineRow[]> {
  if (ids.length === 0) return [];
  return (await client.query(`select ${LINE_COLUMNS} from cigar_lines where id = ${idList(ids)};`)).map(normalizeLine);
}
export async function fetchVitolasById(client: MgmtClient, ids: string[]): Promise<VitolaRow[]> {
  if (ids.length === 0) return [];
  return (await client.query(`select ${VITOLA_COLUMNS} from cigar_catalog where id = ${idList(ids)};`)).map(normalizeVitola);
}
export async function fetchVitolasByLine(client: MgmtClient, lineIds: string[]): Promise<VitolaRow[]> {
  if (lineIds.length === 0) return [];
  return (await client.query(`select ${VITOLA_COLUMNS} from cigar_catalog where line_id = ${idList(lineIds)};`)).map(normalizeVitola);
}

export async function fetchRefCounts(client: MgmtClient): Promise<RefCounts> {
  const rows = await client.query<{ cigar_id: string; n: number | string }>(
    `select cigar_id, count(*) as n from humidor_items group by cigar_id
union all
select cigar_id, count(*) as n from smoke_logs group by cigar_id;`,
  );
  const out: RefCounts = {};
  for (const r of rows) out[r.cigar_id] = (out[r.cigar_id] ?? 0) + Number(r.n);
  return out;
}

const REF_TABLES: RefTable[] = ["humidor_items", "smoke_logs", "cigar_edit_suggestions", "cigar_image_submissions"];

export async function fetchRefRows(client: MgmtClient, vitolaIds: string[]): Promise<RefRow[]> {
  if (vitolaIds.length === 0) return [];
  const sql = REF_TABLES.map((t) => `select '${t}' as t, id, cigar_id from ${t} where cigar_id = ${idList(vitolaIds)}`).join("\nunion all\n") + ";";
  const rows = await client.query<{ t: RefTable; id: string; cigar_id: string }>(sql);
  return rows.map((r) => ({ table: r.t, id: String(r.id), cigar_id: r.cigar_id }));
}

export function buildContext(lines: LineRow[], vitolas: VitolaRow[], refs: RefCounts): CatalogContext {
  return { lines: new Map(lines.map((l) => [l.id, l])), vitolas: new Map(vitolas.map((v) => [v.id, v])), refs };
}
