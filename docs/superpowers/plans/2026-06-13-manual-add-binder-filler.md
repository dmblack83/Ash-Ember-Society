# Unify Cigar Detail Capture (Binder + Filler) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the manual "add cigar" flow capture the same detail fields as the "update cigar" flow (adding Binder Country + Filler Countries) by extracting one shared form component and one shared pure-logic module used by all three sheets.

**Architecture:** A presentational `CigarDetailFields` component renders the 10-field detail grid (controlled, no submit logic). A pure module `lib/cigars/cigar-details.ts` holds the type, the order-preserving filler toggle, and the persistence mappers — this is where unit tests live (the project tests pure logic in `lib/`, node env, no React Testing Library). Three sheets (`AddCigarSheet`, `WishlistClient`, `SuggestCigarEditSheet`) consume both. A SQL migration extends the `insert_cigar_to_catalog` RPC and the `cigar_catalog_suggestions` table with the two new columns; `cigar_catalog` already has them.

**Tech Stack:** Next.js (App Router) client components, TypeScript, Supabase JS client + Postgres RPC, Vitest (node env).

---

## Background facts the implementer needs

- **Taxonomy lives in `lib/cigar-taxonomy.ts`** and exports `FORMATS: string[]`, `RING_GAUGES: number[]`, `LENGTHS: LengthOption[]` (`{label,inches}`), `SHADES`, `WRAPPERS`, `WRAPPER_COUNTRIES` (each `OptionWithDescription = {name, description}`). Decision from the spec: render **name only**, never the description.
- **`cigar_catalog` already has** `binder_country text` and `filler_countries text[]`. Proof: `app/api/admin/cigar-edit-suggestions/[id]/route.ts` whitelists and writes both today. Do **not** add them to `cigar_catalog`.
- **Two manual-add write paths** exist in both `AddCigarSheet` and `WishlistClient`: (1) the `insert_cigar_to_catalog` RPC that creates the catalog row, and (2) an optional `cigar_catalog_suggestions` insert gated on a "Submit to catalog" checkbox.
- **`filler_countries` order is user-controlled and meaningful.** Pills append on tap, remove on re-tap, and the array order is preserved and compared by content+order.
- **Migrations are NOT auto-applied.** This repo has a documented history of migration drift. The migration file must be run by hand in the Supabase SQL editor before the UI ships, or the RPC call fails on unknown parameters.
- **Tests:** `npm run test:unit` runs `vitest run lib/` (only `lib/**/*.test.ts`, node environment). There is no jsdom / RTL. Typecheck with `npx tsc --noEmit`.

---

## File Structure

- **Create** `supabase/migrations/20260613_cigar_binder_filler_manual_add.sql` — RPC + suggestions-table migration.
- **Create** `lib/cigars/cigar-details.ts` — `CigarDetails` type, `EMPTY_CIGAR_DETAILS`, `toggleFiller`, `cigarDetailsToCatalogFields`, `cigarDetailsToRpcArgs`, `cigarDetailsToSuggestionRow`, `diffCigarFields`, `cigarDetailsFromCurrent`.
- **Create** `lib/cigars/__tests__/cigar-details.test.ts` — unit tests for the pure logic.
- **Create** `components/cigars/CigarDetailFields.tsx` — presentational controlled form grid.
- **Modify** `components/cigars/SuggestCigarEditSheet.tsx` — use shared component + lib mappers (mechanics unchanged).
- **Modify** `components/humidor/AddCigarSheet.tsx` — use shared component; extend RPC + suggestion writes with binder/filler.
- **Modify** `components/humidor/WishlistClient.tsx` — same as AddCigarSheet; also gains Shade (currently missing) for free.

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260613_cigar_binder_filler_manual_add.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- ============================================================
-- cigar_binder_filler_manual_add
--   Bring the manual "add cigar" write paths up to parity with
--   the "update cigar" flow by persisting binder_country and
--   filler_countries.
--
--   1. cigar_catalog_suggestions gains the two columns so a
--      community-submitted catalog row can carry them.
--   2. insert_cigar_to_catalog gains p_binder_country (text) and
--      p_filler_countries (text[]), written into the existing
--      cigar_catalog columns of the same name.
--
--   cigar_catalog itself is unchanged — both columns already
--   exist (the edit-approve path writes them).
--
--   Run in the Supabase SQL editor.
-- ============================================================

