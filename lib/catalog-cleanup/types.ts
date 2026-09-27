export interface LineRow {
  id: string;
  brand: string;
  series: string | null;
  community_added: boolean;
  approved: boolean;
  created_at: string | null;
}

export interface VitolaRow {
  id: string;
  line_id: string | null;
  brand: string | null;
  series: string | null;
  name: string | null;
  format: string | null;
  ring_gauge: number | null;
  length_inches: number | null;
  wrapper: string | null;
  shade: string | null;
  wrapper_country: string | null;
  binder_country: string | null;
  filler_countries: string[] | null;
  usage_count: number;
  community_added: boolean;
  approved: boolean;
  image_url: string | null;
  source_id: string | null;
  strength: string | null;
  created_at: string | null;
}

/** vitola id -> humidor_items + smoke_logs rows pointing at it */
export type RefCounts = Record<string, number>;

export type RefTable = "humidor_items" | "smoke_logs" | "cigar_edit_suggestions" | "cigar_image_submissions";
export interface RefRow { table: RefTable; id: string; cigar_id: string }

export interface Evidence { url: string; quote?: string; fetchedAt?: string }

export interface VitolaFields {
  name?: string | null;
  format?: string | null;
  ring_gauge?: number | null;
  length_inches?: number | null;
  shade?: string | null;
  wrapper?: string | null;
  wrapper_country?: string | null;
  binder_country?: string | null;
  filler_countries?: string[] | null;
}
export const VITOLA_FIELD_KEYS = [
  "name", "format", "ring_gauge", "length_inches", "shade", "wrapper",
  "wrapper_country", "binder_country", "filler_countries",
] as const;

export type ChildFill = { shade?: string; wrapper?: string };

interface OpBase {
  reason: string;
  generator: string;
  reviewed: boolean;
  evidence?: Evidence[];
  agreement?: { modelA: string; modelB: string };
}
export interface FoldLineOp extends OpBase {
  type: "fold_line";
  sourceLineId: string;
  targetLineId: string;
  childFills: Record<string, ChildFill>;
}
export interface RenameLineOp extends OpBase {
  type: "rename_line";
  lineId: string;
  brand: string;
  series: string | null;
}
export interface UpdateVitolaOp extends OpBase {
  type: "update_vitola";
  vitolaId: string;
  fields: VitolaFields;
}
export interface MergeVitolaOp extends OpBase {
  type: "merge_vitola";
  sourceVitolaId: string;
  targetVitolaId: string;
}
export interface WriteNameOp extends OpBase {
  type: "write_name";
  vitolaId: string;
  name: string;
  confidence?: "high" | "medium" | "low";
  sourceUrl?: string;
}
export type Op = FoldLineOp | RenameLineOp | UpdateVitolaOp | MergeVitolaOp | WriteNameOp;

export interface OpsFile {
  version: 1;
  generatedAt: string;
  generator: string;
  ops: Op[];
}

export interface Receipt {
  runId: string;
  executedAt: string;
  opsFile: string;
  committed: boolean;
  ops: Op[];
  snapshots: {
    lines: LineRow[];
    vitolas: VitolaRow[];
    refs: RefRow[];
  };
}

/** Context every SQL renderer and precondition check needs. */
export interface CatalogContext {
  lines: Map<string, LineRow>;
  vitolas: Map<string, VitolaRow>;
  refs: RefCounts;
}
