# Catalog Cleanup Executor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A preview / execute / undo tool that applies bulk catalog cleanup to production through the Supabase Management API, plus the two pass-1 generators (Tier-A rules and the format→name split) so Dave approves rules from sample previews instead of reviewing rows.

**Architecture:** Pure TypeScript logic in `lib/catalog-cleanup/` (types, SQL rendering, validation, preconditions, receipts, generators) unit-tested against fixture rows; thin CLIs in `scripts/catalog-cleanup/` run with `npx tsx` that wire the logic to the Management API client. Every prod write is one multi-statement request that Postgres runs as a single implicit transaction. A receipt written before the batch, and marked committed after, drives undo.

**Tech Stack:** TypeScript (ESM, `npx tsx` for scripts), vitest (`npm run test:unit`, scans `lib/**/*.test.ts` only), Node 20 `fetch`, Supabase Management API `POST /v1/projects/{ref}/database/query`.

**Spec:** `docs/superpowers/specs/2026-09-26-catalog-cleanup-executor-design.md`

## Global Constraints

- Vitola identity = full composition (name + format + ring + length + wrapper + shade). Never dedupe by name alone.
- Automatic folds and merges only for **seeded** (`community_added = false`) rows with **zero real references** (`humidor_items` + `smoke_logs` rows pointing at the vitola). `usage_count` is NOT a reference count.
- Row ids never change. Line folds repoint children; vitola merges call `merge_catalog_vitolas(p_source uuid, p_target uuid)` (exists in prod, service_role only; the Management API runs as `postgres`, which is fine).
- Privileged channel: Management API with a disposable token from env `SUPABASE_MGMT_TOKEN`; never written to any file. Project ref default `qagaiuibtwuhihukghyx`, overridable by `SUPABASE_PROJECT_REF`. The SQL editor is never used.
- One batch = one request, NO `begin`/`commit` statements (Postgres treats a multi-statement simple query with no transaction control as one implicit transaction).
- Outputs go to `.catalog-cleanup-out/` (git-ignored, already added) unless `--out` is given. Receipts must survive sessions.
- Unit tests live under `lib/catalog-cleanup/__tests__/` (the vitest include is `lib/**/*.test.ts`). No test touches prod or the network.
- `write_name` only fills a null name. Precondition, never a silent skip.
- Line identity for collision checks is `lower(btrim(brand))`, `lower(btrim(coalesce(series,'')))` (matches the pending 20260909 migration).
- Field ranges (from `app/api/admin/catalog-sizes/[id]/route.ts`): `name` ≤ 120 chars, `format` ≤ 80, `ring_gauge` 20–90, `length_inches` > 0 and ≤ 12, `shade`/`wrapper`/`wrapper_country`/`binder_country` ≤ 80, `filler_countries` string array.
- No em dashes in user-facing copy. Nothing here is user-facing; keep it out of the README anyway.
- Commit after every task with a conventional-commit message ending in `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **A vitola referenced by two ops where one merges it away** (source of `merge_vitola` also in `update_vitola`/`write_name`/`childFills`): must be Blocked, never applied in some order. Pinned in Task 5.
2. **Names with apostrophes and backslashes** (`L'Atelier`, `Rocky Patel "Edge"`) reaching SQL: must be escaped by literal doubling; a backslash must survive verbatim (standard_conforming_strings). Pinned in Task 1.
3. **Numeric columns arriving as strings from the API** (`"50"`, `"5.25"`): every read must normalize to numbers or the composition key and range checks silently break. Pinned in Task 4.
4. **API returns 200 with a non-array body** (an error object, an HTML page from a proxy): the client must throw, never return `[]`. Pinned in Task 3.
5. **A receipt written but the batch never confirmed** (network drop after send): `undo` must refuse an uncommitted receipt and `preview` must warn about it. Pinned in Task 7.

---

### Task 1: Types and SQL rendering

