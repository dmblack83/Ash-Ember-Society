# Catalog Detail Rework + Blend-per-Vitola + Vitola Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status: AWAITING DAVE'S REVIEW (planned 2026-09-07 overnight; revised same night after Dave's two model corrections; no code written).**

**Goal:** (1) Blend becomes vitola-owned (vitolas in one series can have different blends) — the line is identity only. (2) Manual add requires brand AND vitola name; series is optional. (3) Catalog detail reads Image > Full Name > Details > Choose Vitola with name, details, and badge tracking the selected vitola. (4) Admin Edit line (brand/series only) moves to the title; the vitola editor becomes the FULL editor (name, blend, size, line reassignment, merge, delete). (5) Detail order Format > Length > Ring Gauge everywhere. (6) Duplicate vitolas merge atomically with zero member inventory loss.

**Architecture shift (Dave's correction, 2026-09-07):** `cigar_lines` stops carrying blend. The sync trigger propagates ONLY brand/series. `cigar_catalog` children own blend outright (they already store it — the "copies" become the single source of truth; no data movement needed). Insert RPC keeps the caller's typed blend. Reassigning a vitola to another line carries its blend with it. The old "line = blend authority" model (built in #608) is dismantled by one migration plus a small code sweep.

**Tech stack:** Next.js App Router, Supabase (manual-apply SQL), SWR, vitest.

## Decisions made under autonomy (ratify or veto at review)

1. **Line blend columns are DROPPED from `cigar_lines`** (not left vestigial). Nothing reads them after this plan (the browse/match RPCs already read children); leaving them invites drift back into two sources of truth. Rollback SQL provided.
2. **Existing catalog rows keep their current blend values untouched** — children already carry blend; the migration only changes who is allowed to write it. Zero data movement, zero risk to the 4,200 rows.
3. **Vitola NAME is required client-side only** (both manual-add forms). The DB keeps `name` nullable because ~4,200 seed rows and legacy community adds have no name; the RPC stays lenient so old deployed clients can't break mid-deploy. Suggest-an-edit does NOT require name (it edits legacy rows).
4. **Title convention amendment**: with a series, title = series + quoted name row (unchanged). With NO series but a name, the NAME becomes the title (unquoted, no second row) — a brand-only cigar headlines its vitola name instead of its shape. Fallback stays series > name > format > brand.
5. **Dims flip app-wide** to `7 1/4" × 47` (length × ring) via the one shared helper (deviation from mockup 04 noted).
6. **Merge keeps the TARGET vitola's fields** (including its blend) and adopts the source's image only when the target has none; a member who wishlisted BOTH duplicates keeps the target row (prod's manual wishlist unique index makes the collision-delete mandatory).
7. **Merge picker lists siblings of the current line only** (v1) — merge lines first (#610), then dedupe vitolas inside.
8. **Reassigning a vitola keeps you on the page** (routed child included) — the refetch path recovers exactly like the line merge does.

## Global constraints

- No em dashes in user-facing copy. Section heading: "Choose Vitola". Validation message: "Vitola name is required."
- All SQL is manual-apply with verify queries; hand over as copy-paste blocks (function bodies run separately from grant/revoke — the SQL editor gotcha).
- Member inventory untouchable: merge repoints humidor_items, smoke_logs, cigar_edit_suggestions, cigar_image_submissions BEFORE deleting the source, in one atomic function. FKs are RESTRICT (humidor/smoke) so a missed repoint fails loudly. Free-tier trigger is BEFORE INSERT only (verified) — repoints don't trip it.
- Graceful degradation: merge RPC missing → merge action reports "Merge not available yet"; blend migration unapplied → line edits still work (route only sends brand/series; PostgREST ignores nothing — the trigger still propagates blend until migrated, which is today's behavior, not breakage).
- Deploy order note for the PR: apply the blend-per-vitola migration WITH the deploy — until applied, an admin Edit line save propagates stale blend semantics (today's behavior); after, identity only.
- Gates: `npm run test:unit`, `tsc --noEmit`, `npm run build`, `npm run check:shells`; only pre-existing lint errors on touched files.

---

### Task 1: Dims flip + form field order + title amendment (TDD)

**Files:**
- Modify: `lib/cigars/line-group.ts` (sizeDims, cigarTitle, cigarDisplayName)
- Modify: `lib/cigars/__tests__/line-group.test.ts`
- Modify: `components/cigars/CigarTitle.tsx`
- Modify: `components/cigars/CigarDetailFields.tsx` (order Format > Length > Ring Gauge)

**Interfaces:** `sizeDims` output becomes `'7 1/4" × 47'` (length first). `cigarTitle`/`cigarDisplayName`/`CigarTitle` adopt the amended convention: series present → series (+ quoted name row / inline quoted name); no series but name → name IS the title (no quoting, no second row); else format, else brand, else "Cigar".

- [ ] **Step 1: Update tests (must fail first)**

`sizeDims / sizeLabel` block becomes:

```ts
  test("formats length × ring with fraction label", () => {
    expect(sizeDims(child({ length_inches: 7.25 }))).toBe('7 1/4" × 48');
  });
  test("ring only when length missing", () => {
    expect(sizeDims(child({ length_inches: null }))).toBe("48 ring");
  });
  test("length only when ring missing", () => {
    expect(sizeDims(child({ ring_gauge: null, length_inches: 5 }))).toBe('5"');
  });
  test("empty when both missing", () => {
    expect(sizeDims(child({ ring_gauge: null, length_inches: null }))).toBe("");
  });
  test("label joins format and dims", () => {
    expect(sizeLabel(child())).toBe('Churchill 7" × 48');
  });
  test("label prefers the vitola name over format", () => {
    expect(sizeLabel({ ...child(), name: "King B" })).toBe('King B 7" × 48');
  });
  test("label without format is dims only", () => {
    expect(sizeLabel(child({ format: null }))).toBe('7" × 48');
  });
  test("label with nothing is 'Original size'", () => {
    expect(sizeLabel(child({ format: null, ring_gauge: null, length_inches: null }))).toBe("Original size");
  });
```

`cigarTitle / cigarDisplayName` block becomes:

```ts
  test("series is the title; name renders quoted after it", () => {
    const c = { series: "Chateau Fuente Sun Grown", name: "Queen B", format: "Torpedo" };
    expect(cigarTitle(c)).toBe("Chateau Fuente Sun Grown");
    expect(cigarDisplayName(c)).toBe('Chateau Fuente Sun Grown "Queen B"');
  });
  test("no series: the name IS the title, unquoted", () => {
    const c = { series: null, name: "Moroni's Trumpet", format: "Toro", brand: "Apostate Cigars" };
    expect(cigarTitle(c)).toBe("Moroni's Trumpet");
    expect(cigarDisplayName(c)).toBe("Moroni's Trumpet");
  });
  test("falls back name -> format -> brand", () => {
    expect(cigarTitle({ format: "Robusto" })).toBe("Robusto");
    expect(cigarTitle({ brand: "Padron" })).toBe("Padron");
    expect(cigarTitle({})).toBe("Cigar");
  });
  test("no name = title only", () => {
    expect(cigarDisplayName({ series: "1964" })).toBe("1964");
  });
```

Run: `npx vitest run lib/cigars/__tests__/line-group.test.ts` — reordered/amended tests FAIL.

- [ ] **Step 2: Implement**

`sizeDims`:

```ts
/* '7 1/4" × 50' — length × ring (detail order is Format > Length >
   Ring Gauge, 2026-09-07), dropping whichever is missing. */
export function sizeDims(c: SizeChild): string {
  const len = c.length_inches != null
    ? (lengthLabelForInches(c.length_inches) ?? `${c.length_inches}"`)
    : null;
  if (c.ring_gauge != null && len) return `${len} × ${c.ring_gauge}`;
  if (c.ring_gauge != null)        return `${c.ring_gauge} ring`;
  if (len)                         return len;
  return "";
}
```

Title helpers:

```ts
/* Title line: series when present; otherwise the vitola name IS the
   headline (brand-only cigars); then format, then brand. */
export function cigarTitle(c: CigarNameParts): string {
  return c.series ?? c.name ?? c.format ?? c.brand ?? "Cigar";
}

/* Single-string form: the quoted name attaches only when a series
   carries the title (no series = the name already IS the title). */
export function cigarDisplayName(c: CigarNameParts): string {
  const title = cigarTitle(c);
  return c.series && c.name ? `${title} "${c.name}"` : title;
}
```

`CigarTitle.tsx` render becomes:

```tsx
export function CigarTitle({ cigar }: { cigar: CigarNameParts }) {
  return (
    <>
      {cigarTitle(cigar)}
      {cigar.series && cigar.name && (
        <span className="block">&ldquo;{cigar.name}&rdquo;</span>
      )}
    </>
  );
}
```

Run the test file — PASS; then `npm run test:unit`.

- [ ] **Step 3: Reorder the manual-form fields** — in `CigarDetailFields.tsx`, swap the Ring Gauge and Length blocks (each moves whole with its `{!hideSizeFields && (...)}` wrapper) so the order reads Format, Length, Ring Gauge.

- [ ] **Step 4:** `npx tsc --noEmit` clean; commit `"feat: dims length-first, title convention amendment, form order Format > Length > Ring"`.

---

### Task 2: Migration + sweep — blend becomes vitola-owned

**Files:**
- Create: `supabase/migrations/20260908_blend_per_vitola.sql`
- Modify: `app/api/admin/catalog-lines/[id]/route.ts` (LINE_FIELDS shrinks to brand/series)
- Modify: `components/admin/AdminLineEditSheet.tsx` (brand + series inputs only)
- Modify: `app/api/admin/cigar-edit-suggestions/[id]/route.ts` (blend routes to the CHILD)
- Modify: `components/admin/CigarEditReviewModal.tsx` (line-wide note covers brand/series only)
- Modify: `components/cigars/CigarDetailClient.tsx` (AdminLineEditSheet `current` prop shrinks)

**Interfaces:** `cigar_lines` loses wrapper/shade/wrapper_country/binder_country/filler_countries. Trigger propagates brand/series only. `insert_cigar_to_catalog` (same 11-param signature) writes the CALLER's blend to the child and no blend to the line. `AdminLineEditSheet` props become `{ lineId, current: { brand: string | null; series: string | null }, open, onClose, onSaved }`.

- [ ] **Step 1: Write `20260908_blend_per_vitola.sql`**

```sql
-- ============================================================
-- Blend is vitola-owned (Dave, 2026-09-07): vitolas in one
-- series can smoke different blends. cigar_lines becomes pure
-- identity (brand + series + community flags). Children already
-- store blend — their copies simply become the single source of
-- truth; NO data moves and NO catalog row changes.
--   1. Trigger propagates brand/series only.
--   2. Line blend columns dropped.
--   3. Insert RPC keeps the CALLER's blend on the child.
-- Manual-apply in the Supabase SQL editor.
-- ============================================================

-- 1. Identity-only sync trigger.
create or replace function sync_cigar_line_children()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update cigar_catalog set
    brand  = new.brand,
    series = new.series
  where line_id = new.id;
  return new;
end;
$$;

drop trigger if exists cigar_lines_sync_children on cigar_lines;
create trigger cigar_lines_sync_children
  after update of brand, series
  on cigar_lines
  for each row execute function sync_cigar_line_children();

-- 2. Drop the line blend columns (children own blend now).
alter table cigar_lines
  drop column if exists wrapper,
  drop column if exists shade,
  drop column if exists wrapper_country,
  drop column if exists binder_country,
  drop column if exists filler_countries;

-- 3. Insert RPC v4: same 11-param signature; the line is created
--    with identity only and the CHILD carries the caller's blend.
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
  p_filler_countries text[]  default null,
  p_name             text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line cigar_lines%rowtype;
  v_id   uuid;
begin
  if p_brand is null or trim(p_brand) = '' then
    raise exception 'brand is required';
  end if;

  select * into v_line
  from cigar_lines
  where brand = p_brand
    and coalesce(series, '') = coalesce(p_series, '');

  if not found then
    begin
      insert into cigar_lines (brand, series, community_added, approved)
      values (p_brand, p_series, true, false)
      returning * into v_line;
    exception when unique_violation then
      select * into v_line
      from cigar_lines
      where brand = p_brand
        and coalesce(series, '') = coalesce(p_series, '');
    end;
  end if;

  insert into cigar_catalog (
    source_id, brand, series, name, format, ring_gauge, length_inches,
    wrapper, wrapper_country, shade, binder_country, filler_countries,
    community_added, approved, usage_count, line_id
  ) values (
    'community-' || gen_random_uuid()::text,
    v_line.brand, v_line.series, nullif(trim(coalesce(p_name, '')), ''),
    p_format, p_ring_gauge, p_length_inches,
    p_wrapper, p_wrapper_country, p_shade, p_binder_country, p_filler_countries,
    true, false, 0, v_line.id
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function insert_cigar_to_catalog(text, text, text, numeric, numeric, text, text, text, text, text[], text) from public, anon;
grant execute on function insert_cigar_to_catalog(text, text, text, numeric, numeric, text, text, text, text, text[], text) to authenticated, service_role;

-- ── Verify ──────────────────────────────────────────────────
-- select column_name from information_schema.columns
--   where table_name = 'cigar_lines' order by ordinal_position;
--   -- expect: id, brand, series, community_added, approved, created_at
-- select count(*) from cigar_catalog;      -- unchanged
-- select count(*) from cigar_catalog where wrapper is not null;  -- unchanged vs before

-- ── Rollback ────────────────────────────────────────────────
-- Re-add the five columns (nullable), re-apply the trigger and RPC
-- bodies from 20260906_cigar_lines.sql / 20260907_cigar_vitola_name.sql,
-- and repopulate line blend from each line's top-usage child.
```

- [ ] **Step 2: Shrink the line route** — in `app/api/admin/catalog-lines/[id]/route.ts`: `LINE_FIELDS` becomes `new Set(["brand", "series"])`; delete the doc-comment references to blend. (Blend keys in a request body are now silently filtered — correct.) Merge path unchanged.

- [ ] **Step 3: Shrink `AdminLineEditSheet`** — replace the `CigarDetailFields ... hideSizeFields` body with two plain inputs (Brand required, Series optional), keeping the merge-offer block intact:

```tsx
        <div>
          <label className={labelCls} style={labelStyle}>
            Brand <span style={{ color: "var(--destructive)" }}>*</span>
          </label>
          <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)}
            className="input w-full text-sm" style={inputStyle} />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>Series</label>
          <input type="text" value={series} onChange={(e) => setSeries(e.target.value)}
            className="input w-full text-sm" style={inputStyle} />
        </div>
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Applies to every vitola in this line. Blend is edited per vitola.
        </p>
```

State: `brand`/`series` strings seeded from `current` on open; `save()` sends only `{ brand: brand.trim(), series: series.trim() || null, ...(merge ? { merge: true } : {}) }`, with a client guard `if (!brand.trim()) { setError("Brand is required."); return; }`. Props narrow to `current: { brand: string | null; series: string | null }`; drop the `CigarDetails`/`cigarDetailsFromCurrent` imports. The `hideSizeFields` prop on `CigarDetailFields` loses its only consumer — REMOVE the prop and its three wrappers (revert to always-rendered size fields).

- [ ] **Step 4: Edit-suggestions routing** — in `app/api/admin/cigar-edit-suggestions/[id]/route.ts`, `LINE_FIELDS` becomes `new Set(["brand", "series"])` (blend + name + size all patch the child). In `CigarEditReviewModal.tsx`, the note's field list shrinks to `["brand", "series"]` and the copy becomes "Brand and series changes apply to every vitola of this cigar."

- [ ] **Step 5: Detail client prop** — `AdminLineEditSheet` render site passes `current={{ brand: c.brand, series: c.series }}`.

- [ ] **Step 6: Gates + commit** — tsc, unit, eslint on touched files, build. Commit: `"feat: blend is vitola-owned — identity-only lines, trigger, insert v4, admin routing"`.

---

### Task 3: Manual add — vitola name required, series optional

**Files:**
- Modify: `components/humidor/AddCigarSheet.tsx`
- Modify: `components/humidor/WishlistClient.tsx`
- Modify: `components/cigars/CigarDetailFields.tsx` (labels)

**Interfaces:** no shape changes; validation only.

- [ ] **Step 1: Field labels** — in `CigarDetailFields.tsx`: Vitola Name's label gains the required mark (`Vitola Name <span style={{ color: "var(--destructive)" }}>*</span>`) and its placeholder drops "(optional)" → `placeholder='e.g. Short Story'`. Series keeps no mark (optional). Brand already marked.

- [ ] **Step 2: Validation in both sheets** — in `AddCigarSheet.handleSubmit` and the wishlist sheet's `handleSubmit`, directly after the existing brand check, add:

```ts
    if (isManual && !manual.name.trim()) { setSubmitError("Vitola name is required."); return; }
```

(placed before `setSubmitting(true)` alongside the brand guard). Selected-from-search path unaffected. The dupe-check Paths B/C inherit the requirement automatically (they reuse `manual`).

- [ ] **Step 3: Gates + commit** — tsc, unit, eslint. Commit: `"feat: manual add requires brand + vitola name; series optional"`.

---

### Task 4: Detail page — per-vitola details, Choose Vitola, Edit line at the title

**Files:**
- Modify: `lib/data/cigar-fetchers.ts` (widen `fetchLineSiblings` select)
- Modify: `lib/cigars/line-group.ts` (widen `SizeChild`)
- Modify: `components/cigars/CigarDetailClient.tsx`

**Interfaces:** `SizeChild` gains optional per-vitola fields:

```ts
export interface SizeChild {
  id:             string;
  name?:          string | null;
  format:         string | null;
  ring_gauge:     number | null;
  length_inches:  number | null;
  image_url?:     string | null;
  /* Vitola-owned blend + review state (detail page). */
  shade?:            string | null;
  wrapper?:          string | null;
  wrapper_country?:  string | null;
  binder_country?:   string | null;
  filler_countries?: string[] | null;
  community_added?:  boolean;
  approved?:         boolean;
}
```

`fetchLineSiblings` select: `"id, name, format, ring_gauge, length_inches, image_url, shade, wrapper, wrapper_country, binder_country, filler_countries, community_added, approved"`.

- [ ] **Step 1: Widen type + select** (exact shapes above).

- [ ] **Step 2: Rework `CigarDetailClient.tsx`**

1. Extend the synthesized `selected` fallback to spread the routed row's blend/review fields (`shade: c.shade, wrapper: c.wrapper, wrapper_country: c.wrapper_country, binder_country: c.binder_country, filler_countries: c.filler_countries, community_added: c.community_added, approved: c.approved`).
2. **Details render from the selection, in the order Format > Length > Ring Gauge > blend:**

```tsx
  const sel = selected;
  const details: { label: string; value: string }[] = [
    sel.format ? { label: "Format", value: sel.format } : null,
    sel.length_inches != null
      ? { label: "Length", value: lengthLabelForInches(sel.length_inches) ?? `${sel.length_inches}"` } : null,
    sel.ring_gauge != null ? { label: "Ring Gauge", value: String(sel.ring_gauge) } : null,
    sel.shade   ? { label: "Shade",   value: sel.shade } : null,
    sel.wrapper ? { label: "Wrapper", value: wrapperDisplay(sel.wrapper) } : null,
    sel.wrapper_country ? { label: "Wrapper Country", value: countryName(sel.wrapper_country) } : null,
    sel.binder_country  ? { label: "Binder Country",  value: countryName(sel.binder_country) }  : null,
    (sel.filler_countries?.length ?? 0) > 0
      ? { label: "Filler Countries", value: sel.filler_countries!.map(countryName).join(", ") } : null,
  ].filter((d): d is { label: string; value: string } => d !== null);
```

Import `lengthLabelForInches` from `@/lib/cigar-taxonomy`. (No `?? c.x` fallbacks needed — the widened siblings carry the fields, and the synthesized fallback spreads the routed row.)
3. **Badge tracks the selection**: `(selected.community_added ?? false) && !(selected.approved ?? true)`.
4. **Section rename**: `<h2>Choose Vitola</h2>`; radiogroup `aria-label="Choose Vitola"`.
5. **Edit line moves to the title**: remove the button from the Details header (plain `<h2>Details</h2>` again); under the `<h1>` in the hero add:

```tsx
          {isAdmin && c.line_id && (
            <button
              type="button"
              onClick={() => setEditLine(true)}
              className="self-start text-xs font-medium px-3 py-1.5 rounded-lg"
              style={{ color: "var(--gold, #D4A04A)", border: "1px solid rgba(212,160,74,0.4)" }}
            >
              Edit line
            </button>
          )}
```

6. Layout order (already true, confirm): Hero (image + brand + h1 + badge + actions) > Details > Choose Vitola > actions (mobile) > Suggest an edit > Reviews.

- [ ] **Step 3: Gates + commit** — `"feat: catalog detail — per-vitola details, Choose Vitola, Edit line at the title"`.

---

### Task 5: Full vitola editor — blend + reassignment

**Files:**
- Modify: `components/admin/AdminSizeEditSheet.tsx` (becomes the full editor via `CigarDetailFields`)
- Modify: `app/api/admin/catalog-sizes/[id]/route.ts` (accepts blend + brand/series reassignment)
- Modify: `components/cigars/CigarDetailClient.tsx` (props)

**Interfaces:**
- `AdminSizeEditSheet` props: `{ child: SizeChild, line: { brand: string | null; series: string | null }, siblings: SizeChild[], open, onClose, onSaved: (kind: "saved" | "moved" | "deleted" | "merged") => void }`.
- PATCH body may include any of: `name, format, ring_gauge, length_inches, shade, wrapper, wrapper_country, binder_country, filler_countries, brand, series`. Blend/size/name patch the child. Brand/series change = line reassignment (resolve-or-create identity-only line, repoint `line_id`, rewrite child brand/series to canonical; the vitola KEEPS its own blend). Response `{ ok: true, movedLine: boolean }`.

- [ ] **Step 1: Route**

Add blend validation + passthrough after the existing name/format/ring/length blocks:

```ts
  for (const k of ["shade", "wrapper", "wrapper_country", "binder_country"] as const) {
    if (k in body) {
      const v = body[k];
      if (v !== null && (typeof v !== "string" || v.length > 80)) {
        return NextResponse.json({ error: `${k} must be a short string or null` }, { status: 422 });
      }
      patch[k] = v === "" ? null : v;
    }
  }
  if ("filler_countries" in body) {
    const v = body.filler_countries;
    if (v !== null && (!Array.isArray(v) || v.some((x) => typeof x !== "string"))) {
      return NextResponse.json({ error: "filler_countries must be a string array or null" }, { status: 422 });
    }
    patch.filler_countries = Array.isArray(v) && v.length === 0 ? null : v;
  }
```

Then the reassignment block (before the `.update(patch)`):

```ts
  /* Line reassignment: brand/series in the body move this vitola to
     (or create) that line. The vitola KEEPS its own blend — lines
     are identity only. */
  let movedLine = false;
  let oldLineId: string | null = null;
  if ("brand" in body || "series" in body) {
    const nb = body.brand;
    if ("brand" in body && (typeof nb !== "string" || nb.trim() === "")) {
      return NextResponse.json({ error: "brand cannot be empty" }, { status: 422 });
    }
    const ns = body.series;
    if ("series" in body && ns !== null && typeof ns !== "string") {
      return NextResponse.json({ error: "series must be a string or null" }, { status: 422 });
    }

    const { data: child } = await admin
      .from("cigar_catalog")
      .select("brand, series, line_id")
      .eq("id", id)
      .maybeSingle<{ brand: string | null; series: string | null; line_id: string | null }>();
    if (!child) return NextResponse.json({ error: "Size not found" }, { status: 404 });
    oldLineId = child.line_id;

    const nextBrand  = ("brand"  in body ? (nb as string).trim() : child.brand) ?? "";
    const nextSeries = "series" in body ? ((ns as string | null)?.trim() || null) : child.series;
    const changed =
      nextBrand !== (child.brand ?? "") ||
      (nextSeries ?? "") !== (child.series ?? "");

    if (changed) {
      if (!nextBrand) return NextResponse.json({ error: "brand cannot be empty" }, { status: 422 });
      let destQuery = admin.from("cigar_lines")
        .select("id, brand, series")
        .eq("brand", nextBrand);
      destQuery = nextSeries === null ? destQuery.is("series", null) : destQuery.eq("series", nextSeries);
      let { data: dest } = await destQuery.maybeSingle<{ id: string; brand: string; series: string | null }>();
      if (!dest) {
        const { data: created, error: createErr } = await admin
          .from("cigar_lines")
          .insert({ brand: nextBrand, series: nextSeries, community_added: true, approved: false })
          .select("id, brand, series")
          .single();
        if (createErr || !created) {
          return NextResponse.json({ error: "Failed to create the destination line" }, { status: 500 });
        }
        dest = created;
      }
      patch.line_id = dest.id;
      patch.brand   = dest.brand;
      patch.series  = dest.series;
      movedLine = true;
    }
  }
```

After a successful `.update(patch)`:

```ts
  if (movedLine && oldLineId && oldLineId !== patch.line_id) {
    const { count: remaining } = await admin
      .from("cigar_catalog")
      .select("id", { count: "exact", head: true })
      .eq("line_id", oldLineId);
    if ((remaining ?? 0) === 0) {
      await admin.from("cigar_lines").delete().eq("id", oldLineId);
    }
  }
```

Response: `NextResponse.json({ ok: true, movedLine })`.

- [ ] **Step 2: Sheet becomes the full editor**

Replace the individual name/format/ring/length controls with `CigarDetailFields` driven by a `CigarDetails` form state (reuses everything: Brand required mark, Series, Vitola Name required mark, Format/Length/Ring in Task 1's order, blend selects, filler chips, Look up button):

- State: `const [form, setForm] = useState<CigarDetails>(EMPTY_CIGAR_DETAILS);` seeded on open via `cigarDetailsFromCurrent({ brand: line.brand, series: line.series, name: child.name ?? null, format: child.format, ring_gauge: child.ring_gauge, length_inches: child.length_inches, shade: child.shade ?? null, wrapper: child.wrapper ?? null, wrapper_country: child.wrapper_country ?? null, binder_country: child.binder_country ?? null, filler_countries: child.filler_countries ?? null })`.
- Keep the "Raw value" caption for a polluted `child.format` not in FORMATS (unchanged logic, now above the Format select inside a small note before `CigarDetailFields`).
- `handleSave` builds the PATCH body from `cigarDetailsToCatalogFields(form)` — send `name, format, ring_gauge, length_inches, shade, wrapper, wrapper_country, binder_country, filler_countries` always, and `brand`/`series` ONLY when they differ from the `line` seeds. Client guard: brand non-empty (name may stay empty here — legacy rows). On `movedLine: true` → `onSaved("moved")`, else `onSaved("saved")`.
- Delete button + confirm flow unchanged. Note under the fields: `Changing brand or series moves this vitola to that line.`
- Keep the reset-on-open effect pattern (with the existing eslint-disable comment convention).

- [ ] **Step 3: Detail client** — pass `line={{ brand: c.brand, series: c.series }}` and `siblings={siblings}`; `onSaved` handles `"moved"` like `"saved"` (refresh; the refetched cigar row carries the new brand/series and the sibling key recomputes — routed child included).

- [ ] **Step 4: Gates + commit** — `"feat: vitola editor — full edit (blend + name + size + line reassignment)"`.

---

### Task 6: Migration — atomic vitola merge RPC (manual-apply)

**Files:**
- Create: `supabase/migrations/20260908_merge_catalog_vitolas.sql`

**Interfaces:** RPC `merge_catalog_vitolas(p_source uuid, p_target uuid) returns jsonb` — service_role only.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- merge_catalog_vitolas: fold one duplicate vitola into another
-- WITHOUT any member losing inventory. Atomic: repoints every
-- referencing table, then deletes the source row. Referencing
-- tables (verified 2026-09-07):
--   humidor_items.cigar_id          (on delete restrict)
--   smoke_logs.cigar_id             (on delete restrict)
--   cigar_edit_suggestions.cigar_id (on delete cascade)
--   cigar_image_submissions.cigar_id (on delete cascade)
-- Wishlist rows have a manual prod unique index on
-- (user_id, cigar_id) where is_wishlist: a member who wishlisted
-- BOTH duplicates keeps the target row (colliding source row is
-- deleted first). The TARGET's fields (including blend) survive;
-- usage counts sum; the target adopts the source's image only
-- when it has none. Manual-apply in the Supabase SQL editor.
-- ============================================================

create or replace function merge_catalog_vitolas(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source         cigar_catalog%rowtype;
  v_humidor        integer;
  v_logs           integer;
  v_wishlist_dupes integer;
begin
  if p_source = p_target then
    raise exception 'source and target are the same row';
  end if;

  select * into v_source from cigar_catalog where id = p_source;
  if not found then raise exception 'source vitola not found'; end if;
  if not exists (select 1 from cigar_catalog where id = p_target) then
    raise exception 'target vitola not found';
  end if;

  delete from humidor_items s
  where s.cigar_id = p_source
    and s.is_wishlist
    and exists (
      select 1 from humidor_items t
      where t.user_id = s.user_id and t.cigar_id = p_target and t.is_wishlist
    );
  get diagnostics v_wishlist_dupes = row_count;

  update humidor_items set cigar_id = p_target where cigar_id = p_source;
  get diagnostics v_humidor = row_count;

  update smoke_logs set cigar_id = p_target where cigar_id = p_source;
  get diagnostics v_logs = row_count;

  update cigar_edit_suggestions  set cigar_id = p_target where cigar_id = p_source;
  update cigar_image_submissions set cigar_id = p_target where cigar_id = p_source;

  update cigar_catalog set
    usage_count = usage_count + coalesce(v_source.usage_count, 0),
    image_url   = coalesce(image_url, v_source.image_url)
  where id = p_target;

  delete from cigar_catalog where id = p_source;

  return jsonb_build_object(
    'humidor_items_moved',    v_humidor,
    'smoke_logs_moved',       v_logs,
    'wishlist_dupes_removed', v_wishlist_dupes
  );
end;
$$;

revoke execute on function merge_catalog_vitolas(uuid, uuid) from public, anon, authenticated;
grant execute on function merge_catalog_vitolas(uuid, uuid) to service_role;

-- ── Verify ──────────────────────────────────────────────────
-- select has_function_privilege('authenticated', 'merge_catalog_vitolas(uuid, uuid)', 'execute');  -- f
-- select has_function_privilege('anon', 'merge_catalog_vitolas(uuid, uuid)', 'execute');           -- f

-- ── Rollback ────────────────────────────────────────────────
-- drop function if exists merge_catalog_vitolas(uuid, uuid);
```

- [ ] **Step 2: Commit** — `"feat: merge_catalog_vitolas RPC (atomic repoint + delete, manual-apply)"`.

---

### Task 7: Merge duplicate vitolas — API + UI

**Files:**
- Create: `app/api/admin/catalog-sizes/[id]/merge/route.ts`
- Modify: `components/admin/AdminSizeEditSheet.tsx` (merge section)

**Interfaces:** POST `/api/admin/catalog-sizes/[id]/merge` body `{ targetId: string }`; is_admin gate; missing RPC → 503 `"Merge not available yet. Apply the merge_catalog_vitolas migration."`.

- [ ] **Step 1: The route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag }             from "next/cache";
import { requireAdmin }              from "@/lib/auth/admin-gate";
import { createServiceClientFor }    from "@/utils/supabase/service";

export const runtime = "edge";

/* POST /api/admin/catalog-sizes/[id]/merge   { targetId }
   Folds vitola [id] into targetId atomically via the
   merge_catalog_vitolas RPC: every member reference (humidor,
   burn logs, suggestions, photo submissions) repoints to the
   target, then the source row is deleted. No inventory is lost. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  let body: { targetId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.targetId || typeof body.targetId !== "string") {
    return NextResponse.json({ error: "targetId is required" }, { status: 400 });
  }
  if (body.targetId === id) {
    return NextResponse.json({ error: "Pick a different vitola to merge into" }, { status: 400 });
  }

  const admin = createServiceClientFor(
    "api/admin/catalog-sizes/merge",
    "atomic vitola merge via merge_catalog_vitolas RPC; is_admin gate above",
  );

  const { data, error } = await admin.rpc("merge_catalog_vitolas", {
    p_source: id,
    p_target: body.targetId,
  });
  if (error) {
    const missing = error.code === "PGRST202" || /not find the function/i.test(error.message ?? "");
    return NextResponse.json(
      { error: missing ? "Merge not available yet. Apply the merge_catalog_vitolas migration." : error.message },
      { status: missing ? 503 : 500 },
    );
  }

  revalidateTag("cigar-catalog", "max");
  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
}
```

- [ ] **Step 2: Merge UI in the vitola editor**

Below the Delete section:

```tsx
        <div className="pt-4 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold text-foreground">Merge into another vitola</p>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Moves every member&apos;s humidor items and burn logs to the vitola you pick, then removes this one. Nothing is lost from anyone&apos;s inventory.
          </p>
          <select
            value={mergeTargetId}
            onChange={(e) => setMergeTargetId(e.target.value)}
            className="input w-full text-sm"
            style={inputStyle}
          >
            <option value="">Choose the surviving vitola…</option>
            {siblings.filter((s) => s.id !== child.id).map((s) => (
              <option key={s.id} value={s.id}>{sizeLabel(s)}</option>
            ))}
          </select>
          {mergeTargetId && (
            confirmMerge ? (
              <button type="button" onClick={handleMerge} disabled={busy}
                className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
                style={{ color: "#fff", background: "var(--destructive, #e5484d)" }}>
                Really merge? This removes the current vitola.
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmMerge(true)} disabled={busy}
                className="btn btn-secondary w-full disabled:opacity-40" style={{ minHeight: 44 }}>
                Merge into {sizeLabel(siblings.find((s) => s.id === mergeTargetId) ?? child)}
              </button>
            )
          )}
        </div>
```

State `mergeTargetId` (""), `confirmMerge` (false), reset on open. Handler:

```tsx
  async function handleMerge() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/catalog-sizes/${child.id}/merge`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ targetId: mergeTargetId }),
    });
    setBusy(false);
    if (res.ok) {
      onSaved("merged");
      onClose();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Merge failed.");
      setConfirmMerge(false);
    }
  }
```

Render site in `CigarDetailClient.tsx`:

```tsx
        <AdminSizeEditSheet
          child={editSize}
          line={{ brand: c.brand, series: c.series }}
          siblings={siblings}
          open={true}
          onClose={() => setEditSize(null)}
          onSaved={(kind) => {
            if ((kind === "deleted" || kind === "merged") && editSize.id === c.id) {
              router.push("/discover/cigars");
              return;
            }
            refreshAfterAdminEdit();
          }}
        />
```

- [ ] **Step 3: Gates + commit** — `"feat: merge duplicate vitolas — admin UI + atomic RPC route"`.

---

### Task 8: Full verification + PR

- [ ] `npm run test:unit`, `npx tsc --noEmit`, `npm run build`, `npm run check:shells` all green; lint = pre-existing baseline only on touched files.
- [ ] Whole-branch code review (opus) + fix wave + scoped re-review per SDD.
- [ ] Push (pre-push PR gate) + PR. Body carries: the eight autonomy decisions for sign-off; deploy note (apply BOTH migrations with the deploy — blend-per-vitola changes Edit line semantics, merge RPC gates the merge action); verify-in-app journeys: per-vitola details + badge switching, Choose Vitola rename, Edit line (brand/series only) at the title with child propagation, vitola blend edit, reassignment to an existing and a new series (blend travels), manual add rejects empty vitola name, merge of a known duplicate with a before/after check on a member humidor item, routed-child merge navigation.
- [ ] Hand Dave both migrations as copy-paste blocks (function bodies separate from grant/revoke), plus the suggested first live test: merge one known duplicate vitola of a cigar in his own humidor and verify the item survives pointing at the survivor with its notes/dates intact.

### Task 9 (OPTIONAL — Dave ratifies): fat-finger prevention for brand/series entry

Two independent layers; either can ship alone.

**9a. Brand + series autocomplete in the manual-add form.**

**Files:** Modify `components/cigars/CigarDetailFields.tsx`, `lib/data/cigar-fetchers.ts`, `lib/data/keys.ts`.

- New fetcher `fetchSeriesForBrand(brand: string): Promise<string[]>` — select `series` from `cigar_lines` for the brand, non-null, ordered, deduped (the authenticated read policy on cigar_lines already allows this). Brand suggestions reuse `fetchCatalogBrands()` (already cached under `keyFor.catalogBrands`).
- `CigarDetailFields` renders native `<datalist>`s: Brand input gets `list="cigar-brand-options"` fed from the brands RPC (SWR, fetched once per session); Series input gets `list="cigar-series-options"` fed from `fetchSeriesForBrand` keyed on the debounced brand value (new key `seriesForBrand: (brand) => ["series-for-brand", brand]`). Native datalist = zero dependencies, works on mobile, and typing a NEW value stays possible (creation never blocked). Picking a suggestion inserts the exact canonical string, so the typo never gets typed.
- Degradation: fetch errors leave plain inputs (empty datalist).

**9b. Case- and whitespace-insensitive line identity.**

**Files:** Fold into Task 2's migration if ratified together (else its own `20260908_line_identity_normalize.sql`); touch the attach comparisons in insert v4 and both admin routes' destination-line lookups.

- Unique index swap: drop `cigar_lines_brand_series_key`, recreate on `(lower(btrim(brand)), lower(btrim(coalesce(series, ''))))` — "chateau fuente" and "Chateau Fuente " can no longer coexist as separate lines.
- Every exact-attach comparison (insert RPC, catalog-lines rename/merge lookup, catalog-sizes reassignment lookup) switches to `lower(btrim(...)) = lower(btrim(...))` equality; on attach the child adopts the line's canonical casing (already the pattern). Route-side lookups use `.ilike()` on trimmed exact strings (no wildcards = case-insensitive equality) with a comment saying so.
- Pre-apply probe (must run BEFORE the index swap; collisions block it):
  `select lower(btrim(brand)), lower(btrim(coalesce(series,''))), count(*) from cigar_lines group by 1, 2 having count(*) > 1;` — expect 0 rows; any hits are case-dupe lines to merge via Edit line first.

## Out of scope (noted, not planned)

- Cross-line vitola merge (line merge covers it upstream).
- Backfilling names onto the 4,200 seed rows (admin editor + audit report are the cleanup tools).
- Bulk merge tooling / audit-report integration (follow-up once the service key is restored).
- DB-level NOT NULL on name (blocked by legacy rows; client-side requirement only).