alter table cigar_catalog_suggestions
  add column if not exists binder_country   text,
  add column if not exists filler_countries text[];

create or replace function insert_cigar_to_catalog(
  p_brand            text,
  p_series           text    default null,
  p_format           text    default null,
  p_ring_gauge       numeric default null,
  p_length_inches    numeric default null,
  p_wrapper          text    default null,
  p_wrapper_country  text    default null,
  p_shade            text    default null,
  p_binder_country   text    default null,
  p_filler_countries text[]  default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into cigar_catalog (
    source_id,
    brand,
    series,
    format,
    ring_gauge,
    length_inches,
    wrapper,
    wrapper_country,
    shade,
    binder_country,
    filler_countries,
    community_added,
    approved,
    usage_count
  ) values (
    'community-' || gen_random_uuid()::text,
    p_brand,
    p_series,
    p_format,
    p_ring_gauge,
    p_length_inches,
    p_wrapper,
    p_wrapper_country,
    p_shade,
    p_binder_country,
    p_filler_countries,
    true,
    false,
    0
  )
  returning id into v_id;

  return v_id;
end;
$$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260613_cigar_binder_filler_manual_add.sql
git commit -m "feat(db): extend insert_cigar_to_catalog + suggestions with binder/filler"
```

> NOTE FOR THE OPERATOR (Dave): this SQL must be run manually in the Supabase SQL editor before the UI is deployed. Recreating the function changes its signature; the client calls it with the new params.

---

## Task 2: Shared pure-logic module (TDD)

**Files:**
- Create: `lib/cigars/cigar-details.ts`
- Test: `lib/cigars/__tests__/cigar-details.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import {
  EMPTY_CIGAR_DETAILS,
  toggleFiller,
  cigarDetailsToCatalogFields,
  cigarDetailsToRpcArgs,
  cigarDetailsToSuggestionRow,
  diffCigarFields,
  cigarDetailsFromCurrent,
  type CigarDetails,
} from "@/lib/cigars/cigar-details";

const filled: CigarDetails = {
  brand:           "  Padron  ",
  series:          "1964",
  format:          "Robusto",
  ringGauge:       "50",
  lengthInches:    "5",
  shade:           "Maduro",
  wrapper:         "Habano",
  wrapperCountry:  "Nicaragua",
  binderCountry:   "Nicaragua",
  fillerCountries: ["Nicaragua", "Honduras"],
};

describe("EMPTY_CIGAR_DETAILS", () => {
  it("has empty strings and an empty filler array", () => {
    expect(EMPTY_CIGAR_DETAILS.brand).toBe("");
    expect(EMPTY_CIGAR_DETAILS.fillerCountries).toEqual([]);
  });
});

describe("toggleFiller", () => {
  it("appends a country not yet present, preserving order", () => {
    expect(toggleFiller(["Nicaragua"], "Honduras")).toEqual(["Nicaragua", "Honduras"]);
  });
  it("removes a country already present, preserving remaining order", () => {
    expect(toggleFiller(["Nicaragua", "Honduras", "Mexico"], "Honduras"))
      .toEqual(["Nicaragua", "Mexico"]);
  });
  it("does not mutate the input array", () => {
    const input = ["Nicaragua"];
    toggleFiller(input, "Honduras");
    expect(input).toEqual(["Nicaragua"]);
  });
});

describe("cigarDetailsToCatalogFields", () => {
  it("trims strings, parses numbers, snake-cases keys", () => {
    expect(cigarDetailsToCatalogFields(filled)).toEqual({
      brand:            "Padron",
      series:           "1964",
      format:           "Robusto",
      ring_gauge:       50,
      length_inches:    5,
      shade:            "Maduro",
      wrapper:          "Habano",
      wrapper_country:  "Nicaragua",
      binder_country:   "Nicaragua",
      filler_countries: ["Nicaragua", "Honduras"],
    });
  });
  it("maps empty strings to null and empty filler array to null", () => {
    expect(cigarDetailsToCatalogFields(EMPTY_CIGAR_DETAILS)).toEqual({
      brand:            null,
      series:           null,
      format:           null,
      ring_gauge:       null,
      length_inches:    null,
      shade:            null,
      wrapper:          null,
      wrapper_country:  null,
      binder_country:   null,
      filler_countries: null,
    });
  });
});

describe("cigarDetailsToRpcArgs", () => {
  it("produces p_-prefixed params with binder + filler", () => {
    expect(cigarDetailsToRpcArgs(filled)).toEqual({
      p_brand:            "Padron",
      p_series:           "1964",
      p_format:           "Robusto",
      p_ring_gauge:       50,
      p_length_inches:    5,
      p_wrapper:          "Habano",
      p_wrapper_country:  "Nicaragua",
      p_shade:            "Maduro",
      p_binder_country:   "Nicaragua",
      p_filler_countries: ["Nicaragua", "Honduras"],
    });
  });
});

describe("cigarDetailsToSuggestionRow", () => {
  it("adds suggested_by and a composed name on top of catalog fields", () => {
    const row = cigarDetailsToSuggestionRow(filled, "user-1");
    expect(row.suggested_by).toBe("user-1");
    expect(row.name).toBe("Padron - 1964 - Robusto");
    expect(row.binder_country).toBe("Nicaragua");
    expect(row.filler_countries).toEqual(["Nicaragua", "Honduras"]);
  });
});

describe("diffCigarFields", () => {
  it("returns only changed scalar fields", () => {
    const a = cigarDetailsToCatalogFields(filled);
    const b = cigarDetailsToCatalogFields({ ...filled, shade: "Oscuro / Double Maduro" });
    expect(diffCigarFields(a, b)).toEqual({ shade: "Oscuro / Double Maduro" });
  });
  it("treats array reorder as a change", () => {
    const a = cigarDetailsToCatalogFields(filled);
    const b = cigarDetailsToCatalogFields({ ...filled, fillerCountries: ["Honduras", "Nicaragua"] });
    expect(diffCigarFields(a, b)).toEqual({ filler_countries: ["Honduras", "Nicaragua"] });
  });
  it("returns empty object when nothing changed", () => {
    const a = cigarDetailsToCatalogFields(filled);
    expect(diffCigarFields(a, a)).toEqual({});
  });
});

describe("cigarDetailsFromCurrent", () => {
  it("maps a catalog row (snake_case, nullable) into form state", () => {
    expect(cigarDetailsFromCurrent({
      brand:            "Padron",
      series:           null,
      format:           "Robusto",
      ring_gauge:       50,
      length_inches:    5,
      shade:            null,
      wrapper:          "Habano",
      wrapper_country:  "Nicaragua",
      binder_country:   null,
      filler_countries: ["Nicaragua"],
    })).toEqual({
      brand:           "Padron",
      series:          "",
      format:          "Robusto",
      ringGauge:       "50",
      lengthInches:    "5",
      shade:           "",
      wrapper:         "Habano",
      wrapperCountry:  "Nicaragua",
      binderCountry:   "",
      fillerCountries: ["Nicaragua"],
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- cigar-details`
Expected: FAIL — cannot resolve `@/lib/cigars/cigar-details` (module not found).

- [ ] **Step 3: Write the module**

```ts
/**
 * Cigar detail capture — shared state shape + persistence mappers.
 *
 * Single source of truth for the manual "add cigar" sheets
 * (AddCigarSheet, WishlistClient) and the "update cigar" sheet
 * (SuggestCigarEditSheet). Pure functions only — no React — so the
 * mapping and the order-sensitive filler toggle are unit-testable in
 * the lib/ vitest suite.
 */

export interface CigarDetails {
  brand:            string;
  series:           string;
  format:           string;   // FORMATS value, or ""
  ringGauge:        string;   // numeric-as-string, or ""
  lengthInches:     string;   // numeric-as-string, or ""
  shade:            string;
  wrapper:          string;
  wrapperCountry:   string;
  binderCountry:    string;
  fillerCountries:  string[]; // ordered; user-controlled order is meaningful
}

export const EMPTY_CIGAR_DETAILS: CigarDetails = {
  brand:           "",
  series:          "",
  format:          "",
  ringGauge:       "",
  lengthInches:    "",
  shade:           "",
  wrapper:         "",
  wrapperCountry:  "",
  binderCountry:   "",
  fillerCountries: [],
};

/* Order-preserving add/remove. Returns a new array; never mutates. */
export function toggleFiller(list: string[], country: string): string[] {
  return list.includes(country)
    ? list.filter((c) => c !== country)
    : [...list, country];
}

/* snake_case catalog shape. Empty strings -> null; numerics parsed;
   empty filler array -> null. Used as the cigar_edit_suggestions JSONB
   shape AND as the base for a community-catalog suggestion row. */
export function cigarDetailsToCatalogFields(d: CigarDetails): Record<string, unknown> {
  return {
    brand:            d.brand.trim()          || null,
    series:           d.series.trim()         || null,
    format:           d.format                || null,
    ring_gauge:       d.ringGauge    ? Number(d.ringGauge)    : null,
    length_inches:    d.lengthInches ? Number(d.lengthInches) : null,
    shade:            d.shade                 || null,
    wrapper:          d.wrapper               || null,
    wrapper_country:  d.wrapperCountry        || null,
    binder_country:   d.binderCountry         || null,
    filler_countries: d.fillerCountries.length > 0 ? d.fillerCountries : null,
  };
}

/* p_-prefixed args for the insert_cigar_to_catalog RPC. */
export function cigarDetailsToRpcArgs(d: CigarDetails): Record<string, unknown> {
  const f = cigarDetailsToCatalogFields(d);
  return {
    p_brand:            f.brand,
    p_series:           f.series,
    p_format:           f.format,
    p_ring_gauge:       f.ring_gauge,
    p_length_inches:    f.length_inches,
    p_wrapper:          f.wrapper,
    p_wrapper_country:  f.wrapper_country,
    p_shade:            f.shade,
    p_binder_country:   f.binder_country,
    p_filler_countries: f.filler_countries,
  };
}

/* Row for cigar_catalog_suggestions: catalog fields + composed name +
   submitter id. */
export function cigarDetailsToSuggestionRow(
  d: CigarDetails,
  userId: string,
): Record<string, unknown> {
  const name = [d.brand.trim(), d.series.trim(), d.format]
    .filter(Boolean)
    .join(" - ");
  return {
    suggested_by: userId,
    name,
    ...cigarDetailsToCatalogFields(d),
  };
}

/* Field-by-field diff of two catalog-shaped objects. Arrays compared by
   content + order (filler order is meaningful). */
export function diffCigarFields(
  current:   Record<string, unknown>,
  suggested: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(suggested)) {
    const a = current[k];
    const b = suggested[k];
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) out[k] = b;
    } else if (a !== b) {
      out[k] = b;
    }
  }
  return out;
}

/* A catalog row as read for the edit sheet (snake_case, nullable). */
export interface CurrentCigarFields {
  brand:             string | null;
  series:            string | null;
  format:            string | null;
  ring_gauge:        number | null;
  length_inches:     number | null;
  shade:             string | null;
  wrapper:           string | null;
  wrapper_country:   string | null;
  binder_country:    string | null;
  filler_countries:  string[] | null;
}

/* Prefill form state from a catalog row (edit sheet). */
export function cigarDetailsFromCurrent(c: CurrentCigarFields): CigarDetails {
  return {
    brand:           c.brand            ?? "",
    series:          c.series           ?? "",
    format:          c.format           ?? "",
    ringGauge:       c.ring_gauge    !== null ? String(c.ring_gauge)    : "",
    lengthInches:    c.length_inches !== null ? String(c.length_inches) : "",
    shade:           c.shade            ?? "",
    wrapper:         c.wrapper          ?? "",
    wrapperCountry:  c.wrapper_country  ?? "",
    binderCountry:   c.binder_country   ?? "",
    fillerCountries: c.filler_countries ?? [],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- cigar-details`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add lib/cigars/cigar-details.ts lib/cigars/__tests__/cigar-details.test.ts
git commit -m "feat(cigars): shared cigar-details state shape + persistence mappers"
```

---

## Task 3: Shared presentational component

**Files:**
- Create: `components/cigars/CigarDetailFields.tsx`

No automated test (the repo has no React Testing Library / jsdom; component is verified by typecheck in this task and manual verification in Task 7). The component is purely presentational and controlled — all logic it touches (`toggleFiller`) is already tested in Task 2.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import {
  SHADES,
  WRAPPERS,
  WRAPPER_COUNTRIES,
  FORMATS,
  LENGTHS,
  RING_GAUGES,
} from "@/lib/cigar-taxonomy";
import { type CigarDetails, toggleFiller } from "@/lib/cigars/cigar-details";

/* ------------------------------------------------------------------
   CigarDetailFields

   The shared 10-field detail grid used by both the manual "add cigar"
   sheets and the "update cigar" sheet. Controlled and presentational:
   it owns no submit logic and renders option names only (no taxonomy
   descriptions, per the design).
   ------------------------------------------------------------------ */

interface Props {
  value:    CigarDetails;
  onChange: (next: CigarDetails) => void;
}

const labelCls   = "block text-xs font-medium mb-1.5";
const labelStyle = { color: "var(--muted-foreground)" } as const;
const inputStyle = { minHeight: 48 } as const;

export function CigarDetailFields({ value, onChange }: Props) {
  const set = <K extends keyof CigarDetails>(key: K, v: CigarDetails[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Brand */}
      <div className="col-span-2">
        <label className={labelCls} style={labelStyle}>
          Brand <span style={{ color: "var(--destructive)" }}>*</span>
        </label>
        <input
          type="text"
          value={value.brand}
          onChange={(e) => set("brand", e.target.value)}
          placeholder="e.g. Arturo Fuente"
          className="input w-full text-sm"
          style={inputStyle}
        />
      </div>

      {/* Series / Name */}
      <div className="col-span-2">
        <label className={labelCls} style={labelStyle}>Series / Name</label>
        <input
          type="text"
          value={value.series}
          onChange={(e) => set("series", e.target.value)}
          placeholder="e.g. Opus X"
          className="input w-full text-sm"
          style={inputStyle}
        />
      </div>

      {/* Format */}
      <div>
        <label className={labelCls} style={labelStyle}>Format</label>
        <select
          value={value.format}
          onChange={(e) => set("format", e.target.value)}
          className="input w-full text-sm"
          style={inputStyle}
        >
          <option value="">Choose…</option>
          {FORMATS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      {/* Ring Gauge */}
      <div>
        <label className={labelCls} style={labelStyle}>Ring Gauge</label>
        <select
          value={value.ringGauge}
          onChange={(e) => set("ringGauge", e.target.value)}
          className="input w-full text-sm"
          style={inputStyle}
        >
          <option value="">Choose…</option>
          {RING_GAUGES.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      {/* Length */}
      <div>
        <label className={labelCls} style={labelStyle}>Length</label>
        <select
          value={value.lengthInches}
          onChange={(e) => set("lengthInches", e.target.value)}
          className="input w-full text-sm"
          style={inputStyle}
        >
          <option value="">Choose…</option>
          {LENGTHS.map((l) => (
            <option key={l.inches} value={l.inches}>{l.label}</option>
          ))}
        </select>
      </div>

      {/* Shade */}
      <div>
        <label className={labelCls} style={labelStyle}>Shade</label>
        <select
          value={value.shade}
          onChange={(e) => set("shade", e.target.value)}
          className="input w-full text-sm"
          style={inputStyle}
        >
          <option value="">Choose…</option>
          {SHADES.map((s) => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Wrapper */}
      <div className="col-span-2">
        <label className={labelCls} style={labelStyle}>Wrapper</label>
        <select
          value={value.wrapper}
          onChange={(e) => set("wrapper", e.target.value)}
          className="input w-full text-sm"
          style={inputStyle}
        >
          <option value="">Choose…</option>
          {WRAPPERS.map((w) => (
            <option key={w.name} value={w.name}>{w.name}</option>
          ))}
        </select>
      </div>

      {/* Wrapper Country */}
      <div className="col-span-2">
        <label className={labelCls} style={labelStyle}>Wrapper Country</label>
        <select
          value={value.wrapperCountry}
          onChange={(e) => set("wrapperCountry", e.target.value)}
          className="input w-full text-sm"
          style={inputStyle}
        >
          <option value="">Choose…</option>
          {WRAPPER_COUNTRIES.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Binder Country */}
      <div className="col-span-2">
        <label className={labelCls} style={labelStyle}>Binder Country</label>
        <select
          value={value.binderCountry}
          onChange={(e) => set("binderCountry", e.target.value)}
          className="input w-full text-sm"
          style={inputStyle}
        >
          <option value="">Choose…</option>
          {WRAPPER_COUNTRIES.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Filler Countries */}
      <div className="col-span-2">
        <label className={labelCls} style={labelStyle}>Filler Countries</label>
        <p className="text-xs mb-2" style={{ color: "rgba(166,144,128,0.7)" }}>
          Tap one or more.
        </p>
        <div className="flex flex-wrap gap-2">
          {WRAPPER_COUNTRIES.map((c) => {
            const active = value.fillerCountries.includes(c.name);
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => set("fillerCountries", toggleFiller(value.fillerCountries, c.name))}
                className="text-xs rounded-full"
                style={{
                  padding:    "6px 12px",
                  background: active ? "rgba(212,160,74,0.18)" : "transparent",
                  color:      active ? "var(--gold,#D4A04A)" : "var(--muted-foreground)",
                  border:     `1px solid ${active ? "var(--gold,#D4A04A)" : "var(--border)"}`,
                  cursor:     "pointer",
                }}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add components/cigars/CigarDetailFields.tsx
git commit -m "feat(cigars): shared CigarDetailFields presentational form"
```

---

## Task 4: Refactor SuggestCigarEditSheet (update flow) onto the shared pieces

This sheet already captures all 10 fields. The change is to delete its local `FormState`/`toFormState`/`toJsonbShape`/`diffFields`/field-rendering and delegate to the shared module + component. Mechanics (snapshot → diff → POST) are unchanged.

**Files:**
- Modify: `components/cigars/SuggestCigarEditSheet.tsx`

- [ ] **Step 1: Replace the taxonomy + local-logic imports**

Replace the top import block (currently lines 6-13, the `{ SHADES, WRAPPERS, ... } from "@/lib/cigar-taxonomy"`) with:

```tsx
import { CigarDetailFields } from "@/components/cigars/CigarDetailFields";
import {
  type CigarDetails,
  type CurrentCigarFields,
  cigarDetailsToCatalogFields,
  cigarDetailsToSuggestionRow, // not used here; remove if tsc flags it
  diffCigarFields,
  cigarDetailsFromCurrent,
} from "@/lib/cigars/cigar-details";
```

> If `tsc` reports `cigarDetailsToSuggestionRow` as unused, delete that one line. It is only needed by the add sheets.

- [ ] **Step 2: Delete the local `FormState` interface and `toFormState`, `toJsonbShape`, `diffFields` functions**

Remove the `interface FormState { ... }` block and the three helper functions `toFormState`, `toJsonbShape`, `diffFields` (currently spanning roughly lines 48-112). Keep the `CurrentCigar`/`Props` interfaces. Change `CurrentCigar` to extend the shared shape so the mapper accepts it — replace the `CurrentCigar` interface body with:

```tsx
export interface CurrentCigar extends CurrentCigarFields {
  id: string;
}
```

- [ ] **Step 3: Switch state + submit to the shared mappers**

Change the form state declaration from `useState<FormState>(() => toFormState(cigar))` to:

```tsx
const [form, setForm] = useState<CigarDetails>(() => cigarDetailsFromCurrent(cigar));
```

In `handleSubmit`, replace the snapshot/diff lines:

```tsx
const current   = cigarDetailsToCatalogFields(cigarDetailsFromCurrent(cigar));
const suggested = cigarDetailsToCatalogFields(form);
const diff      = diffCigarFields(current, suggested);
```

(The `if (Object.keys(diff).length === 0)` guard, the `fetch` call, and the body `{ cigar_id, current, suggested: diff }` stay exactly as they are.)

- [ ] **Step 4: Replace the field markup with the shared component**

Delete the entire field grid `<div className="grid grid-cols-2 gap-3"> ... </div>` (the brand/series/format/ring/length/shade/wrapper/wrapper-country/binder/filler block, currently ~lines 284-442) and the local `toggleFiller` function (lines ~122-132). Replace the grid with:

```tsx
<CigarDetailFields value={form} onChange={setForm} />
```

Also delete the now-unused `labelStyle` constant if `tsc` flags it.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. Fix any unused-import errors by removing the named import the compiler points at.

- [ ] **Step 6: Commit**

```bash
git add components/cigars/SuggestCigarEditSheet.tsx
git commit -m "refactor(cigars): edit sheet uses shared CigarDetailFields + mappers"
```

---

## Task 5: Refactor AddCigarSheet (manual add) + persist binder/filler

**Files:**
- Modify: `components/humidor/AddCigarSheet.tsx`

- [ ] **Step 1: Swap imports**

Replace the taxonomy import block (lines 10-17, `{ SHADES, WRAPPERS, WRAPPER_COUNTRIES, FORMATS, LENGTHS, RING_GAUGES } from "@/lib/cigar-taxonomy"`) with:

```tsx
import { CigarDetailFields } from "@/components/cigars/CigarDetailFields";
import {
  type CigarDetails,
  EMPTY_CIGAR_DETAILS,
  cigarDetailsToRpcArgs,
  cigarDetailsToSuggestionRow,
} from "@/lib/cigars/cigar-details";
```

- [ ] **Step 2: Replace the local `ManualFields` type and the manual state**

Delete the `interface ManualFields { ... }` block (lines 23-32). Change the manual state declaration (line 70) to:

```tsx
const [manual, setManual] = useState<CigarDetails>(EMPTY_CIGAR_DETAILS);
```

Replace every empty-object reset of `manual` (the `setManual({ brand: "", ... })` on open at ~line 127, and any in `handleClear`) with:

```tsx
setManual(EMPTY_CIGAR_DETAILS);
```

- [ ] **Step 3: Update `handleSubmit` field extraction + writes**

The manual path is taken only when `!selected`. Replace the field-extraction block at the top of `handleSubmit` (lines 158-167) with:

```tsx
const brand = isManual ? manual.brand.trim() : (selected?.brand ?? "Unknown");
if (!brand) { setSubmitError("Brand is required."); return; }
```

Replace the RPC call args (lines 180-189) with:

```tsx
const { data, error: rpcErr } = await supabase.rpc(
  "insert_cigar_to_catalog",
  cigarDetailsToRpcArgs(manual),
);
```

Replace the `cigar_catalog_suggestions` insert (lines 231-242) with:

```tsx
await supabase
  .from("cigar_catalog_suggestions")
  .insert(cigarDetailsToSuggestionRow(manual, user.id));
```

(The `addHumidorItem` call uses `cigarId`, `quantity`, dates, price, notes — all unchanged. The `usage_count` bump for the `selected` path is unchanged.)

- [ ] **Step 4: Replace the manual field markup with the shared component**

Delete the field grid `<div className="grid grid-cols-2 gap-3"> ... </div>` inside the `{isManual && (...)}` block (lines 440-569) and replace it with:

```tsx
<CigarDetailFields value={manual} onChange={setManual} />
```

Keep the surrounding `<div className="space-y-4 animate-fade-in">`, the "Cigar Details" header row with the "Back to search" button, and the "Submit to catalog" checkbox below the grid — those are host-owned and unchanged.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. Remove any import the compiler flags as unused.

- [ ] **Step 6: Commit**

```bash
git add components/humidor/AddCigarSheet.tsx
git commit -m "feat(humidor): manual add captures + persists binder and filler"
```

---

## Task 6: Refactor WishlistClient (manual add) + persist binder/filler

`WishlistClient`'s inner `AddWishlistSheet` currently uses free-text inputs and has no Shade field. Switching to the shared component upgrades it to dropdowns and adds Shade + Binder + Filler in one move.

**Files:**
- Modify: `components/humidor/WishlistClient.tsx`

- [ ] **Step 1: Add imports**

Add near the existing imports (after line 21):

```tsx
import { CigarDetailFields } from "@/components/cigars/CigarDetailFields";
import {
  type CigarDetails,
  EMPTY_CIGAR_DETAILS,
  cigarDetailsToRpcArgs,
  cigarDetailsToSuggestionRow,
} from "@/lib/cigars/cigar-details";
```

- [ ] **Step 2: Replace the local `ManualFields` type and manual state**

Delete the `interface ManualFields { ... }` block (lines 35-43). Change the manual state initializer (lines 77-79) to:

```tsx
const [manual, setManual] = useState<CigarDetails>(EMPTY_CIGAR_DETAILS);
```

In `handleClear` (around line 145) and anywhere else `manual` is reset to an empty object, use `setManual(EMPTY_CIGAR_DETAILS)`.

- [ ] **Step 3: Update `handleSubmit` extraction + writes**

Replace the field-extraction block (lines 149-157) with:

```tsx
const brand = isManual ? manual.brand.trim() : (selected?.brand ?? "Unknown");
if (!brand) { setSubmitError("Brand is required."); return; }
```

Replace the RPC call (lines 169-177) with:

```tsx
const { data, error: rpcErr } = await supabase.rpc(
  "insert_cigar_to_catalog",
  cigarDetailsToRpcArgs(manual),
);
```

Replace the `cigar_catalog_suggestions` insert (lines 206-216) with:

```tsx
await supabase
  .from("cigar_catalog_suggestions")
  .insert(cigarDetailsToSuggestionRow(manual, user.id));
```

(The `humidor_items` insert with `is_wishlist: true`, and the `usage_count` bump for the `selected` path, are unchanged.)

- [ ] **Step 4: Replace the manual field markup with the shared component**

Delete the field grid `<div className="grid grid-cols-2 gap-3"> ... </div>` inside the `{isManual && (...)}` block (lines 403-484) and replace it with:

```tsx
<CigarDetailFields value={manual} onChange={setManual} />
```

Keep the "Cigar Details" header row, "Back to search" button, and the "Submit to catalog" checkbox.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. Remove any unused import the compiler flags (e.g. if `CatalogResult` is still needed it stays; only remove what tsc reports).

- [ ] **Step 6: Commit**

```bash
git add components/humidor/WishlistClient.tsx
git commit -m "feat(humidor): wishlist manual add uses shared fields (adds shade/binder/filler)"
```

---

## Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Unit tests**

Run: `npm run test:unit`
Expected: PASS, including the `cigar-details` suite from Task 2.

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors in the touched files.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build completes (Next build + serwist).

- [ ] **Step 5: Manual verification (requires the migration applied in Supabase first)**

1. Apply `supabase/migrations/20260613_cigar_binder_filler_manual_add.sql` in the Supabase SQL editor.
2. `npm run dev`. Open Humidor → Add cigar → "Add manually". Confirm Format/Ring/Length/Shade/Wrapper/Wrapper-Country are dropdowns (name only), and Binder Country (dropdown) + Filler Countries (pills) are present.
3. Fill brand + a binder + two filler countries in a deliberate order; save. Open the new cigar's detail page; confirm binder + filler render, fillers in the chosen order.
4. Repeat from Humidor → Wishlist → add manually; confirm the same fields (Shade now present) and that the wishlist item saves.
5. Open an existing cigar → "Suggest an edit"; confirm the form still renders all fields and a changed field still submits (no regression).

- [ ] **Step 6: Push + open PR**

```bash
git push -u origin feat/manual-add-binder-filler
gh pr create --title "Unify cigar detail capture: manual add gains binder + filler" --body "See docs/superpowers/plans/2026-06-13-manual-add-binder-filler.md. Requires running supabase/migrations/20260613_cigar_binder_filler_manual_add.sql in the Supabase SQL editor before deploy."
```

---

## Self-review notes

- **Spec coverage:** shared component (Task 3) ✓; name-only labels (Task 3) ✓; binder+filler in Add (Task 5) and Wishlist (Task 6) ✓; migration for RPC + suggestions table (Task 1) ✓; edit sheet onto shared pieces (Task 4) ✓; testing of pure logic adapted to `lib/` infra (Task 2) ✓; manual verification (Task 7) ✓.
- **Adaptation from spec:** spec said "unit test the component"; the repo has no RTL/jsdom and tests only `lib/`. Coverage moved to the pure logic module (toggle order, null mapping, diff) which is the actual risk surface. Component is typecheck + manually verified. This matches the web testing rule that visual components favor manual/visual verification over brittle markup assertions.
- **Type consistency:** `CigarDetails` field names (`ringGauge`, `lengthInches`, `binderCountry`, `fillerCountries`) are used identically across Tasks 2-6. Mappers emit snake_case catalog keys / `p_`-prefixed RPC keys consistently.
```