**Files:**
- Create: `lib/catalog-cleanup/types.ts`
- Create: `lib/catalog-cleanup/sql.ts`
- Test: `lib/catalog-cleanup/__tests__/sql.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: all types below; `lit(v)`, `uuidLit(id)`, `forwardSql(op, ctx)`, `UUID_RE`.

- [ ] **Step 1: Write the types file**

```ts
// lib/catalog-cleanup/types.ts
export interface LineRow {
  id: string;
  brand: string;
  series: string | null;
  community_added: boolean;
  approved: boolean;
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
```

- [ ] **Step 2: Write the failing tests**

```ts
// lib/catalog-cleanup/__tests__/sql.test.ts
import { describe, it, expect } from "vitest";
import { lit, uuidLit, forwardSql } from "../sql";
import type { CatalogContext, LineRow, VitolaRow } from "../types";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const V1 = "33333333-3333-4333-8333-333333333333";
const V2 = "44444444-4444-4444-8444-444444444444";

const line = (id: string, brand: string, series: string | null): LineRow =>
  ({ id, brand, series, community_added: false, approved: true });
const vitola = (id: string, line_id: string, extra: Partial<VitolaRow> = {}): VitolaRow => ({
  id, line_id, brand: "B", series: "S", name: null, format: null, ring_gauge: null,
  length_inches: null, wrapper: null, shade: null, wrapper_country: null,
  binder_country: null, filler_countries: null, usage_count: 0,
  community_added: false, approved: true, image_url: null, source_id: null, ...extra,
});
const ctx = (): CatalogContext => ({
  lines: new Map([[A, line(A, "Arturo Fuente", "Hemingway")], [B, line(B, "Arturo Fuente", "Hemingway NT")]]),
  vitolas: new Map([[V1, vitola(V1, B)], [V2, vitola(V2, A)]]),
  refs: {},
});

describe("lit", () => {
  it("doubles single quotes and keeps backslashes verbatim", () => {
    expect(lit("L'Atelier")).toBe("'L''Atelier'");
    expect(lit("a\\b")).toBe("'a\\b'");
  });
  it("renders null, numbers, booleans and text arrays", () => {
    expect(lit(null)).toBe("null");
    expect(lit(50)).toBe("50");
    expect(lit(true)).toBe("true");
    expect(lit(["Nicaragua", "Dom. Rep"])).toBe("array['Nicaragua','Dom. Rep']::text[]");
    expect(lit([])).toBe("array[]::text[]");
  });
  it("rejects non-finite numbers", () => {
    expect(() => lit(Number.NaN)).toThrow(/finite/);
  });
});

describe("uuidLit", () => {
  it("renders a valid uuid and rejects anything else", () => {
    expect(uuidLit(A)).toBe(`'${A}'::uuid`);
    expect(() => uuidLit("not-a-uuid")).toThrow(/uuid/);
    expect(() => uuidLit(`${A}' or 1=1`)).toThrow(/uuid/);
  });
});

describe("forwardSql", () => {
  it("fold_line repoints children, fills null-only, deletes the source", () => {
    const sql = forwardSql(
      { type: "fold_line", sourceLineId: B, targetLineId: A, childFills: { [V1]: { shade: "Natural" } },
        reason: "r", generator: "t", reviewed: false },
      ctx(),
    );
    expect(sql).toEqual([
      `update cigar_catalog set line_id = ${uuidLit(A)}, brand = 'Arturo Fuente', series = 'Hemingway' where line_id = ${uuidLit(B)};`,
      `update cigar_catalog set shade = coalesce(shade, 'Natural') where id = ${uuidLit(V1)};`,
      `delete from cigar_lines where id = ${uuidLit(B)};`,
    ]);
  });
  it("fold_line throws when the target line is unknown", () => {
    expect(() => forwardSql(
      { type: "fold_line", sourceLineId: B, targetLineId: V1, childFills: {}, reason: "r", generator: "t", reviewed: false },
      ctx(),
    )).toThrow(/target line/);
  });
  it("rename_line updates brand and series (null series allowed)", () => {
    expect(forwardSql({ type: "rename_line", lineId: A, brand: "Padron", series: null, reason: "r", generator: "t", reviewed: false }, ctx()))
      .toEqual([`update cigar_lines set brand = 'Padron', series = null where id = ${uuidLit(A)};`]);
  });
  it("update_vitola sets only the given fields in key order", () => {
    expect(forwardSql({ type: "update_vitola", vitolaId: V1, fields: { format: "Robusto", name: "Best Seller" }, reason: "r", generator: "t", reviewed: false }, ctx()))
      .toEqual([`update cigar_catalog set name = 'Best Seller', format = 'Robusto' where id = ${uuidLit(V1)};`]);
  });
  it("update_vitola with no fields throws", () => {
    expect(() => forwardSql({ type: "update_vitola", vitolaId: V1, fields: {}, reason: "r", generator: "t", reviewed: false }, ctx())).toThrow(/no fields/);
  });
  it("merge_vitola calls the RPC", () => {
    expect(forwardSql({ type: "merge_vitola", sourceVitolaId: V1, targetVitolaId: V2, reason: "r", generator: "t", reviewed: false }, ctx()))
      .toEqual([`select merge_catalog_vitolas(${uuidLit(V1)}, ${uuidLit(V2)});`]);
  });
  it("write_name only fills a null name", () => {
    expect(forwardSql({ type: "write_name", vitolaId: V1, name: "Short Story", reason: "r", generator: "t", reviewed: false }, ctx()))
      .toEqual([`update cigar_catalog set name = 'Short Story' where id = ${uuidLit(V1)} and name is null;`]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run lib/catalog-cleanup/__tests__/sql.test.ts`
Expected: FAIL, "Failed to resolve import ../sql".

- [ ] **Step 4: Write the SQL module**

```ts
// lib/catalog-cleanup/sql.ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/catalog-cleanup/__tests__/sql.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/catalog-cleanup/types.ts lib/catalog-cleanup/sql.ts lib/catalog-cleanup/__tests__/sql.test.ts
git commit -m "feat(catalog-cleanup): op types and SQL rendering

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Ops file validation

**Files:**
- Create: `lib/catalog-cleanup/ops.ts`
- Test: `lib/catalog-cleanup/__tests__/ops.test.ts`

**Interfaces:**
- Consumes: `UUID_RE` from `sql.ts`; types from `types.ts`.
- Produces: `validateOpsFile(input: unknown): OpsFile` (throws `OpsValidationError` with `.errors: string[]`), `validateVitolaFields(fields: unknown, path: string): string[]`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/catalog-cleanup/__tests__/ops.test.ts
import { describe, it, expect } from "vitest";
import { validateOpsFile, validateVitolaFields, OpsValidationError } from "../ops";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const base = { reason: "why", generator: "test", reviewed: false };
const file = (ops: unknown[]) => ({ version: 1, generatedAt: "2026-09-26T00:00:00Z", generator: "test", ops });

describe("validateOpsFile", () => {
  it("accepts a valid file of every op type", () => {
    const f = validateOpsFile(file([
      { ...base, type: "fold_line", sourceLineId: A, targetLineId: B, childFills: { [A]: { shade: "Natural" } } },
      { ...base, type: "rename_line", lineId: A, brand: "Padron", series: null },
      { ...base, type: "update_vitola", vitolaId: A, fields: { ring_gauge: 50, filler_countries: ["Nicaragua"] } },
      { ...base, type: "merge_vitola", sourceVitolaId: A, targetVitolaId: B },
      { ...base, type: "write_name", vitolaId: A, name: "Short Story", confidence: "high", sourceUrl: "https://x" },
    ]));
    expect(f.ops).toHaveLength(5);
  });
  it("rejects wrong version, missing ops, unknown type", () => {
    expect(() => validateOpsFile({ version: 2, ops: [] })).toThrow(OpsValidationError);
    expect(() => validateOpsFile({ version: 1, generatedAt: "x", generator: "t" })).toThrow(/ops/);
    expect(() => validateOpsFile(file([{ ...base, type: "nuke" }]))).toThrow(/unknown op type/);
  });
  it("collects every error instead of stopping at the first", () => {
    try {
      validateOpsFile(file([
        { ...base, type: "merge_vitola", sourceVitolaId: "bad", targetVitolaId: A },
        { ...base, type: "write_name", vitolaId: A, name: "" },
      ]));
      throw new Error("did not throw");
    } catch (e) {
      const err = e as OpsValidationError;
      expect(err.errors).toHaveLength(2);
      expect(err.errors[0]).toMatch(/ops\[0\].sourceVitolaId/);
      expect(err.errors[1]).toMatch(/ops\[1\].name/);
    }
  });
  it("rejects a merge of a row into itself and a fold of a line into itself", () => {
    expect(() => validateOpsFile(file([{ ...base, type: "merge_vitola", sourceVitolaId: A, targetVitolaId: A }]))).toThrow(/same/);
    expect(() => validateOpsFile(file([{ ...base, type: "fold_line", sourceLineId: A, targetLineId: A, childFills: {} }]))).toThrow(/same/);
  });
  it("requires reason, generator and boolean reviewed on every op", () => {
    expect(() => validateOpsFile(file([{ type: "write_name", vitolaId: A, name: "x" }]))).toThrow(/reason/);
    expect(() => validateOpsFile(file([{ ...base, reviewed: "yes", type: "write_name", vitolaId: A, name: "x" }]))).toThrow(/reviewed/);
  });
});

describe("validateVitolaFields", () => {
  it("enforces the admin-route ranges and whitelist", () => {
    expect(validateVitolaFields({ ring_gauge: 19 }, "f")).toEqual(["f.ring_gauge must be 20-90 or null"]);
    expect(validateVitolaFields({ length_inches: 12.5 }, "f")).toEqual(["f.length_inches must be 0-12 or null"]);
    expect(validateVitolaFields({ name: "x".repeat(121) }, "f")).toEqual(["f.name must be a string of at most 120 chars or null"]);
    expect(validateVitolaFields({ brand: "nope" }, "f")).toEqual(["f.brand is not an editable vitola field"]);
    expect(validateVitolaFields({ filler_countries: ["a", 1] }, "f")).toEqual(["f.filler_countries must be a string array or null"]);
    expect(validateVitolaFields({ shade: null, wrapper: "Habano" }, "f")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/catalog-cleanup/__tests__/ops.test.ts`
Expected: FAIL, cannot resolve `../ops`.

- [ ] **Step 3: Write the validation module**

```ts
// lib/catalog-cleanup/ops.ts
import { UUID_RE } from "./sql";
import type { Op, OpsFile } from "./types";
import { VITOLA_FIELD_KEYS } from "./types";

export class OpsValidationError extends Error {
  constructor(public errors: string[]) {
    super(`ops file invalid:\n  ${errors.join("\n  ")}`);
    this.name = "OpsValidationError";
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const strOrNull = (v: unknown, max: number) => v === null || (typeof v === "string" && v.length <= max);

export function validateVitolaFields(fields: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isObj(fields)) return [`${path} must be an object`];
  for (const [k, v] of Object.entries(fields)) {
    if (!(VITOLA_FIELD_KEYS as readonly string[]).includes(k)) { errors.push(`${path}.${k} is not an editable vitola field`); continue; }
    switch (k) {
      case "name": if (!strOrNull(v, 120)) errors.push(`${path}.name must be a string of at most 120 chars or null`); break;
      case "format": if (!strOrNull(v, 80)) errors.push(`${path}.format must be a string of at most 80 chars or null`); break;
      case "ring_gauge": if (v !== null && (typeof v !== "number" || v < 20 || v > 90)) errors.push(`${path}.ring_gauge must be 20-90 or null`); break;
      case "length_inches": if (v !== null && (typeof v !== "number" || v <= 0 || v > 12)) errors.push(`${path}.length_inches must be 0-12 or null`); break;
      case "filler_countries":
        if (v !== null && (!Array.isArray(v) || v.some((x) => typeof x !== "string"))) errors.push(`${path}.filler_countries must be a string array or null`);
        break;
      default: if (!strOrNull(v, 80)) errors.push(`${path}.${k} must be a string of at most 80 chars or null`);
    }
  }
  return errors;
}

function validateOp(raw: unknown, i: number): string[] {
  const p = `ops[${i}]`;
  if (!isObj(raw)) return [`${p} must be an object`];
  const errors: string[] = [];
  if (typeof raw.reason !== "string" || raw.reason === "") errors.push(`${p}.reason is required`);
  if (typeof raw.generator !== "string" || raw.generator === "") errors.push(`${p}.generator is required`);
  if (typeof raw.reviewed !== "boolean") errors.push(`${p}.reviewed must be a boolean`);
  switch (raw.type) {
    case "fold_line":
      if (!isUuid(raw.sourceLineId)) errors.push(`${p}.sourceLineId must be a uuid`);
      if (!isUuid(raw.targetLineId)) errors.push(`${p}.targetLineId must be a uuid`);
      if (isUuid(raw.sourceLineId) && raw.sourceLineId === raw.targetLineId) errors.push(`${p}: source and target are the same line`);
      if (!isObj(raw.childFills)) errors.push(`${p}.childFills must be an object`);
      else for (const [vid, fill] of Object.entries(raw.childFills)) {
        if (!isUuid(vid)) errors.push(`${p}.childFills key ${vid} must be a uuid`);
        if (!isObj(fill)) { errors.push(`${p}.childFills[${vid}] must be an object`); continue; }
        for (const [k, v] of Object.entries(fill)) {
          if (k !== "shade" && k !== "wrapper") errors.push(`${p}.childFills[${vid}].${k} is not fillable`);
          else if (typeof v !== "string" || v === "" || v.length > 80) errors.push(`${p}.childFills[${vid}].${k} must be a short non-empty string`);
        }
      }
      break;
    case "rename_line":
      if (!isUuid(raw.lineId)) errors.push(`${p}.lineId must be a uuid`);
      if (typeof raw.brand !== "string" || raw.brand.trim() === "") errors.push(`${p}.brand must be a non-empty string`);
      if (raw.series !== null && typeof raw.series !== "string") errors.push(`${p}.series must be a string or null`);
      break;
    case "update_vitola":
      if (!isUuid(raw.vitolaId)) errors.push(`${p}.vitolaId must be a uuid`);
      errors.push(...validateVitolaFields(raw.fields, `${p}.fields`));
      if (isObj(raw.fields) && Object.keys(raw.fields).length === 0) errors.push(`${p}.fields must not be empty`);
      break;
    case "merge_vitola":
      if (!isUuid(raw.sourceVitolaId)) errors.push(`${p}.sourceVitolaId must be a uuid`);
      if (!isUuid(raw.targetVitolaId)) errors.push(`${p}.targetVitolaId must be a uuid`);
      if (isUuid(raw.sourceVitolaId) && raw.sourceVitolaId === raw.targetVitolaId) errors.push(`${p}: source and target are the same vitola`);
      break;
    case "write_name":
      if (!isUuid(raw.vitolaId)) errors.push(`${p}.vitolaId must be a uuid`);
      if (typeof raw.name !== "string" || raw.name.trim() === "" || raw.name.length > 120) errors.push(`${p}.name must be a non-empty string of at most 120 chars`);
      if (raw.confidence !== undefined && !["high", "medium", "low"].includes(raw.confidence as string)) errors.push(`${p}.confidence must be high|medium|low`);
      if (raw.sourceUrl !== undefined && typeof raw.sourceUrl !== "string") errors.push(`${p}.sourceUrl must be a string`);
      break;
    default:
      errors.push(`${p}: unknown op type ${JSON.stringify(raw.type)}`);
  }
  return errors;
}

export function validateOpsFile(input: unknown): OpsFile {
  const errors: string[] = [];
  if (!isObj(input)) throw new OpsValidationError(["ops file must be an object"]);
  if (input.version !== 1) errors.push("version must be 1");
  if (typeof input.generatedAt !== "string") errors.push("generatedAt must be a string");
  if (typeof input.generator !== "string") errors.push("generator must be a string");
  if (!Array.isArray(input.ops)) errors.push("ops must be an array");
  else input.ops.forEach((op, i) => errors.push(...validateOp(op, i)));
  if (errors.length) throw new OpsValidationError(errors);
  return input as unknown as OpsFile;
}

export function opTouchesVitola(op: Op, vitolaId: string): boolean {
  switch (op.type) {
    case "update_vitola": case "write_name": return op.vitolaId === vitolaId;
    case "merge_vitola": return op.sourceVitolaId === vitolaId || op.targetVitolaId === vitolaId;
    case "fold_line": return vitolaId in op.childFills;
    case "rename_line": return false;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/catalog-cleanup/__tests__/ops.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/catalog-cleanup/ops.ts lib/catalog-cleanup/__tests__/ops.test.ts
git commit -m "feat(catalog-cleanup): ops file validation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Management API client

**Files:**
- Create: `lib/catalog-cleanup/mgmt-client.ts`
- Test: `lib/catalog-cleanup/__tests__/mgmt-client.test.ts`

**Interfaces:**
- Consumes: nothing internal.
- Produces:
  ```ts
  interface MgmtClient { query<T = Record<string, unknown>>(sql: string): Promise<T[]>; batch(statements: string[]): Promise<void>; projectRef: string }
  function createMgmtClient(opts: { token: string; projectRef?: string; fetchImpl?: typeof fetch }): MgmtClient
  class MgmtApiError extends Error { status: number; body: string }
  const DEFAULT_PROJECT_REF = "qagaiuibtwuhihukghyx"
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/catalog-cleanup/__tests__/mgmt-client.test.ts
import { describe, it, expect, vi } from "vitest";
import { createMgmtClient, MgmtApiError, DEFAULT_PROJECT_REF } from "../mgmt-client";

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createMgmtClient", () => {
  it("posts the SQL to the project's query endpoint with the bearer token", async () => {
    const fetchImpl = vi.fn(async () => ok([{ n: 1 }]));
    const client = createMgmtClient({ token: "sbp_test", fetchImpl });
    const rows = await client.query<{ n: number }>("select 1 as n");
    expect(rows).toEqual([{ n: 1 }]);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.supabase.com/v1/projects/${DEFAULT_PROJECT_REF}/database/query`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sbp_test");
    expect(JSON.parse(init.body as string)).toEqual({ query: "select 1 as n" });
  });
  it("uses an explicit project ref", async () => {
    const fetchImpl = vi.fn(async () => ok([]));
    await createMgmtClient({ token: "t", projectRef: "abc", fetchImpl }).query("select 1");
    expect((fetchImpl.mock.calls[0] as [string])[0]).toContain("/projects/abc/");
  });
  it("throws MgmtApiError with status and body on non-2xx", async () => {
    const fetchImpl = vi.fn(async () => new Response("{\"message\":\"bad token\"}", { status: 401 }));
    await expect(createMgmtClient({ token: "t", fetchImpl }).query("select 1")).rejects.toMatchObject({ status: 401, body: "{\"message\":\"bad token\"}" });
    await expect(createMgmtClient({ token: "t", fetchImpl }).query("select 1")).rejects.toBeInstanceOf(MgmtApiError);
  });
  it("throws when a 200 body is not a JSON array", async () => {
    const fetchImpl = vi.fn(async () => ok({ message: "weird" }));
    await expect(createMgmtClient({ token: "t", fetchImpl }).query("select 1")).rejects.toThrow(/not a JSON array/);
    const html = vi.fn(async () => new Response("<html>login</html>", { status: 200 }));
    await expect(createMgmtClient({ token: "t", fetchImpl: html }).query("select 1")).rejects.toThrow(/not JSON/);
  });
  it("batch joins statements with newlines and adds no transaction control", async () => {
    const fetchImpl = vi.fn(async () => ok([]));
    await createMgmtClient({ token: "t", fetchImpl }).batch(["update a set x = 1;", "delete from b;"]);
    const body = JSON.parse(((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body) as string);
    expect(body.query).toBe("update a set x = 1;\ndelete from b;");
    expect(body.query).not.toMatch(/begin|commit/i);
  });
  it("batch refuses an empty statement list", async () => {
    const fetchImpl = vi.fn();
    await expect(createMgmtClient({ token: "t", fetchImpl }).batch([])).rejects.toThrow(/empty/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("refuses to construct without a token", () => {
    expect(() => createMgmtClient({ token: "" })).toThrow(/SUPABASE_MGMT_TOKEN/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/catalog-cleanup/__tests__/mgmt-client.test.ts`
Expected: FAIL, cannot resolve `../mgmt-client`.

- [ ] **Step 3: Write the client**

```ts
// lib/catalog-cleanup/mgmt-client.ts
export const DEFAULT_PROJECT_REF = "qagaiuibtwuhihukghyx";

export class MgmtApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`Management API ${status}: ${body.slice(0, 500)}`);
    this.name = "MgmtApiError";
  }
}

export interface MgmtClient {
  projectRef: string;
  query<T = Record<string, unknown>>(sql: string): Promise<T[]>;
  /** One request, many statements, no transaction control: Postgres runs the
   *  whole simple-query message as one implicit transaction. */
  batch(statements: string[]): Promise<void>;
}

export function createMgmtClient(opts: { token: string; projectRef?: string; fetchImpl?: typeof fetch }): MgmtClient {
  if (!opts.token) throw new Error("SUPABASE_MGMT_TOKEN is required (mint at supabase.com/dashboard/account/tokens)");
  const projectRef = opts.projectRef || DEFAULT_PROJECT_REF;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

  async function query<T>(sql: string): Promise<T[]> {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    if (!res.ok) throw new MgmtApiError(res.status, text);
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new Error(`Management API returned 200 but the body is not JSON: ${text.slice(0, 200)}`); }
    if (!Array.isArray(parsed)) throw new Error(`Management API returned 200 but the body is not a JSON array: ${text.slice(0, 200)}`);
    return parsed as T[];
  }

  return {
    projectRef,
    query,
    async batch(statements) {
      if (statements.length === 0) throw new Error("batch: empty statement list");
      await query(statements.join("\n"));
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/catalog-cleanup/__tests__/mgmt-client.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/catalog-cleanup/mgmt-client.ts lib/catalog-cleanup/__tests__/mgmt-client.test.ts
git commit -m "feat(catalog-cleanup): Supabase Management API client

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Catalog reads and normalization

**Files:**
- Create: `lib/catalog-cleanup/catalog-read.ts`
- Test: `lib/catalog-cleanup/__tests__/catalog-read.test.ts`

**Interfaces:**
- Consumes: `MgmtClient` (Task 3), `uuidLit` (Task 1), types.
- Produces:
  ```ts
  normalizeVitola(raw: Record<string, unknown>): VitolaRow
  normalizeLine(raw: Record<string, unknown>): LineRow
  fetchLines(client): Promise<LineRow[]>
  fetchVitolas(client): Promise<VitolaRow[]>
  fetchRefCounts(client): Promise<RefCounts>
  fetchLinesById(client, ids: string[]): Promise<LineRow[]>
  fetchVitolasById(client, ids: string[]): Promise<VitolaRow[]>
  fetchVitolasByLine(client, lineIds: string[]): Promise<VitolaRow[]>
  fetchRefRows(client, vitolaIds: string[]): Promise<RefRow[]>
  buildContext(lines, vitolas, refs): CatalogContext
  ```
- `VITOLA_COLUMNS` = `id, line_id, brand, series, name, format, ring_gauge, length_inches, wrapper, shade, wrapper_country, binder_country, filler_countries, usage_count, community_added, approved, image_url, source_id`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/catalog-cleanup/__tests__/catalog-read.test.ts
import { describe, it, expect, vi } from "vitest";
import { normalizeVitola, normalizeLine, fetchRefCounts, fetchVitolasById, fetchRefRows, buildContext } from "../catalog-read";
import type { MgmtClient } from "../mgmt-client";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const fake = (rows: unknown[]): MgmtClient & { query: ReturnType<typeof vi.fn> } => {
  const query = vi.fn(async () => rows);
  return { projectRef: "x", query, batch: vi.fn() } as never;
};

describe("normalizeVitola", () => {
  it("coerces numeric strings, nulls, and array shapes", () => {
    const v = normalizeVitola({ id: A, line_id: B, brand: "B", series: null, name: null, format: "Toro",
      ring_gauge: "50", length_inches: "5.25", wrapper: null, shade: null, wrapper_country: null, binder_country: null,
      filler_countries: "{Nicaragua,\"Dom. Rep\"}", usage_count: "3", community_added: "f", approved: true, image_url: null, source_id: "seed-1" });
    expect(v.ring_gauge).toBe(50);
    expect(v.length_inches).toBe(5.25);
    expect(v.usage_count).toBe(3);
    expect(v.community_added).toBe(false);
    expect(v.filler_countries).toEqual(["Nicaragua", "Dom. Rep"]);
  });
  it("keeps JSON arrays and maps missing usage_count to 0", () => {
    const v = normalizeVitola({ id: A, filler_countries: ["a"], usage_count: null });
    expect(v.filler_countries).toEqual(["a"]);
    expect(v.usage_count).toBe(0);
    expect(v.line_id).toBeNull();
  });
  it("throws on a missing or invalid id", () => {
    expect(() => normalizeVitola({ id: "nope" })).toThrow(/id/);
  });
});

describe("normalizeLine", () => {
  it("coerces booleans and requires brand", () => {
    expect(normalizeLine({ id: A, brand: "Padron", series: null, community_added: "t", approved: "f" }))
      .toEqual({ id: A, brand: "Padron", series: null, community_added: true, approved: false });
    expect(() => normalizeLine({ id: A, brand: null })).toThrow(/brand/);
  });
});

describe("fetchRefCounts", () => {
  it("sums humidor and smoke-log counts per vitola", async () => {
    const client = fake([{ cigar_id: A, n: "2" }, { cigar_id: A, n: 1 }, { cigar_id: B, n: "1" }]);
    expect(await fetchRefCounts(client)).toEqual({ [A]: 3, [B]: 1 });
    expect(client.query.mock.calls[0][0]).toMatch(/from humidor_items[\s\S]*union all[\s\S]*from smoke_logs/);
  });
});

describe("fetchVitolasById", () => {
  it("returns [] without a query for no ids, and uses an any(array) filter otherwise", async () => {
    const client = fake([]);
    expect(await fetchVitolasById(client, [])).toEqual([]);
    expect(client.query).not.toHaveBeenCalled();
    await fetchVitolasById(client, [A, B]);
    expect(client.query.mock.calls[0][0]).toContain(`id = any(array['${A}'::uuid,'${B}'::uuid])`);
  });
  it("rejects a non-uuid id before querying", async () => {
    const client = fake([]);
    await expect(fetchVitolasById(client, ["x"])).rejects.toThrow(/uuid/);
  });
});

describe("fetchRefRows", () => {
  it("queries all four referencing tables and tags rows with the table", async () => {
    const client = fake([{ t: "humidor_items", id: B, cigar_id: A }, { t: "smoke_logs", id: A, cigar_id: A }]);
    const rows = await fetchRefRows(client, [A]);
    expect(rows).toEqual([{ table: "humidor_items", id: B, cigar_id: A }, { table: "smoke_logs", id: A, cigar_id: A }]);
    const sql = client.query.mock.calls[0][0] as string;
    for (const t of ["humidor_items", "smoke_logs", "cigar_edit_suggestions", "cigar_image_submissions"]) expect(sql).toContain(`from ${t}`);
  });
});

describe("buildContext", () => {
  it("indexes lines and vitolas by id", () => {
    const ctx = buildContext([normalizeLine({ id: A, brand: "P" })], [normalizeVitola({ id: B, line_id: A })], { [B]: 1 });
    expect(ctx.lines.get(A)?.brand).toBe("P");
    expect(ctx.vitolas.get(B)?.line_id).toBe(A);
    expect(ctx.refs[B]).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/catalog-cleanup/__tests__/catalog-read.test.ts`
Expected: FAIL, cannot resolve `../catalog-read`.

- [ ] **Step 3: Write the read module**

```ts
// lib/catalog-cleanup/catalog-read.ts
import type { MgmtClient } from "./mgmt-client";
import { uuidLit, UUID_RE } from "./sql";
import type { CatalogContext, LineRow, RefCounts, RefRow, RefTable, VitolaRow } from "./types";

export const VITOLA_COLUMNS =
  "id, line_id, brand, series, name, format, ring_gauge, length_inches, wrapper, shade, wrapper_country, binder_country, filler_countries, usage_count, community_added, approved, image_url, source_id";
export const LINE_COLUMNS = "id, brand, series, community_added, approved";

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
    image_url: str(raw.image_url), source_id: str(raw.source_id),
  };
}

export function normalizeLine(raw: Record<string, unknown>): LineRow {
  const brand = str(raw.brand);
  if (!brand) throw new Error(`line ${String(raw.id)}: brand is required`);
  return { id: id(raw.id, "id"), brand, series: str(raw.series), community_added: bool(raw.community_added), approved: bool(raw.approved) };
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/catalog-cleanup/__tests__/catalog-read.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/catalog-cleanup/catalog-read.ts lib/catalog-cleanup/__tests__/catalog-read.test.ts
git commit -m "feat(catalog-cleanup): catalog reads, normalization, real reference counts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Preview preconditions and markdown

**Files:**
- Create: `lib/catalog-cleanup/preview.ts`
- Test: `lib/catalog-cleanup/__tests__/preview.test.ts`

**Interfaces:**
- Consumes: types; `opTouchesVitola` (Task 2).
- Produces:
  ```ts
  interface Blocked { opIndex: number; reason: string }
  const normIdent = (brand: string, series: string | null) => string   // lower(btrim) identity
  checkPreconditions(ops: Op[], ctx: CatalogContext): Blocked[]
  renderPreview(args: { ops: Op[]; ctx: CatalogContext; blocked: Blocked[]; generator: string; sampleSize?: number; qaSample?: number[]; warnings?: string[] }): string
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/catalog-cleanup/__tests__/preview.test.ts
import { describe, it, expect } from "vitest";
import { checkPreconditions, renderPreview, normIdent } from "../preview";
import type { CatalogContext, LineRow, Op, VitolaRow } from "../types";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "55555555-5555-4555-8555-555555555555";
const V1 = "33333333-3333-4333-8333-333333333333";
const V2 = "44444444-4444-4444-8444-444444444444";
const V3 = "66666666-6666-4666-8666-666666666666";
const base = { reason: "r", generator: "t", reviewed: false };
const line = (id: string, brand: string, series: string | null, community = false): LineRow => ({ id, brand, series, community_added: community, approved: true });
const vit = (id: string, line_id: string, extra: Partial<VitolaRow> = {}): VitolaRow => ({
  id, line_id, brand: "B", series: "S", name: null, format: null, ring_gauge: null, length_inches: null, wrapper: null,
  shade: null, wrapper_country: null, binder_country: null, filler_countries: null, usage_count: 0,
  community_added: false, approved: true, image_url: null, source_id: null, ...extra,
});
const ctx = (over: Partial<CatalogContext> = {}): CatalogContext => ({
  lines: new Map([[A, line(A, "Arturo Fuente", "Hemingway")], [B, line(B, "Arturo Fuente", "Hemingway NT")], [C, line(C, "Padron", null, true)]]),
  vitolas: new Map([[V1, vit(V1, B)], [V2, vit(V2, A)], [V3, vit(V3, C)]]),
  refs: {},
  ...over,
});
const fold = (o: Partial<Op> = {}): Op => ({ ...base, type: "fold_line", sourceLineId: B, targetLineId: A, childFills: {}, ...o } as Op);

describe("normIdent", () => {
  it("lowercases, trims, and treats null series as empty", () => {
    expect(normIdent("  Chateau Fuente ", null)).toBe("chateau fuente|");
    expect(normIdent("Padron", " 1964 ")).toBe("padron|1964");
  });
});

describe("checkPreconditions", () => {
  it("passes a clean fold", () => {
    expect(checkPreconditions([fold()], ctx())).toEqual([]);
  });
  it("blocks unknown ids", () => {
    expect(checkPreconditions([fold({ targetLineId: V1 } as never)], ctx())[0].reason).toMatch(/target line .* not found/);
    expect(checkPreconditions([{ ...base, type: "write_name", vitolaId: A, name: "x" }], ctx())[0].reason).toMatch(/vitola .* not found/);
  });
  it("blocks an unreviewed fold of a community-added line or of children with real refs", () => {
    expect(checkPreconditions([fold({ sourceLineId: C, targetLineId: A } as never)], ctx())[0].reason).toMatch(/community-added/);
    expect(checkPreconditions([fold()], ctx({ refs: { [V1]: 2 } }))[0].reason).toMatch(/real reference/);
    expect(checkPreconditions([fold({ reviewed: true } as never)], ctx({ refs: { [V1]: 2 } }))).toEqual([]);
  });
  it("blocks a childFill that would overwrite a non-null field or targets a child outside the source line", () => {
    const c = ctx(); c.vitolas.set(V1, vit(V1, B, { shade: "Maduro" }));
    expect(checkPreconditions([fold({ childFills: { [V1]: { shade: "Natural" } } } as never)], c)[0].reason).toMatch(/already has shade/);
    expect(checkPreconditions([fold({ childFills: { [V2]: { shade: "Natural" } } } as never)], ctx())[0].reason).toMatch(/not a child of the source line/);
  });
  it("blocks a rename that collides on normalized identity", () => {
    const op: Op = { ...base, type: "rename_line", lineId: B, brand: "arturo fuente", series: " Hemingway " };
    expect(checkPreconditions([op], ctx())[0].reason).toMatch(/collides with line/);
  });
  it("blocks update_vitola range violations and write_name on a named row", () => {
    expect(checkPreconditions([{ ...base, type: "update_vitola", vitolaId: V1, fields: { ring_gauge: 200 } }], ctx())[0].reason).toMatch(/ring_gauge/);
    const c = ctx(); c.vitolas.set(V1, vit(V1, B, { name: "Classic" }));
    expect(checkPreconditions([{ ...base, type: "write_name", vitolaId: V1, name: "x" }], c)[0].reason).toMatch(/already has a name/);
  });
  it("blocks a merge across lines and an unreviewed merge of a referenced source", () => {
    expect(checkPreconditions([{ ...base, type: "merge_vitola", sourceVitolaId: V1, targetVitolaId: V2 }], ctx())[0].reason).toMatch(/different lines/);
    const c = ctx(); c.vitolas.set(V2, vit(V2, B));
    expect(checkPreconditions([{ ...base, type: "merge_vitola", sourceVitolaId: V1, targetVitolaId: V2 }], c)).toEqual([]);
    expect(checkPreconditions([{ ...base, type: "merge_vitola", sourceVitolaId: V1, targetVitolaId: V2 }], { ...c, refs: { [V1]: 1 } })[0].reason).toMatch(/real reference/);
  });
  it("blocks any other op on a vitola that is merged away in the same run", () => {
    const c = ctx(); c.vitolas.set(V2, vit(V2, B));
    const ops: Op[] = [
      { ...base, type: "merge_vitola", sourceVitolaId: V1, targetVitolaId: V2 },
      { ...base, type: "write_name", vitolaId: V1, name: "x" },
    ];
    const blocked = checkPreconditions(ops, c);
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({ opIndex: 1 });
    expect(blocked[0].reason).toMatch(/merged away/);
  });
  it("blocks a line folded twice or renamed after being folded", () => {
    expect(checkPreconditions([fold(), fold()], ctx())[1].reason).toMatch(/already folded/);
    expect(checkPreconditions([fold(), { ...base, type: "rename_line", lineId: B, brand: "X", series: null }], ctx())[1].reason).toMatch(/folded away/);
  });
});

describe("renderPreview", () => {
  it("renders counts by type, a sample table with before/after, and the blocked list", () => {
    const md = renderPreview({
      ops: [fold({ childFills: { [V1]: { shade: "Natural" } } } as never), { ...base, type: "write_name", vitolaId: V2, name: "Classic" }],
      ctx: ctx(), blocked: [{ opIndex: 1, reason: "vitola already has a name" }], generator: "rules-tier-a",
    });
    expect(md).toContain("# Catalog cleanup preview");
    expect(md).toContain("| fold_line | 1 |");
    expect(md).toContain("| write_name | 1 |");
    expect(md).toContain("Hemingway NT");
    expect(md).toContain("→");
    expect(md).toContain("shade: (null) → Natural");
    expect(md).toContain("## Blocked (1)");
    expect(md).toContain("vitola already has a name");
  });
  it("marks QA-sample rows and says nothing to do for an empty file", () => {
    expect(renderPreview({ ops: [], ctx: ctx(), blocked: [], generator: "g" })).toContain("Nothing to do");
    const md = renderPreview({ ops: [fold()], ctx: ctx(), blocked: [], generator: "g", qaSample: [0] });
    expect(md).toContain("QA sample");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/catalog-cleanup/__tests__/preview.test.ts`
Expected: FAIL, cannot resolve `../preview`.

- [ ] **Step 3: Write the preview module**

```ts
// lib/catalog-cleanup/preview.ts
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

  ops.forEach((op, i) => {
    switch (op.type) {
      case "fold_line": {
        const src = ctx.lines.get(op.sourceLineId);
        const tgt = ctx.lines.get(op.targetLineId);
        if (!src) return block(i, `source line ${op.sourceLineId} not found`);
        if (!tgt) return block(i, `target line ${op.targetLineId} not found`);
        if (foldedAway.has(op.sourceLineId)) return block(i, `line ${op.sourceLineId} already folded earlier in this run`);
        if (foldedAway.has(op.targetLineId)) return block(i, `target line ${op.targetLineId} was folded away earlier in this run`);
        const kids = childrenOf(ctx, src.id);
        if (!op.reviewed) {
          if (src.community_added || kids.some((k) => k.community_added)) return block(i, `unreviewed fold of a community-added line (${src.brand} / ${src.series ?? "-"})`);
          const referenced = kids.filter((k) => (ctx.refs[k.id] ?? 0) > 0);
          if (referenced.length) return block(i, `unreviewed fold: ${referenced.length} child vitola(s) have real references`);
        }
        for (const [vid, fill] of Object.entries(op.childFills)) {
          const kid = ctx.vitolas.get(vid);
          if (!kid || kid.line_id !== src.id) { block(i, `childFills vitola ${vid} is not a child of the source line`); continue; }
          if (mergedAway.has(vid)) block(i, `childFills vitola ${vid} is merged away in this run`);
          if (fill.shade !== undefined && kid.shade !== null) block(i, `child ${vid} already has shade "${kid.shade}"`);
          if (fill.wrapper !== undefined && kid.wrapper !== null) block(i, `child ${vid} already has wrapper "${kid.wrapper}"`);
        }
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/catalog-cleanup/__tests__/preview.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/catalog-cleanup/preview.ts lib/catalog-cleanup/__tests__/preview.test.ts
git commit -m "feat(catalog-cleanup): preview preconditions and markdown report

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Receipt and undo SQL

**Files:**
- Create: `lib/catalog-cleanup/receipt.ts`
- Test: `lib/catalog-cleanup/__tests__/receipt.test.ts`

**Interfaces:**
- Consumes: `lit`, `uuidLit` (Task 1); types.
- Produces:
  ```ts
  collectTouched(ops: Op[], ctx: CatalogContext): { lineIds: string[]; vitolaIds: string[]; mergeSourceIds: string[] }
  buildReceipt(args: { runId: string; opsFile: string; ops: Op[]; lines: LineRow[]; vitolas: VitolaRow[]; refs: RefRow[] }): Receipt
  reverseSql(receipt: Receipt): string[]
  reverseWarnings(receipt: Receipt, currentRefs: RefRow[]): string[]
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/catalog-cleanup/__tests__/receipt.test.ts
import { describe, it, expect } from "vitest";
import { collectTouched, buildReceipt, reverseSql, reverseWarnings } from "../receipt";
import { uuidLit } from "../sql";
import type { CatalogContext, LineRow, Op, VitolaRow } from "../types";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const V1 = "33333333-3333-4333-8333-333333333333";
const V2 = "44444444-4444-4444-8444-444444444444";
const H1 = "77777777-7777-4777-8777-777777777777";
const base = { reason: "r", generator: "t", reviewed: false };
const line = (id: string, brand: string, series: string | null): LineRow => ({ id, brand, series, community_added: false, approved: true });
const vit = (id: string, line_id: string, extra: Partial<VitolaRow> = {}): VitolaRow => ({
  id, line_id, brand: "Arturo Fuente", series: "Hemingway NT", name: null, format: "Robusto", ring_gauge: 50, length_inches: 5,
  wrapper: null, shade: null, wrapper_country: "Ecuador", binder_country: null, filler_countries: ["Dom. Rep"], usage_count: 2,
  community_added: false, approved: true, image_url: "https://img", source_id: "seed-9", ...extra,
});
const ctx = (): CatalogContext => ({
  lines: new Map([[A, line(A, "Arturo Fuente", "Hemingway")], [B, line(B, "Arturo Fuente", "Hemingway NT")]]),
  vitolas: new Map([[V1, vit(V1, B)], [V2, vit(V2, B, { source_id: "seed-10" })]]),
  refs: {},
});

describe("collectTouched", () => {
  it("includes fold children, both merge rows, and marks merge sources", () => {
    const ops: Op[] = [
      { ...base, type: "fold_line", sourceLineId: B, targetLineId: A, childFills: {} },
      { ...base, type: "merge_vitola", sourceVitolaId: V1, targetVitolaId: V2 },
    ];
    const t = collectTouched(ops, ctx());
    expect(t.lineIds.sort()).toEqual([A, B].sort());
    expect(t.vitolaIds.sort()).toEqual([V1, V2].sort());
    expect(t.mergeSourceIds).toEqual([V1]);
  });
});

describe("buildReceipt + reverseSql", () => {
  it("undoes a fold: re-inserts the line, repoints the children, clears fills", () => {
    const ops: Op[] = [{ ...base, type: "fold_line", sourceLineId: B, targetLineId: A, childFills: { [V1]: { shade: "Natural" } } }];
    const c = ctx();
    const r = buildReceipt({ runId: "run1", opsFile: "ops.json", ops, lines: [...c.lines.values()], vitolas: [...c.vitolas.values()], refs: [] });
    expect(r.committed).toBe(false);
    const sql = reverseSql(r);
    expect(sql).toEqual([
      `insert into cigar_lines (id, brand, series, community_added, approved) values (${uuidLit(B)}, 'Arturo Fuente', 'Hemingway NT', false, true) on conflict (id) do nothing;`,
      `update cigar_catalog set line_id = ${uuidLit(B)}, brand = 'Arturo Fuente', series = 'Hemingway NT' where id = ${uuidLit(V1)};`,
      `update cigar_catalog set line_id = ${uuidLit(B)}, brand = 'Arturo Fuente', series = 'Hemingway NT' where id = ${uuidLit(V2)};`,
      `update cigar_catalog set shade = null where id = ${uuidLit(V1)};`,
    ]);
  });
  it("undoes rename, update and write_name by restoring snapshot values", () => {
    const c = ctx();
    const ops: Op[] = [
      { ...base, type: "rename_line", lineId: A, brand: "AF", series: null },
      { ...base, type: "update_vitola", vitolaId: V1, fields: { format: "Toro", ring_gauge: 52 } },
      { ...base, type: "write_name", vitolaId: V2, name: "Classic" },
    ];
    const r = buildReceipt({ runId: "run2", opsFile: "o", ops, lines: [...c.lines.values()], vitolas: [...c.vitolas.values()], refs: [] });
    expect(reverseSql(r)).toEqual([
      `update cigar_lines set brand = 'Arturo Fuente', series = 'Hemingway' where id = ${uuidLit(A)};`,
      `update cigar_catalog set format = 'Robusto', ring_gauge = 50 where id = ${uuidLit(V1)};`,
      `update cigar_catalog set name = null where id = ${uuidLit(V2)};`,
    ]);
  });
  it("undoes a merge: re-inserts the source row, repoints recorded refs, restores the target's usage and image", () => {
    const c = ctx();
    const ops: Op[] = [{ ...base, type: "merge_vitola", sourceVitolaId: V1, targetVitolaId: V2 }];
    const r = buildReceipt({ runId: "run3", opsFile: "o", ops, lines: [], vitolas: [...c.vitolas.values()], refs: [{ table: "humidor_items", id: H1, cigar_id: V1 }] });
    const sql = reverseSql(r);
    expect(sql[0]).toBe(
      `insert into cigar_catalog (id, line_id, brand, series, name, format, ring_gauge, length_inches, wrapper, shade, wrapper_country, binder_country, filler_countries, usage_count, community_added, approved, image_url, source_id) values (${uuidLit(V1)}, ${uuidLit(B)}, 'Arturo Fuente', 'Hemingway NT', null, 'Robusto', 50, 5, null, null, 'Ecuador', null, array['Dom. Rep']::text[], 2, false, true, 'https://img', 'seed-9') on conflict (id) do nothing;`,
    );
    expect(sql[1]).toBe(`update humidor_items set cigar_id = ${uuidLit(V1)} where id = ${uuidLit(H1)} and cigar_id = ${uuidLit(V2)};`);
    expect(sql[2]).toBe(`update cigar_catalog set usage_count = 2, image_url = 'https://img' where id = ${uuidLit(V2)};`);
  });
  it("reverses ops in reverse order", () => {
    const c = ctx();
    const ops: Op[] = [
      { ...base, type: "write_name", vitolaId: V2, name: "Classic" },
      { ...base, type: "rename_line", lineId: A, brand: "AF", series: null },
    ];
    const r = buildReceipt({ runId: "run4", opsFile: "o", ops, lines: [...c.lines.values()], vitolas: [...c.vitolas.values()], refs: [] });
    expect(reverseSql(r)[0]).toContain("cigar_lines");
  });
  it("throws when a snapshot is missing for a touched row", () => {
    const ops: Op[] = [{ ...base, type: "write_name", vitolaId: V2, name: "Classic" }];
    expect(() => buildReceipt({ runId: "r", opsFile: "o", ops, lines: [], vitolas: [], refs: [] })).toThrow(/snapshot/);
  });
});

describe("reverseWarnings", () => {
  it("reports recorded refs that no longer point where the receipt expects", () => {
    const c = ctx();
    const ops: Op[] = [{ ...base, type: "merge_vitola", sourceVitolaId: V1, targetVitolaId: V2 }];
    const r = buildReceipt({ runId: "r", opsFile: "o", ops, lines: [], vitolas: [...c.vitolas.values()], refs: [{ table: "humidor_items", id: H1, cigar_id: V1 }] });
    expect(reverseWarnings(r, [{ table: "humidor_items", id: H1, cigar_id: V2 }])).toEqual([]);
    expect(reverseWarnings(r, [])).toEqual([`humidor_items ${H1} no longer points at ${V2}; it will not be repointed`]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/catalog-cleanup/__tests__/receipt.test.ts`
Expected: FAIL, cannot resolve `../receipt`.

- [ ] **Step 3: Write the receipt module**

```ts
// lib/catalog-cleanup/receipt.ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/catalog-cleanup/__tests__/receipt.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/catalog-cleanup/receipt.ts lib/catalog-cleanup/__tests__/receipt.test.ts
git commit -m "feat(catalog-cleanup): undo receipts and reverse SQL

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Executor core and CLI

**Files:**
- Create: `lib/catalog-cleanup/executor-core.ts`
- Create: `scripts/catalog-cleanup/executor.ts`
- Test: `lib/catalog-cleanup/__tests__/executor-core.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces:
  ```ts
  interface Io { readJson(path): unknown; writeText(path, text): void; writeJson(path, data): void; listReceipts(dir): string[]; log(msg): void }
  runRefs(client, io, outDir): Promise<{ vitolasWithRefs: number; totalRefs: number }>
  runPreview(client, io, opsPath, outDir): Promise<{ previewPath: string; blocked: number; ops: Op[]; ctx: CatalogContext }>
  runExecute(client, io, opsPath, outDir): Promise<{ receiptPath: string; applied: number }>
  runUndo(client, io, receiptPath, outDir, opts: { force: boolean }): Promise<{ receiptPath: string; reversed: number }>
  runProbeTxn(client, io): Promise<"rolled back" | "NOT rolled back">
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/catalog-cleanup/__tests__/executor-core.test.ts
import { describe, it, expect, vi } from "vitest";
import { runPreview, runExecute, runUndo, runProbeTxn, runRefs, type Io } from "../executor-core";
import type { MgmtClient } from "../mgmt-client";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const V1 = "33333333-3333-4333-8333-333333333333";
const lineRow = (id: string, brand: string, series: string | null) => ({ id, brand, series, community_added: false, approved: true });
const vitRow = (id: string, line_id: string) => ({ id, line_id, brand: "AF", series: "H NT", name: null, format: null, ring_gauge: null, length_inches: null, wrapper: null, shade: null, wrapper_country: null, binder_country: null, filler_countries: null, usage_count: 0, community_added: false, approved: true, image_url: null, source_id: null });

/** A fake client that answers reads from a tiny in-memory catalog and records batches. */
function fakeClient() {
  const batches: string[][] = [];
  const query = vi.fn(async (sql: string) => {
    if (/from cigar_lines/.test(sql)) return [lineRow(A, "AF", "H"), lineRow(B, "AF", "H NT")].filter((l) => !/where id = any/.test(sql) || sql.includes(l.id));
    if (/from cigar_catalog/.test(sql)) return [vitRow(V1, B)].filter((v) => !/where (id|line_id) = any/.test(sql) || sql.includes(v.id) || sql.includes(v.line_id));
    if (/from humidor_items group by/.test(sql)) return [];
    if (/from humidor_items where/.test(sql)) return [];
    if (/_ae_txn_probe/.test(sql) && /count/.test(sql)) return [{ n: 0 }];
    return [];
  });
  const client: MgmtClient = { projectRef: "x", query, batch: vi.fn(async (s: string[]) => { batches.push(s); }) };
  return { client, batches, query };
}
function fakeIo(files: Record<string, unknown>) {
  const written: Record<string, string> = {};
  const io: Io = {
    readJson: (p) => { if (!(p in files)) throw new Error(`no such file ${p}`); return files[p]; },
    writeText: (p, t) => { written[p] = t; },
    writeJson: (p, d) => { written[p] = JSON.stringify(d); files[p] = d; },
    listReceipts: () => Object.keys(files).filter((f) => f.includes("receipt-")),
    log: () => {},
  };
  return { io, written };
}
const opsFile = { version: 1, generatedAt: "x", generator: "g", ops: [{ type: "fold_line", sourceLineId: B, targetLineId: A, childFills: {}, reason: "r", generator: "g", reviewed: false }] };

describe("runPreview", () => {
  it("writes preview.md and reports blocked count", async () => {
    const { client } = fakeClient();
    const { io, written } = fakeIo({ "ops.json": opsFile });
    const r = await runPreview(client, io, "ops.json", "out");
    expect(r.blocked).toBe(0);
    expect(written["out/preview.md"]).toContain("fold_line");
  });
  it("blocks and does not write a receipt when a precondition fails", async () => {
    const { client, batches } = fakeClient();
    const bad = { ...opsFile, ops: [{ ...opsFile.ops[0], targetLineId: V1 }] };
    const { io } = fakeIo({ "ops.json": bad });
    await expect(runExecute(client, io, "ops.json", "out")).rejects.toThrow(/blocked/);
    expect(batches).toHaveLength(0);
  });
});

describe("runExecute", () => {
  it("writes an uncommitted receipt, sends one batch, then marks the receipt committed", async () => {
    const { client, batches } = fakeClient();
    const files: Record<string, unknown> = { "ops.json": opsFile };
    const { io } = fakeIo(files);
    const r = await runExecute(client, io, "ops.json", "out");
    expect(batches).toHaveLength(1);
    expect(batches[0].join("\n")).toContain("delete from cigar_lines");
    expect((files[r.receiptPath] as { committed: boolean }).committed).toBe(true);
    expect(r.applied).toBe(1);
  });
  it("leaves the receipt uncommitted when the batch throws", async () => {
    const { client } = fakeClient();
    (client.batch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    const files: Record<string, unknown> = { "ops.json": opsFile };
    const { io } = fakeIo(files);
    await expect(runExecute(client, io, "ops.json", "out")).rejects.toThrow(/boom/);
    const receipt = Object.entries(files).find(([k]) => k.includes("receipt-"))![1] as { committed: boolean };
    expect(receipt.committed).toBe(false);
  });
});

describe("runUndo", () => {
  it("refuses an uncommitted receipt and reverses a committed one", async () => {
    const { client, batches } = fakeClient();
    const files: Record<string, unknown> = { "ops.json": opsFile };
    const { io } = fakeIo(files);
    const r = await runExecute(client, io, "ops.json", "out");
    const receipt = files[r.receiptPath] as { committed: boolean };
    files["out/receipt-bad.json"] = { ...receipt, committed: false };
    await expect(runUndo(client, io, "out/receipt-bad.json", "out", { force: false })).rejects.toThrow(/not committed/);
    const u = await runUndo(client, io, r.receiptPath, "out", { force: false });
    expect(batches).toHaveLength(2);
    expect(batches[1].join("\n")).toContain("insert into cigar_lines");
    expect(u.reversed).toBeGreaterThan(0);
  });
});

describe("runProbeTxn", () => {
  it("creates the probe table, forces an error in the same batch, and reports rollback from the row count", async () => {
    const { client, query } = fakeClient();
    const batch = client.batch as ReturnType<typeof vi.fn>;
    batch.mockRejectedValueOnce(new Error("division by zero"));
    const { io } = fakeIo({});
    const result = await runProbeTxn(client, io);
    expect(result).toBe("rolled back");
    expect((batch.mock.calls[0][0] as string[]).join("\n")).toMatch(/create table[\s\S]*insert[\s\S]*1\s*\/\s*0/);
    expect(query.mock.calls.some(([s]) => /drop table if exists _ae_txn_probe/.test(s as string))).toBe(true);
  });
});

describe("runRefs", () => {
  it("writes refs.json and returns totals", async () => {
    const { client } = fakeClient();
    const { io, written } = fakeIo({});
    const r = await runRefs(client, io, "out");
    expect(r).toEqual({ vitolasWithRefs: 0, totalRefs: 0 });
    expect(written["out/refs.json"]).toBe("{}");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/catalog-cleanup/__tests__/executor-core.test.ts`
Expected: FAIL, cannot resolve `../executor-core`.

- [ ] **Step 3: Write the core**

```ts
// lib/catalog-cleanup/executor-core.ts
import type { MgmtClient } from "./mgmt-client";
import { validateOpsFile } from "./ops";
import { forwardSql } from "./sql";
import { checkPreconditions, renderPreview } from "./preview";
import { buildReceipt, collectTouched, reverseSql, reverseWarnings } from "./receipt";
import { buildContext, fetchLines, fetchRefCounts, fetchRefRows, fetchVitolas } from "./catalog-read";
import type { CatalogContext, Op, Receipt } from "./types";

export interface Io {
  readJson(path: string): unknown;
  writeText(path: string, text: string): void;
  writeJson(path: string, data: unknown): void;
  listReceipts(dir: string): string[];
  log(msg: string): void;
}

async function loadContext(client: MgmtClient): Promise<CatalogContext> {
  const [lines, vitolas, refs] = await Promise.all([fetchLines(client), fetchVitolas(client), fetchRefCounts(client)]);
  return buildContext(lines, vitolas, refs);
}

function uncommittedWarnings(io: Io, outDir: string): string[] {
  return io.listReceipts(outDir)
    .filter((p) => { try { return (io.readJson(p) as Receipt).committed === false; } catch { return false; } })
    .map((p) => `receipt ${p} is NOT committed: a previous execute may have failed after writing it; verify prod state before proceeding`);
}

export async function runRefs(client: MgmtClient, io: Io, outDir: string) {
  const refs = await fetchRefCounts(client);
  io.writeJson(`${outDir}/refs.json`, refs);
  const values = Object.values(refs);
  const result = { vitolasWithRefs: values.length, totalRefs: values.reduce((a, b) => a + b, 0) };
  io.log(`real references: ${result.vitolasWithRefs} vitolas, ${result.totalRefs} rows (humidor_items + smoke_logs)`);
  return result;
}

export async function runPreview(client: MgmtClient, io: Io, opsPath: string, outDir: string) {
  const file = validateOpsFile(io.readJson(opsPath));
  const ctx = await loadContext(client);
  const blocked = checkPreconditions(file.ops, ctx);
  const qaSample = file.ops.length >= 10 ? [...Array(Math.ceil(file.ops.length / 10)).keys()].map((i) => i * 10) : [];
  const md = renderPreview({ ops: file.ops, ctx, blocked, generator: file.generator, qaSample, warnings: uncommittedWarnings(io, outDir) });
  const previewPath = `${outDir}/preview.md`;
  io.writeText(previewPath, md);
  io.log(`preview written to ${previewPath} (${file.ops.length} ops, ${blocked.length} blocked)`);
  return { previewPath, blocked: blocked.length, ops: file.ops, ctx };
}

export async function runExecute(client: MgmtClient, io: Io, opsPath: string, outDir: string) {
  const { blocked, ops, ctx } = await runPreview(client, io, opsPath, outDir);
  if (blocked > 0) throw new Error(`${blocked} op(s) blocked; fix the ops file or mark them reviewed. See ${outDir}/preview.md`);
  if (ops.length === 0) { io.log("nothing to do"); return { receiptPath: "", applied: 0 }; }

  const touched = collectTouched(ops, ctx);
  const refs = await fetchRefRows(client, touched.mergeSourceIds);
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const receipt = buildReceipt({
    runId, opsFile: opsPath, ops,
    lines: touched.lineIds.map((id) => ctx.lines.get(id)!),
    vitolas: touched.vitolaIds.map((id) => ctx.vitolas.get(id)!),
    refs,
  });
  const receiptPath = `${outDir}/receipt-${runId}.json`;
  io.writeJson(receiptPath, receipt);

  const statements = ops.flatMap((op) => forwardSql(op, ctx));
  io.log(`sending ${statements.length} statements as one batch`);
  await client.batch(statements);

  io.writeJson(receiptPath, { ...receipt, committed: true });
  io.log(`applied ${ops.length} ops; receipt ${receiptPath}`);
  return { receiptPath, applied: ops.length };
}

export async function runUndo(client: MgmtClient, io: Io, receiptPath: string, outDir: string, opts: { force: boolean }) {
  const receipt = io.readJson(receiptPath) as Receipt;
  if (!receipt || receipt.committed !== true) throw new Error(`receipt ${receiptPath} is not committed; nothing to undo (verify prod state by hand)`);
  const current = await fetchRefRows(client, receipt.snapshots.refs.map((r) => r.cigar_id));
  const warnings = reverseWarnings(receipt, current);
  for (const w of warnings) io.log(`WARNING: ${w}`);
  if (warnings.length && !opts.force) throw new Error(`${warnings.length} reference row(s) changed since the run; re-run with --force to undo anyway`);
  const statements = reverseSql(receipt);
  const undoReceipt = { runId: `undo-${receipt.runId}`, executedAt: new Date().toISOString(), opsFile: receiptPath, committed: false, ops: receipt.ops, snapshots: receipt.snapshots };
  const undoPath = `${outDir}/receipt-undo-${receipt.runId}.json`;
  io.writeJson(undoPath, undoReceipt);
  await client.batch(statements);
  io.writeJson(undoPath, { ...undoReceipt, committed: true });
  io.log(`reversed ${receipt.ops.length} ops (${statements.length} statements); undo receipt ${undoPath}`);
  return { receiptPath: undoPath, reversed: statements.length };
}

/** Proves the channel runs a multi-statement request as one implicit transaction. */
export async function runProbeTxn(client: MgmtClient, io: Io): Promise<"rolled back" | "NOT rolled back"> {
  await client.query("drop table if exists _ae_txn_probe;");
  try {
    await client.batch(["create table _ae_txn_probe (id int);", "insert into _ae_txn_probe values (1);", "select 1 / 0;"]);
    io.log("probe batch did not error; the channel may not run statements together");
  } catch (e) {
    io.log(`probe batch errored as intended: ${(e as Error).message.slice(0, 120)}`);
  }
  const [{ n }] = await client.query<{ n: number | string }>(
    "select count(*) as n from _ae_txn_probe;",
  ).catch(() => [{ n: 0 }]); // table absent = whole batch rolled back
  await client.query("drop table if exists _ae_txn_probe;");
  const result = Number(n) === 0 ? "rolled back" : "NOT rolled back";
  io.log(`transaction probe: ${result}`);
  return result;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/catalog-cleanup/__tests__/executor-core.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the CLI**

```ts
// scripts/catalog-cleanup/executor.ts
/* Catalog cleanup executor. Run with: npx tsx scripts/catalog-cleanup/executor.ts <command> [args]
 *   refs                      count real humidor/smoke-log references per vitola -> refs.json
 *   probe-txn                 prove the Management API batch is one transaction (creates/drops _ae_txn_probe)
 *   preview <ops.json>        write preview.md, no prod writes
 *   execute <ops.json>        preview, then apply as one batch, write receipt
 *   undo <receipt.json> [--force]
 * Env: SUPABASE_MGMT_TOKEN (required for every command; mint at supabase.com/dashboard/account/tokens,
 *      revoke after), SUPABASE_PROJECT_REF (optional). --out <dir> overrides .catalog-cleanup-out/.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { createMgmtClient } from "../../lib/catalog-cleanup/mgmt-client";
import { runExecute, runPreview, runProbeTxn, runRefs, runUndo, type Io } from "../../lib/catalog-cleanup/executor-core";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outDir = outIdx >= 0 ? args.splice(outIdx, 2)[1] : ".catalog-cleanup-out";
const force = args.includes("--force");
const [command, target] = args.filter((a) => a !== "--force");

const io: Io = {
  readJson: (p) => JSON.parse(fs.readFileSync(p, "utf8")),
  writeText: (p, t) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); },
  writeJson: (p, d) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(d, null, 2)); },
  listReceipts: (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith("receipt-") && f.endsWith(".json")).map((f) => path.join(dir, f)) : []),
  log: (m) => console.log(m),
};

async function main() {
  const token = process.env.SUPABASE_MGMT_TOKEN ?? "";
  if (!token) { console.error("SUPABASE_MGMT_TOKEN is not set. Mint one at https://supabase.com/dashboard/account/tokens and run: SUPABASE_MGMT_TOKEN=sbp_... npx tsx scripts/catalog-cleanup/executor.ts ..."); process.exit(2); }
  const client = createMgmtClient({ token, projectRef: process.env.SUPABASE_PROJECT_REF });
  switch (command) {
    case "refs": await runRefs(client, io, outDir); break;
    case "probe-txn": { const r = await runProbeTxn(client, io); if (r !== "rolled back") process.exit(1); break; }
    case "preview": if (!target) throw new Error("preview needs <ops.json>"); { const r = await runPreview(client, io, target, outDir); if (r.blocked) process.exit(1); } break;
    case "execute": if (!target) throw new Error("execute needs <ops.json>"); await runExecute(client, io, target, outDir); break;
    case "undo": if (!target) throw new Error("undo needs <receipt.json>"); await runUndo(client, io, target, outDir, { force }); break;
    default: console.error("usage: executor.ts refs | probe-txn | preview <ops.json> | execute <ops.json> | undo <receipt.json> [--force] [--out <dir>]"); process.exit(2);
  }
  console.log("Done. Revoke the token at https://supabase.com/dashboard/account/tokens when the session's runs are finished.");
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
```

- [ ] **Step 6: Type-check and smoke the CLI without a token**

Run: `npx tsc --noEmit -p tsconfig.json && npx tsx scripts/catalog-cleanup/executor.ts preview nope.json; echo "exit $?"`
Expected: tsc clean; CLI prints the SUPABASE_MGMT_TOKEN message and `exit 2`.

- [ ] **Step 7: Commit**

```bash
git add lib/catalog-cleanup/executor-core.ts lib/catalog-cleanup/__tests__/executor-core.test.ts scripts/catalog-cleanup/executor.ts
git commit -m "feat(catalog-cleanup): executor core (refs, probe-txn, preview, execute, undo) and CLI

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Natural shade + Tier-A rules generator

**Files:**
- Modify: `lib/cigar-taxonomy.ts:22-32` (SHADES)
- Create: `lib/catalog-cleanup/rules-tier-a.ts`
- Create: `scripts/catalog-cleanup/gen-tier-a.ts`
- Test: `lib/catalog-cleanup/__tests__/rules-tier-a.test.ts`

**Interfaces:**
- Consumes: types; `SHADES`, `WRAPPERS` from `lib/cigar-taxonomy.ts`.
- Produces:
  ```ts
  NOISE_FILL: Record<string, ChildFill>
  norm(s: string | null | undefined): string
  generateTierA(lines: LineRow[], vitolas: VitolaRow[], refs: RefCounts): { ops: Op[]; deferred: Deferred[]; summary: Record<string, number> }
  interface Deferred { kind: "fold_line" | "merge_vitola"; flaggedWhy: string; sourceLineId?: string; targetLineId?: string; sourceVitolaId?: string; targetVitolaId?: string; label: string }
  ```

- [ ] **Step 1: Add the Natural shade**

In `lib/cigar-taxonomy.ts`, insert after the `Colorado Claro` entry:

```ts
  { name: "Natural",                description: "Light Brown / Untreated" },
```

- [ ] **Step 2: Write the failing tests**

```ts
// lib/catalog-cleanup/__tests__/rules-tier-a.test.ts
import { describe, it, expect } from "vitest";
import { generateTierA, NOISE_FILL, norm } from "../rules-tier-a";
import { SHADES, WRAPPERS } from "../../cigar-taxonomy";
import type { LineRow, VitolaRow } from "../types";

let n = 0;
const uid = () => `${(++n).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
const line = (brand: string, series: string | null, extra: Partial<LineRow> = {}): LineRow => ({ id: uid(), brand, series, community_added: false, approved: true, ...extra });
const vit = (l: LineRow, extra: Partial<VitolaRow> = {}): VitolaRow => ({
  id: uid(), line_id: l.id, brand: l.brand, series: l.series, name: null, format: "Robusto", ring_gauge: 50, length_inches: 5,
  wrapper: null, shade: null, wrapper_country: null, binder_country: null, filler_countries: null, usage_count: 0,
  community_added: false, approved: true, image_url: null, source_id: "seed", ...extra,
});

describe("NOISE_FILL", () => {
  it("only maps onto names that exist in the taxonomy", () => {
    const shades = new Set(SHADES.map((s) => s.name)), wrappers = new Set(WRAPPERS.map((w) => w.name));
    for (const fill of Object.values(NOISE_FILL)) {
      if (fill.shade) expect(shades.has(fill.shade)).toBe(true);
      if (fill.wrapper) expect(wrappers.has(fill.wrapper)).toBe(true);
    }
    expect(NOISE_FILL.nt).toEqual({ shade: "Natural" });
    expect(NOISE_FILL.connecticut).toEqual({ wrapper: "Connecticut Shade" });
  });
});

describe("generateTierA", () => {
  it("R1: folds case/whitespace duplicate lines into the one with the most vitolas", () => {
    const a = line("Chateau Fuente", null), b = line("chateau fuente ", null);
    const vs = [vit(a), vit(a), vit(b)];
    const r = generateTierA([a, b], vs, {});
    expect(r.ops).toEqual([expect.objectContaining({ type: "fold_line", sourceLineId: b.id, targetLineId: a.id, childFills: {} })]);
    expect(r.ops[0].reason).toMatch(/case\/whitespace/);
  });
  it("R2: folds a wrapper-noise suffix line and fills the child's null shade", () => {
    const p = line("Arturo Fuente", "Hemingway Best Seller"), x = line("Arturo Fuente", "Hemingway Best Seller NT");
    const kid = vit(x);
    const r = generateTierA([p, x], [vit(p), kid], {});
    expect(r.ops).toEqual([expect.objectContaining({ type: "fold_line", sourceLineId: x.id, targetLineId: p.id, childFills: { [kid.id]: { shade: "Natural" } } })]);
  });
  it("R2: treats 'Sun Grown' as one token and maps it to the Sun Grown shade", () => {
    const p = line("Oliva", "Serie G"), x = line("Oliva", "Serie G Sun Grown");
    const kid = vit(x);
    const r = generateTierA([p, x], [vit(p), kid], {});
    expect(r.ops[0]).toMatchObject({ childFills: { [kid.id]: { shade: "Sun Grown" } } });
  });
  it("R2: does not fill when the child already carries the same value, and defers on a conflicting value", () => {
    const p = line("AF", "Hemingway"), x = line("AF", "Hemingway Maduro"), y = line("AF", "Hemingway Oscuro");
    const same = vit(x, { shade: "Maduro" }), conflict = vit(y, { shade: "Maduro" });
    const r = generateTierA([p, x, y], [vit(p), same, conflict], {});
    expect(r.ops).toEqual([expect.objectContaining({ sourceLineId: x.id, childFills: {} })]);
    expect(r.deferred).toEqual([expect.objectContaining({ kind: "fold_line", sourceLineId: y.id, flaggedWhy: expect.stringMatching(/conflict/) })]);
  });
  it("R2: defers named remainders, community-added lines, and lines with real references", () => {
    const p = line("L'Atelier", "Imports"), sub = line("L'Atelier", "Imports La Mission");
    const c = line("Padron", "1964"), cc = line("Padron", "1964 Maduro", { community_added: true });
    const u = line("Oliva", "V"), ux = line("Oliva", "V Maduro");
    const uKid = vit(ux);
    const r = generateTierA([p, sub, c, cc, u, ux], [vit(p), vit(sub), vit(c), vit(cc), vit(u), uKid], { [uKid.id]: 1 });
    expect(r.ops).toEqual([]);
    expect(r.deferred.map((d) => d.flaggedWhy).sort()).toEqual(["community-added", "named remainder (possible sub-brand)", "real references 1"].sort());
  });
  it("R3: merges identical-composition vitolas within a line, keeping the highest usage, and never merges by name alone", () => {
    const l = line("Perdomo", "Habano Bourbon Barrel-Aged");
    const keep = vit(l, { name: "Maduro", usage_count: 3 }), dup = vit(l, { name: "Maduro", usage_count: 1 });
    const otherSize = vit(l, { name: "Maduro", ring_gauge: 54, length_inches: 6 });
    const r = generateTierA([l], [keep, dup, otherSize], {});
    expect(r.ops).toEqual([expect.objectContaining({ type: "merge_vitola", sourceVitolaId: dup.id, targetVitolaId: keep.id })]);
  });
  it("R3: defers a duplicate whose source has real references", () => {
    const l = line("X", "Y");
    const keep = vit(l), dup = vit(l);
    const r = generateTierA([l], [keep, dup], { [dup.id]: 2 });
    expect(r.ops).toEqual([]);
    expect(r.deferred[0]).toMatchObject({ kind: "merge_vitola", flaggedWhy: "real references 2" });
  });
  it("reports a summary", () => {
    const r = generateTierA([], [], {});
    expect(r.summary).toEqual({ caseDupeFolds: 0, noiseFolds: 0, vitolaMerges: 0, deferred: 0 });
  });
});

describe("norm", () => {
  it("lowercases, trims, collapses whitespace, and joins sun grown", () => {
    expect(norm("  Serie  G  Sun Grown ")).toBe("serie g sungrown");
    expect(norm(null)).toBe("");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run lib/catalog-cleanup/__tests__/rules-tier-a.test.ts`
Expected: FAIL, cannot resolve `../rules-tier-a`.

- [ ] **Step 4: Write the generator**

```ts
// lib/catalog-cleanup/rules-tier-a.ts
import type { ChildFill, FoldLineOp, LineRow, MergeVitolaOp, Op, RefCounts, VitolaRow } from "./types";

const GEN = "rules-tier-a";

/** Series-suffix tokens that name a wrapper or shade, and what they fill on the child. */
export const NOISE_FILL: Record<string, ChildFill> = {
  nt: { shade: "Natural" }, natural: { shade: "Natural" },
  md: { shade: "Maduro" }, maduro: { shade: "Maduro" },
  oscuro: { shade: "Oscuro / Double Maduro" },
  claro: { shade: "Claro" },
  sungrown: { shade: "Sun Grown" },
  connecticut: { wrapper: "Connecticut Shade" },
  broadleaf: { wrapper: "Connecticut Broadleaf" },
  habano: { wrapper: "Habano" },
  corojo: { wrapper: "Corojo" },
  cameroon: { wrapper: "Cameroon" },
};

export const norm = (s: string | null | undefined): string =>
  (s ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\bsun grown\b/g, "sungrown");
const tokens = (s: string | null | undefined) => norm(s).split(" ").filter(Boolean);
const rawTokens = (s: string) => s.trim().replace(/\s+/g, " ").replace(/\bSun Grown\b/gi, "SunGrown").split(" ");

export interface Deferred {
  kind: "fold_line" | "merge_vitola";
  flaggedWhy: string;
  sourceLineId?: string; targetLineId?: string;
  sourceVitolaId?: string; targetVitolaId?: string;
  label: string;
}

export function generateTierA(lines: LineRow[], vitolas: VitolaRow[], refs: RefCounts) {
  const ops: Op[] = [];
  const deferred: Deferred[] = [];
  const kidsOf = new Map<string, VitolaRow[]>();
  for (const v of vitolas) if (v.line_id) kidsOf.set(v.line_id, [...(kidsOf.get(v.line_id) ?? []), v]);
  const kids = (l: LineRow) => kidsOf.get(l.id) ?? [];
  const refsOf = (l: LineRow) => kids(l).reduce((s, k) => s + (refs[k.id] ?? 0), 0);
  const label = (l: LineRow) => `${l.brand} / ${l.series ?? "-"}`;
  const folded = new Set<string>();
  const summary = { caseDupeFolds: 0, noiseFolds: 0, vitolaMerges: 0, deferred: 0 };

  /* R1: case/whitespace duplicate lines */
  const byIdent = new Map<string, LineRow[]>();
  for (const l of lines) { const k = `${norm(l.brand)}|${norm(l.series)}`; byIdent.set(k, [...(byIdent.get(k) ?? []), l]); }
  for (const group of byIdent.values()) {
    if (group.length < 2) continue;
    const [keep, ...drop] = [...group].sort((a, b) => kids(b).length - kids(a).length || a.id.localeCompare(b.id));
    for (const d of drop) {
      const op: FoldLineOp = { type: "fold_line", sourceLineId: d.id, targetLineId: keep.id, childFills: {}, generator: GEN, reviewed: false,
        reason: `case/whitespace duplicate of ${label(keep)}` };
      ops.push(op); folded.add(d.id); summary.caseDupeFolds++;
    }
  }

  /* R2: wrapper-noise suffix folds */
  const byBrand = new Map<string, LineRow[]>();
  for (const l of lines) byBrand.set(norm(l.brand), [...(byBrand.get(norm(l.brand)) ?? []), l]);
  for (const group of byBrand.values()) {
    for (const x of group) {
      if (!x.series || folded.has(x.id)) continue;
      const tx = tokens(x.series);
      let parent: LineRow | null = null;
      for (const p of group) {
        if (p.id === x.id || !p.series || folded.has(p.id)) continue;
        const tp = tokens(p.series);
        if (tp.length >= tx.length || !tp.every((t, i) => t === tx[i])) continue;
        if (!parent || tokens(parent.series).length < tp.length) parent = p;
      }
      if (!parent) continue;
      const remainder = tx.slice(tokens(parent.series).length);
      const remainderRaw = rawTokens(x.series).slice(tokens(parent.series).length).join(" ");
      const defer = (why: string) => { deferred.push({ kind: "fold_line", flaggedWhy: why, sourceLineId: x.id, targetLineId: parent!.id, label: `${label(x)} → ${label(parent!)} [${remainderRaw}]` }); summary.deferred++; };
      if (!remainder.every((t) => t in NOISE_FILL)) { defer("named remainder (possible sub-brand)"); continue; }
      const xs = kids(x);
      if (x.community_added || xs.some((k) => k.community_added)) { defer("community-added"); continue; }
      const r = refsOf(x);
      if (r > 0) { defer(`real references ${r}`); continue; }
      const childFills: Record<string, ChildFill> = {};
      let conflict: string | null = null;
      for (const k of xs) {
        const fill: ChildFill = {};
        for (const t of remainder) {
          const f = NOISE_FILL[t];
          if (f.shade) {
            if (k.shade === null) { if (fill.shade && fill.shade !== f.shade) conflict = `two shades in suffix (${fill.shade}, ${f.shade})`; fill.shade = f.shade; }
            else if (norm(k.shade) !== norm(f.shade)) conflict = `child shade "${k.shade}" conflicts with suffix ${t}`;
          }
          if (f.wrapper) {
            if (k.wrapper === null) { if (fill.wrapper && fill.wrapper !== f.wrapper) conflict = `two wrappers in suffix (${fill.wrapper}, ${f.wrapper})`; fill.wrapper = f.wrapper; }
            else if (norm(k.wrapper) !== norm(f.wrapper)) conflict = `child wrapper "${k.wrapper}" conflicts with suffix ${t}`;
          }
        }
        if (Object.keys(fill).length) childFills[k.id] = fill;
      }
      if (conflict) { defer(conflict); continue; }
      ops.push({ type: "fold_line", sourceLineId: x.id, targetLineId: parent.id, childFills, generator: GEN, reviewed: false,
        reason: `series extends "${parent.series}" by wrapper-noise "${remainderRaw}"` });
      folded.add(x.id); summary.noiseFolds++;
    }
  }

  /* R3: identical-composition vitolas within a line */
  for (const l of lines) {
    const ks = kids(l);
    if (ks.length < 2) continue;
    const seen = new Map<string, VitolaRow[]>();
    for (const c of ks) {
      const key = [norm(c.name), norm(c.format), c.ring_gauge ?? "", c.length_inches ?? "", norm(c.wrapper), norm(c.shade)].join("|");
      seen.set(key, [...(seen.get(key) ?? []), c]);
    }
    for (const group of seen.values()) {
      if (group.length < 2) continue;
      const [keep, ...drop] = [...group].sort((a, b) => b.usage_count - a.usage_count || a.id.localeCompare(b.id));
      for (const d of drop) {
        const r = refs[d.id] ?? 0;
        const lbl = `${label(l)} / ${d.name ?? "-"} ${d.length_inches ?? "?"}x${d.ring_gauge ?? "?"}`;
        if (r > 0) { deferred.push({ kind: "merge_vitola", flaggedWhy: `real references ${r}`, sourceVitolaId: d.id, targetVitolaId: keep.id, label: lbl }); summary.deferred++; continue; }
        const op: MergeVitolaOp = { type: "merge_vitola", sourceVitolaId: d.id, targetVitolaId: keep.id, generator: GEN, reviewed: false,
          reason: `identical full composition in ${label(l)} (name + format + dims + wrapper + shade)` };
        ops.push(op); summary.vitolaMerges++;
      }
    }
  }

  return { ops, deferred, summary };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/catalog-cleanup/__tests__/rules-tier-a.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Write the CLI wrapper**

```ts
// scripts/catalog-cleanup/gen-tier-a.ts
/* Pass-1 generator: Tier-A rules -> ops.json + deferred.json.
 * Run: SUPABASE_MGMT_TOKEN=sbp_... npx tsx scripts/catalog-cleanup/gen-tier-a.ts [--out .catalog-cleanup-out] */
import * as fs from "node:fs";
import * as path from "node:path";
import { createMgmtClient } from "../../lib/catalog-cleanup/mgmt-client";
import { fetchLines, fetchRefCounts, fetchVitolas } from "../../lib/catalog-cleanup/catalog-read";
import { generateTierA } from "../../lib/catalog-cleanup/rules-tier-a";
import type { OpsFile } from "../../lib/catalog-cleanup/types";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outDir = outIdx >= 0 ? args[outIdx + 1] : ".catalog-cleanup-out";

async function main() {
  const token = process.env.SUPABASE_MGMT_TOKEN ?? "";
  if (!token) { console.error("SUPABASE_MGMT_TOKEN is not set"); process.exit(2); }
  const client = createMgmtClient({ token, projectRef: process.env.SUPABASE_PROJECT_REF });
  const [lines, vitolas, refs] = await Promise.all([fetchLines(client), fetchVitolas(client), fetchRefCounts(client)]);
  const { ops, deferred, summary } = generateTierA(lines, vitolas, refs);
  const file: OpsFile = { version: 1, generatedAt: new Date().toISOString(), generator: "rules-tier-a", ops };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "ops-tier-a.json"), JSON.stringify(file, null, 2));
  fs.writeFileSync(path.join(outDir, "deferred.json"), JSON.stringify(deferred, null, 2));
  console.log(`lines ${lines.length}, vitolas ${vitolas.length}, vitolas with real refs ${Object.keys(refs).length}`);
  console.log(`ops: case-dupe folds ${summary.caseDupeFolds}, noise folds ${summary.noiseFolds}, vitola merges ${summary.vitolaMerges}; deferred ${summary.deferred}`);
  console.log(`wrote ${path.join(outDir, "ops-tier-a.json")} and deferred.json`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
```

- [ ] **Step 7: Type-check and run the whole unit suite**

Run: `npx tsc --noEmit -p tsconfig.json && npm run test:unit`
Expected: tsc clean; all suites pass (the pre-existing suites plus the new catalog-cleanup ones).

- [ ] **Step 8: Commit**

```bash
git add lib/cigar-taxonomy.ts lib/catalog-cleanup/rules-tier-a.ts lib/catalog-cleanup/__tests__/rules-tier-a.test.ts scripts/catalog-cleanup/gen-tier-a.ts
git commit -m "feat(catalog-cleanup): Tier-A rules generator (case dupes, wrapper-noise folds, vitola dupes) + Natural shade

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Format→name generator

**Files:**
- Create: `lib/catalog-cleanup/rules-format-name.ts`
- Create: `scripts/catalog-cleanup/gen-format-name.ts`
- Test: `lib/catalog-cleanup/__tests__/rules-format-name.test.ts`

**Interfaces:**
- Consumes: types; `FORMATS` from `lib/cigar-taxonomy.ts`.
- Produces: `generateFormatName(vitolas: VitolaRow[], formats: string[]): { ops: UpdateVitolaOp[]; summary: { candidates: number; splittable: number; untouched: number; communityAdded: number } }`, `splitFormat(format: string, formats: string[]): { name: string; format: string } | null`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/catalog-cleanup/__tests__/rules-format-name.test.ts
import { describe, it, expect } from "vitest";
import { generateFormatName, splitFormat } from "../rules-format-name";
import { FORMATS } from "../../cigar-taxonomy";
import type { VitolaRow } from "../types";

let n = 0;
const uid = () => `${(++n).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
const vit = (extra: Partial<VitolaRow>): VitolaRow => ({
  id: uid(), line_id: uid(), brand: "B", series: "S", name: null, format: null, ring_gauge: 50, length_inches: 5, wrapper: null, shade: null,
  wrapper_country: null, binder_country: null, filler_countries: null, usage_count: 0, community_added: false, approved: true, image_url: null, source_id: "seed", ...extra,
});

describe("splitFormat", () => {
  it("keeps the full label as the name and the longest contained canonical shape as the format", () => {
    expect(splitFormat("Best Seller Robusto", FORMATS)).toEqual({ name: "Best Seller Robusto", format: "Robusto" });
    expect(splitFormat("No. 4 petit corona", FORMATS)).toEqual({ name: "No. 4 petit corona", format: "Petit Corona" });
    expect(splitFormat("Double Corona Maduro", FORMATS)).toEqual({ name: "Double Corona Maduro", format: "Double Corona" });
  });
  it("matches whole words only, and returns null for canonical or unsplittable values", () => {
    expect(splitFormat("Coronas Especiales", FORMATS)).toBeNull();
    expect(splitFormat("Toro", FORMATS)).toBeNull();
    expect(splitFormat(" toro ", FORMATS)).toBeNull();
    expect(splitFormat("Short Story", FORMATS)).toBeNull();
    expect(splitFormat("Gordo", FORMATS)).toBeNull();
  });
  it("ignores canonical tokens of 3 letters or fewer", () => {
    expect(splitFormat("Toro XL", ["XL", ...FORMATS])).toEqual({ name: "Toro XL", format: "Toro" });
  });
});

describe("generateFormatName", () => {
  it("emits one update_vitola per splittable nameless row and counts the rest", () => {
    const a = vit({ format: "Best Seller Robusto" });
    const named = vit({ format: "Best Seller Robusto", name: "Already" });
    const canon = vit({ format: "Toro" });
    const nope = vit({ format: "Short Story" });
    const community = vit({ format: "Serie V Torpedo", community_added: true });
    const r = generateFormatName([a, named, canon, nope, community], FORMATS);
    expect(r.ops).toEqual([
      expect.objectContaining({ type: "update_vitola", vitolaId: a.id, fields: { name: "Best Seller Robusto", format: "Robusto" } }),
      expect.objectContaining({ type: "update_vitola", vitolaId: community.id, fields: { name: "Serie V Torpedo", format: "Torpedo" }, reason: expect.stringMatching(/community-added/) }),
    ]);
    expect(r.summary).toEqual({ candidates: 3, splittable: 2, untouched: 1, communityAdded: 1 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/catalog-cleanup/__tests__/rules-format-name.test.ts`
Expected: FAIL, cannot resolve `../rules-format-name`.

- [ ] **Step 3: Write the generator**

```ts
// lib/catalog-cleanup/rules-format-name.ts
import type { UpdateVitolaOp, VitolaRow } from "./types";

const GEN = "rules-format-name";
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** name = the full current label; format = the longest canonical shape it contains as whole words. */
export function splitFormat(format: string, formats: string[]): { name: string; format: string } | null {
  const label = format.trim().replace(/\s+/g, " ");
  const lower = label.toLowerCase();
  const canonical = new Set(formats.map((f) => f.toLowerCase()));
  if (canonical.has(lower)) return null;
  let best: string | null = null;
  for (const f of formats) {
    if (f.length <= 3) continue;
    if (new RegExp(`(^|\\s)${escapeRe(f.toLowerCase())}(\\s|$)`).test(lower) && (!best || f.length > best.length)) best = f;
  }
  return best ? { name: label, format: best } : null;
}

export function generateFormatName(vitolas: VitolaRow[], formats: string[]) {
  const ops: UpdateVitolaOp[] = [];
  const summary = { candidates: 0, splittable: 0, untouched: 0, communityAdded: 0 };
  for (const v of vitolas) {
    if (v.name !== null || !v.format) continue;
    const split = splitFormat(v.format, formats);
    if (!split && formats.some((f) => f.toLowerCase() === v.format!.trim().toLowerCase())) continue; // already canonical, not a candidate
    summary.candidates++;
    if (!split) { summary.untouched++; continue; }
    summary.splittable++;
    if (v.community_added) summary.communityAdded++;
    ops.push({
      type: "update_vitola", vitolaId: v.id, fields: { name: split.name, format: split.format }, generator: GEN, reviewed: false,
      reason: `format "${v.format}" carries a vitola name; shape token "${split.format}"${v.community_added ? " (community-added row)" : ""}`,
    });
  }
  return { ops, summary };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/catalog-cleanup/__tests__/rules-format-name.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the CLI wrapper**

```ts
// scripts/catalog-cleanup/gen-format-name.ts
/* Pass-1 generator: format -> name split for nameless vitolas -> ops-format-name.json.
 * Run: SUPABASE_MGMT_TOKEN=sbp_... npx tsx scripts/catalog-cleanup/gen-format-name.ts [--out .catalog-cleanup-out] */
import * as fs from "node:fs";
import * as path from "node:path";
import { createMgmtClient } from "../../lib/catalog-cleanup/mgmt-client";
import { fetchVitolas } from "../../lib/catalog-cleanup/catalog-read";
import { generateFormatName } from "../../lib/catalog-cleanup/rules-format-name";
import { FORMATS } from "../../lib/cigar-taxonomy";
import type { OpsFile } from "../../lib/catalog-cleanup/types";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outDir = outIdx >= 0 ? args[outIdx + 1] : ".catalog-cleanup-out";

async function main() {
  const token = process.env.SUPABASE_MGMT_TOKEN ?? "";
  if (!token) { console.error("SUPABASE_MGMT_TOKEN is not set"); process.exit(2); }
  const client = createMgmtClient({ token, projectRef: process.env.SUPABASE_PROJECT_REF });
  const vitolas = await fetchVitolas(client);
  const { ops, summary } = generateFormatName(vitolas, FORMATS);
  const file: OpsFile = { version: 1, generatedAt: new Date().toISOString(), generator: "rules-format-name", ops };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "ops-format-name.json"), JSON.stringify(file, null, 2));
  console.log(`nameless non-canonical candidates ${summary.candidates}: splittable ${summary.splittable} (community-added ${summary.communityAdded}), untouched ${summary.untouched}`);
  console.log(`wrote ${path.join(outDir, "ops-format-name.json")}`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
```

- [ ] **Step 6: Type-check and run the unit suite**

Run: `npx tsc --noEmit -p tsconfig.json && npm run test:unit`
Expected: clean and green.

- [ ] **Step 7: Commit**

```bash
git add lib/catalog-cleanup/rules-format-name.ts lib/catalog-cleanup/__tests__/rules-format-name.test.ts scripts/catalog-cleanup/gen-format-name.ts
git commit -m "feat(catalog-cleanup): format-to-name generator

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: README, retire the temp scripts, lint

**Files:**
- Create: `scripts/catalog-cleanup/README.md`
- Delete (untracked, local only): `.catalog-audit-v2.tmp.mjs`, `.format-analysis.tmp.mjs`, `.research-targets.tmp.mjs` in the repo root

- [ ] **Step 1: Write the README**

```markdown
# Catalog cleanup executor

Bulk catalog cleanup for production, run from this machine through the Supabase
Management API with a disposable token. Spec:
`docs/superpowers/specs/2026-09-26-catalog-cleanup-executor-design.md`.

## Before every session

1. Mint a personal access token at https://supabase.com/dashboard/account/tokens.
2. Export it for the shell only (never write it to a file):
   `export SUPABASE_MGMT_TOKEN=sbp_...`
3. Revoke it when the session's runs are done.

Outputs (ops files, previews, receipts) land in `.catalog-cleanup-out/` (git-ignored).
Keep the receipts: they are the undo.

## First run (pass 1)

```
npx tsx scripts/catalog-cleanup/executor.ts probe-txn        # once: proves a batch is one transaction
npx tsx scripts/catalog-cleanup/executor.ts refs             # real reference counts -> refs.json
npx tsx scripts/catalog-cleanup/gen-tier-a.ts                # -> ops-tier-a.json + deferred.json
npx tsx scripts/catalog-cleanup/executor.ts preview .catalog-cleanup-out/ops-tier-a.json
#   read preview.md; approve the rules; then
npx tsx scripts/catalog-cleanup/executor.ts execute .catalog-cleanup-out/ops-tier-a.json
npx tsx scripts/catalog-cleanup/gen-format-name.ts           # -> ops-format-name.json
npx tsx scripts/catalog-cleanup/executor.ts preview .catalog-cleanup-out/ops-format-name.json
npx tsx scripts/catalog-cleanup/executor.ts execute .catalog-cleanup-out/ops-format-name.json
```

Then apply `supabase/migrations/20260909_line_identity_normalize.sql` through the same
channel: run its probe (expect 0 rows), apply, run its verify block.

## Undo

```
npx tsx scripts/catalog-cleanup/executor.ts undo .catalog-cleanup-out/receipt-<runId>.json
```

Refuses uncommitted receipts. If member rows moved since the run it stops and lists
them; `--force` proceeds without repointing those rows.

## Op types

fold_line, rename_line, update_vitola, merge_vitola, write_name. See
`lib/catalog-cleanup/types.ts`. Unreviewed ops never touch community-added lines or
vitolas with real references (humidor items or smoke logs); set `reviewed: true` on an
op only after a human looked at it.
```

- [ ] **Step 2: Remove the superseded temp scripts**

Run: `rm -f .catalog-audit-v2.tmp.mjs .format-analysis.tmp.mjs .research-targets.tmp.mjs && git status --short | grep -c tmp.mjs`
Expected: `0` (they were untracked, so nothing to commit for the deletion).

- [ ] **Step 3: Lint the new files**

Run: `npx eslint lib/catalog-cleanup scripts/catalog-cleanup`
Expected: no errors (warnings acceptable; fix any error inline).

- [ ] **Step 4: Full CI gate locally**

Run: `npx tsc --noEmit -p tsconfig.json && npm run test:unit && npm run build`
Expected: all green (the build must still succeed; nothing here is imported by the app, but the taxonomy edit touches app code).

- [ ] **Step 5: Commit**

```bash
git add scripts/catalog-cleanup/README.md
git commit -m "docs(catalog-cleanup): executor README and pass-1 runbook

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Manual steps after the branch merges (Dave + Claude, not the implementer)

1. Dave mints a token. Run `probe-txn`; it must print `rolled back`. If it prints `NOT rolled back`, stop: the batch model in `executor-core.ts` must switch to explicit transaction control before any execute.
2. Run `refs`; read the totals. This decides how much of pass 1 stays automatic.
3. `gen-tier-a` → `preview` → Dave reads `preview.md` (samples per rule, the childFills mapping, the deferred summary) → `execute`.
4. `gen-format-name` → `preview` → Dave confirms the name = full label rule from the samples → `execute`.
5. Apply the 20260909 migration through the Management API (probe, apply, verify).
6. Dave revokes the token.
