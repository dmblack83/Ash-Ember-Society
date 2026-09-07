# Catalog Lines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One catalog entry per cigar line (brand + series) with a size picker, fuzzy duplicate prevention on manual adds, the #607 Discover tab-bar regression fix, and a series-pollution audit report — one PR on `feat/catalog-lines`.

**Architecture:** `cigar_catalog` stays the child table (one row per size, ids immortal). A new `cigar_lines` parent becomes the single write authority for blend fields; a DB trigger propagates line edits to child copies. All READS group by `(brand, coalesce(series,''))` — equivalent to line grouping post-backfill and correct even before migrations run, which is what makes graceful degradation cheap. New RPCs (`get_catalog_lines`, `match_cigar_lines`, `insert_cigar_to_catalog` v2, `get_catalog_brands` v3) are manual-apply; every client caller falls back to today's behavior when an RPC is missing.

**Tech Stack:** Next.js App Router, Supabase (PostgREST + RPCs, manual SQL migrations), SWR, vitest (`npm run test:unit` = `vitest run lib/`).

**Spec:** `docs/superpowers/specs/2026-09-06-catalog-lines-design.md`. Mockups (approved, authoritative): `mockups/mobile-nav/04-catalog-consolidated.html` (browse + detail), `06-manual-add-flow.html` (dupe check).

## Global Constraints

- No em dashes in ANY user-facing copy (toasts, labels, buttons). Mockup copy containing em dashes must be rewritten with plain punctuation.
- Bottom-nav routes stay static shells; `/discover/cigars` `page.tsx` must not gain server data fetches. Gate: `npm run check:shells` after build.
- All SQL migrations are manual-apply (Dave runs them in the Supabase SQL editor). Code must degrade gracefully when they haven't run: browse falls back to ungrouped, add flow skips the dupe check, admin routing falls back to child-only patch.
- Child rows keep every column and their ids forever. Backfill is additive-only (stamps `line_id`). No child row is ever deleted or blend-overwritten by this PR.
- Loss of humidor cigars must be structurally impossible: `humidor_items.cigar_id` continues pointing at `cigar_catalog.id` untouched.
- Vitola chip copy: "N vitolas" (singular: "1 vitola").
- Creation is never blocked: "create a new listing" always works.
- **Spec deviation (flag in PR):** backfill conflict groups cannot get per-variant lines (the spec's own unique index on `(brand, coalesce(series,''))` forbids it). Instead: one line per group from the highest-usage child's blend, children keep their own differing copies untouched, conflict groups listed in the audit report.
- **Mockup deltas (flag in PR):** (1) browse cards lose their per-card Humidor/Wishlist buttons — with grouped cards the size is ambiguous; actions live on the detail page size picker (mockup 04 cards have no buttons). (2) mockup 06's step-4 success screen is implemented as path-specific toasts via the existing close-on-success pattern, not a new in-sheet screen.

---

### Task 1: Discover tab-bar regression fix + catalog exclusion

**Files:**
- Modify: `app/(app)/discover/layout.tsx`

**Interfaces:**
- Produces: no exports change. `/discover/channels|cigar-news|vendors` render tabs below the mobile top bar; `/discover/cigars*` render children with no tab bar and no TAB_BAR_H offset.

- [ ] **Step 1: Apply the fix**

In `app/(app)/discover/layout.tsx`:

1. After `const pathname = usePathname();` add:

```tsx
  /* The catalog is reachable from the side sheet / rail, not these
     tabs — approved catalog mockups show no tab bar there. Skipping
     the offset too keeps the catalog flush under the top bar. */
  if (pathname.startsWith("/discover/cigars")) {
    return <>{children}</>;
  }
```

2. Change the fixed wrapper's `top: 0,` to:

```tsx
          top:             "var(--page-top-offset)",
```

(This is the same two-variable treatment every other fixed header got in #607 — `--page-top-offset` is the mobile top bar height below lg, 0 at lg+ where the top bar is hidden. `<main>` in `app/(app)/layout.tsx:430` already pads by the same var, so the tab bar previously sat UNDER the top bar.)

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty false 2>&1 | head -20`
Expected: no new errors (pre-existing errors unrelated to this file are acceptable if the file itself is clean).

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/discover/layout.tsx"
git commit -m "fix: discover tab bar hidden under mobile top bar (#607 regression); no tabs on catalog routes"
```

---

### Task 2: SQL migrations (6 files, manual-apply)

**Files:**
- Create: `supabase/migrations/20260906_cigar_lines.sql`
- Create: `supabase/migrations/20260906_cigar_lines_backfill.sql`
- Create: `supabase/migrations/20260906_match_cigar_lines_rpc.sql`
- Create: `supabase/migrations/20260906_get_catalog_lines_rpc.sql`
- Create: `supabase/migrations/20260906_catalog_brands_rpc_v3.sql`
- Create: `supabase/migrations/20260906_insert_cigar_to_catalog_v2.sql`

**Interfaces:**
- Produces: DB objects `cigar_lines`, `cigar_catalog.line_id`, trigger `cigar_lines_sync_children`; RPCs `match_cigar_lines(p_brand text, p_series text)`, `get_catalog_lines(p_search text, p_brand text, p_offset int, p_limit int)`, `get_catalog_brands()` v3, `insert_cigar_to_catalog(...)` v2 (signature unchanged from v1's 10 params). Later tasks call these RPCs by exactly these names/args.
- No app code in this task. Files are committed; Dave applies them in the SQL editor (1–2 before deploy; 3–6 before their features activate).

- [ ] **Step 1: Write `20260906_cigar_lines.sql`**

```sql
-- ============================================================
-- cigar_lines: parent table (shared DNA per brand+series line).
-- cigar_catalog stays the child table (one row per size); child
-- blend columns become database-maintained copies of the line.
-- Manual-apply in the Supabase SQL editor. Rollback at bottom.
-- ============================================================

create table if not exists cigar_lines (
  id               uuid primary key default gen_random_uuid(),
  brand            text not null,
  series           text,                -- null = brand-only line
  wrapper          text,
  shade            text,
  wrapper_country  text,
  binder_country   text,
  filler_countries text[],
  community_added  boolean not null default false,
  approved         boolean not null default true,
  created_at       timestamptz not null default now()
);

create unique index if not exists cigar_lines_brand_series_key
  on cigar_lines (brand, coalesce(series, ''));

alter table cigar_lines enable row level security;

-- Authenticated read only; NO write policies (writes go through
-- security-definer RPCs / the sync trigger / service role). Anon
-- gets nothing, matching the catalog anon-read hardening.
drop policy if exists cigar_lines_authenticated_read on cigar_lines;
create policy cigar_lines_authenticated_read
  on cigar_lines for select to authenticated using (true);

-- Child link. on delete restrict: a line with children can't be
-- deleted; existing FKs already block deleting referenced children.
alter table cigar_catalog
  add column if not exists line_id uuid references cigar_lines(id) on delete restrict;

create index if not exists cigar_catalog_line_id_idx
  on cigar_catalog (line_id);
-- Sibling lookups group by (brand, series) — cheap btree.
create index if not exists cigar_catalog_brand_series_idx
  on cigar_catalog (brand, series);

-- Sync contract: cigar_lines is the ONLY writable home of blend
-- fields. This trigger propagates line edits to children's copies.
-- UPDATE only — it can never delete rows or touch ids/format/
-- ring_gauge/length_inches. search_text regenerates automatically
-- (it computes from child columns).
create or replace function sync_cigar_line_children()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update cigar_catalog set
    brand            = new.brand,
    series           = new.series,
    wrapper          = new.wrapper,
    shade            = new.shade,
    wrapper_country  = new.wrapper_country,
    binder_country   = new.binder_country,
    filler_countries = new.filler_countries
  where line_id = new.id;
  return new;
end;
$$;

drop trigger if exists cigar_lines_sync_children on cigar_lines;
create trigger cigar_lines_sync_children
  after update of brand, series, wrapper, shade, wrapper_country,
                  binder_country, filler_countries
  on cigar_lines
  for each row execute function sync_cigar_line_children();

-- ── Verify ──────────────────────────────────────────────────
-- select count(*) from cigar_lines;                          -- 0 (backfill comes next)
-- select column_name from information_schema.columns
--   where table_name = 'cigar_catalog' and column_name = 'line_id';  -- 1 row
-- select tgname from pg_trigger where tgname = 'cigar_lines_sync_children'; -- 1 row

-- ── Rollback (byte-identical to today) ──────────────────────
-- drop trigger if exists cigar_lines_sync_children on cigar_lines;
-- drop function if exists sync_cigar_line_children();
-- alter table cigar_catalog drop column if exists line_id;
-- drop table if exists cigar_lines;
```

- [ ] **Step 2: Write `20260906_cigar_lines_backfill.sql`**

```sql
-- ============================================================
-- One-time backfill: one line per (brand, coalesce(series,''))
-- group; stamp line_id on every child. Additive-only: no child
-- row is deleted or modified beyond line_id.
--
-- Conflict handling: groups whose rows disagree on a blend field
-- get ONE line built from the highest-usage child (deterministic;
-- ties broken by id). Children keep their own copies untouched —
-- the audit report lists these groups for per-entry resolution.
-- (Seed data: 0 conflicts; prod may differ via community adds.)
-- Run AFTER 20260906_cigar_lines.sql.
-- ============================================================

-- Record the before-count to compare in verify:
-- select count(*) from cigar_catalog;

insert into cigar_lines
  (brand, series, wrapper, shade, wrapper_country, binder_country,
   filler_countries, community_added, approved)
select distinct on (brand, coalesce(series, ''))
  brand, series, wrapper, shade, wrapper_country, binder_country,
  filler_countries, community_added, approved
from cigar_catalog
where brand is not null
order by brand, coalesce(series, ''), usage_count desc, id
on conflict (brand, coalesce(series, '')) do nothing;

update cigar_catalog c
set line_id = l.id
from cigar_lines l
where c.line_id is null
  and c.brand is not null
  and l.brand = c.brand
  and coalesce(l.series, '') = coalesce(c.series, '');

-- ── Verify ──────────────────────────────────────────────────
-- 1. Catalog row count UNCHANGED vs the before-count above.
-- select count(*) from cigar_catalog;
-- 2. Every row has line_id (expect 0; if >0, run the brand-null
--    check below — null-brand rows are the only legitimate gap):
-- select count(*) from cigar_catalog where line_id is null;
-- select count(*) from cigar_catalog where brand is null;
-- 3. Line count = distinct group count (both queries equal):
-- select count(*) from cigar_lines;
-- select count(distinct (brand, coalesce(series,''))) from cigar_catalog where brand is not null;
-- 4. Zero orphan lines:
-- select count(*) from cigar_lines l
--   where not exists (select 1 from cigar_catalog c where c.line_id = l.id);
-- 5. humidor_items count UNCHANGED:
-- select count(*) from humidor_items;
-- 6. Blend-conflict groups (audit input; expected 0 on seed data):
-- select l.brand, l.series, count(distinct (coalesce(c.wrapper,''),
--   coalesce(c.shade,''), coalesce(c.wrapper_country,''),
--   coalesce(c.binder_country,''), coalesce(c.filler_countries,'{}'::text[])))
-- from cigar_lines l join cigar_catalog c on c.line_id = l.id
-- group by l.brand, l.series
-- having count(distinct (coalesce(c.wrapper,''), coalesce(c.shade,''),
--   coalesce(c.wrapper_country,''), coalesce(c.binder_country,''),
--   coalesce(c.filler_countries,'{}'::text[]))) > 1;
```

- [ ] **Step 3: Write `20260906_match_cigar_lines_rpc.sql`**

```sql
-- ============================================================
-- match_cigar_lines: fuzzy line match for the manual-add dupe
-- check. Trigram similarity of "brand series" against grouped
-- cigar_catalog (works pre- and post-backfill; groups ≡ lines).
-- Returns the single best group above threshold as one row per
-- child, with line meta duplicated per row (client reshapes).
-- Threshold 0.5 is a starting point — tune against prod via the
-- audit script's near-match table. Must catch
-- "Gran Reserve" -> "Gran Reserva".
-- ============================================================

create or replace function match_cigar_lines(
  p_brand  text,
  p_series text default null
)
returns table (
  similarity           real,
  brand                text,
  series               text,
  wrapper              text,
  shade                text,
  wrapper_country      text,
  binder_country       text,
  filler_countries     text[],
  child_id             uuid,
  child_format         text,
  child_ring_gauge     numeric,
  child_length_inches  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with best as (
    select distinct
      c.brand,
      coalesce(c.series, '') as gseries,
      similarity(
        lower(c.brand || ' ' || coalesce(c.series, '')),
        lower(trim(p_brand || ' ' || coalesce(p_series, '')))
      ) as sim
    from cigar_catalog c
    where c.brand is not null
    order by sim desc
    limit 1
  ),
  meta as (
    select c.wrapper, c.shade, c.wrapper_country, c.binder_country,
           c.filler_countries
    from cigar_catalog c
    join best b on c.brand = b.brand and coalesce(c.series, '') = b.gseries
    order by c.usage_count desc, c.id
    limit 1
  )
  select b.sim, b.brand, nullif(b.gseries, ''),
         m.wrapper, m.shade, m.wrapper_country, m.binder_country,
         m.filler_countries,
         c.id, c.format, c.ring_gauge, c.length_inches
  from best b
  cross join meta m
  join cigar_catalog c
    on c.brand = b.brand and coalesce(c.series, '') = b.gseries
  where b.sim >= 0.5
  order by c.ring_gauge nulls last, c.length_inches nulls last, c.id
$$;

revoke execute on function match_cigar_lines(text, text) from anon;

-- ── Verify ──────────────────────────────────────────────────
-- select distinct brand, series, similarity
--   from match_cigar_lines('Arturo Fuente', 'Gran Reserve');
--   -- expect the Gran Reserva line with similarity > 0.5
-- select count(*) from match_cigar_lines('Zzzz', 'Qqqq');  -- 0
```

- [ ] **Step 4: Write `20260906_get_catalog_lines_rpc.sql`**

```sql
-- ============================================================
-- get_catalog_lines: line-grouped catalog browse. Groups
-- cigar_catalog by (brand, coalesce(series,'')). A line matches
-- a search when ANY single child matches ALL tokens against
-- search_text (same AND semantics as today's client fetcher).
-- size_count counts ALL children of the line, not just matching
-- ones (the "N vitolas" chip is the line's true size count).
-- rep_id = the top-usage MATCHING child, so tapping a search
-- result preselects a size that matched.
-- ============================================================

create or replace function get_catalog_lines(
  p_search text    default null,
  p_brand  text    default null,
  p_offset integer default 0,
  p_limit  integer default 20
)
returns table (
  brand       text,
  series      text,
  wrapper     text,
  shade       text,
  size_count  bigint,
  rep_id      uuid,
  image_url   text,
  total_usage bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with kids as (
    select c.*
    from cigar_catalog c
    where c.brand is not null
      and (p_brand is null or c.brand = p_brand)
      and (
        p_search is null or trim(p_search) = '' or
        (select bool_and(c.search_text ilike '%' || t.tok || '%')
         from unnest(regexp_split_to_array(lower(trim(p_search)), '\s+')) as t(tok))
      )
  ),
  grouped as (
    select
      k.brand,
      coalesce(k.series, '') as gseries,
      (array_agg(k.id        order by k.usage_count desc, k.id))[1] as rep_id,
      (array_agg(k.wrapper   order by k.usage_count desc, k.id))[1] as wrapper,
      (array_agg(k.shade     order by k.usage_count desc, k.id))[1] as shade,
      (array_agg(k.image_url order by (k.image_url is null), k.usage_count desc, k.id))[1] as image_url,
      sum(k.usage_count) as total_usage
    from kids k
    group by k.brand, coalesce(k.series, '')
  )
  select
    g.brand,
    nullif(g.gseries, '') as series,
    g.wrapper,
    g.shade,
    (select count(*) from cigar_catalog c2
      where c2.brand = g.brand and coalesce(c2.series, '') = g.gseries) as size_count,
    g.rep_id,
    g.image_url,
    g.total_usage
  from grouped g
  order by g.total_usage desc, g.brand asc, g.gseries asc
  offset p_offset limit p_limit
$$;

revoke execute on function get_catalog_lines(text, text, integer, integer) from anon;

-- ── Verify ──────────────────────────────────────────────────
-- select count(*) from get_catalog_lines(null, null, 0, 2000);
--   -- ≈ distinct (brand, coalesce(series,'')) count (~1,717 on seed)
-- select * from get_catalog_lines('hemingway', null, 0, 5);
-- select * from get_catalog_lines(null, 'Arturo Fuente', 0, 50);
```

- [ ] **Step 5: Write `20260906_catalog_brands_rpc_v3.sql`**

```sql
-- ============================================================
-- get_catalog_brands v3: cigar_count now counts LINES per brand
-- (distinct coalesce(series,'')), matching the consolidated
-- catalog. Ranking by member adds (humidor_items) unchanged
-- from v2. Same name/signature — clients need no change.
-- ============================================================

create or replace function public.get_catalog_brands()
returns table (brand text, cigar_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.brand,
    count(distinct coalesce(c.series, ''))::bigint as cigar_count
  from public.cigar_catalog c
  left join public.humidor_items h on h.cigar_id = c.id
  where c.brand is not null and c.brand <> ''
  group by c.brand
  order by count(h.id) desc, c.brand asc
$$;

revoke execute on function public.get_catalog_brands() from anon;

-- ── Verify ──────────────────────────────────────────────────
-- select * from get_catalog_brands() limit 5;
--   -- cigar_count per brand should drop vs v2 (lines, not sizes)
```

- [ ] **Step 6: Write `20260906_insert_cigar_to_catalog_v2.sql`**

```sql
-- ============================================================
-- insert_cigar_to_catalog v2: create-or-attach line. Same
-- signature as v1 (10 params) so existing clients keep working.
--  - Finds the line by (brand, coalesce(series,'')); creates it
--    from the caller's blend when absent (community, unapproved).
--  - The child copies the LINE's blend, not the caller's — the
--    line is the blend authority. Size fields come from the call.
--  - Never blocks creation. Requires 20260906_cigar_lines.sql.
-- ============================================================

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
      insert into cigar_lines
        (brand, series, wrapper, shade, wrapper_country,
         binder_country, filler_countries, community_added, approved)
      values
        (p_brand, p_series, p_wrapper, p_shade, p_wrapper_country,
         p_binder_country, p_filler_countries, true, false)
      returning * into v_line;
    exception when unique_violation then
      -- concurrent create of the same line: attach to the winner
      select * into v_line
      from cigar_lines
      where brand = p_brand
        and coalesce(series, '') = coalesce(p_series, '');
    end;
  end if;

  insert into cigar_catalog (
    source_id, brand, series, format, ring_gauge, length_inches,
    wrapper, wrapper_country, shade, binder_country, filler_countries,
    community_added, approved, usage_count, line_id
  ) values (
    'community-' || gen_random_uuid()::text,
    v_line.brand, v_line.series, p_format, p_ring_gauge, p_length_inches,
    v_line.wrapper, v_line.wrapper_country, v_line.shade,
    v_line.binder_country, v_line.filler_countries,
    true, false, 0, v_line.id
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ── Verify ──────────────────────────────────────────────────
-- (run as an authenticated test, or inspect after a manual add)
-- select l.brand, l.series, count(c.id) from cigar_lines l
--   join cigar_catalog c on c.line_id = l.id
--   where l.community_added group by 1,2 order by max(l.created_at) desc limit 5;
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260906_cigar_lines.sql supabase/migrations/20260906_cigar_lines_backfill.sql supabase/migrations/20260906_match_cigar_lines_rpc.sql supabase/migrations/20260906_get_catalog_lines_rpc.sql supabase/migrations/20260906_catalog_brands_rpc_v3.sql supabase/migrations/20260906_insert_cigar_to_catalog_v2.sql
git commit -m "feat: cigar_lines schema, backfill, match/browse/insert RPCs (manual-apply SQL)"
```

---

### Task 3: Pure helpers — `lib/cigars/line-group.ts` (TDD)

**Files:**
- Create: `lib/cigars/line-group.ts`
- Test: `lib/cigars/__tests__/line-group.test.ts`

**Interfaces:**
- Consumes: `CatalogResult` from `@/components/cigar-search`, `lengthLabelForInches` from `@/lib/cigar-taxonomy`.
- Produces (used by Tasks 4–7):

```ts
export interface CatalogLine {
  brand: string | null; series: string | null;
  wrapper: string | null; shade: string | null;
  sizeCount: number;          // 0 = unknown (ungrouped fallback: hide chip)
  repId: string;              // child id used for card navigation
  imageUrl: string | null;
}
export interface SizeChild {
  id: string; format: string | null;
  ring_gauge: number | null; length_inches: number | null;
  image_url?: string | null;
}
export interface EnteredSize {
  format: string; ringGauge: number | null; lengthInches: number | null;
}
export const LENGTH_TOLERANCE_INCHES = 0.125;
export function sizeDims(c: SizeChild): string;            // '50 × 4"' | '50 ring' | '4"' | ''
export function sizeLabel(c: SizeChild): string;           // 'Perfecto 50 × 4"' (format-less: dims only; both empty: 'Original size')
export function findMatchingSize(children: SizeChild[], entered: EnteredSize): SizeChild | null;
export function childToLine(c: CatalogResult): CatalogLine; // ungrouped fallback mapping
```

- [ ] **Step 1: Write the failing tests**

Create `lib/cigars/__tests__/line-group.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  sizeDims, sizeLabel, findMatchingSize, childToLine,
} from "@/lib/cigars/line-group";
import type { CatalogResult } from "@/components/cigar-search";

const child = (over: Partial<{ id: string; format: string | null; ring_gauge: number | null; length_inches: number | null }> = {}) => ({
  id: "c1", format: "Churchill", ring_gauge: 48, length_inches: 7, ...over,
});

describe("sizeDims / sizeLabel", () => {
  test("formats ring × length with fraction label", () => {
    expect(sizeDims(child({ length_inches: 7.25 }))).toBe('48 × 7 1/4"');
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
    expect(sizeLabel(child())).toBe('Churchill 48 × 7"');
  });
  test("label without format is dims only", () => {
    expect(sizeLabel(child({ format: null }))).toBe('48 × 7"');
  });
  test("label with nothing is 'Original size'", () => {
    expect(sizeLabel(child({ format: null, ring_gauge: null, length_inches: null }))).toBe("Original size");
  });
});

describe("findMatchingSize", () => {
  const kids = [
    child({ id: "a", format: "Churchill", ring_gauge: 48, length_inches: 7.25 }),
    child({ id: "b", format: "Robusto",   ring_gauge: 50, length_inches: 5 }),
    child({ id: "c", format: null,        ring_gauge: null, length_inches: null }),
  ];
  test("exact match", () => {
    expect(findMatchingSize(kids, { format: "Churchill", ringGauge: 48, lengthInches: 7.25 })?.id).toBe("a");
  });
  test("format compares case-insensitively", () => {
    expect(findMatchingSize(kids, { format: "churchill ", ringGauge: 48, lengthInches: 7.25 })?.id).toBe("a");
  });
  test("length within 1/8 inch matches", () => {
    expect(findMatchingSize(kids, { format: "Churchill", ringGauge: 48, lengthInches: 7.375 })?.id).toBe("a");
  });
  test("length beyond 1/8 inch does not match", () => {
    expect(findMatchingSize(kids, { format: "Churchill", ringGauge: 48, lengthInches: 7.5 })).toBeNull();
  });
  test("ring must be equal", () => {
    expect(findMatchingSize(kids, { format: "Churchill", ringGauge: 50, lengthInches: 7.25 })).toBeNull();
  });
  test("all-null entered size matches an all-null child", () => {
    expect(findMatchingSize(kids, { format: "", ringGauge: null, lengthInches: null })?.id).toBe("c");
  });
  test("empty entered format does not match a named format", () => {
    expect(findMatchingSize([kids[0]], { format: "", ringGauge: 48, lengthInches: 7.25 })).toBeNull();
  });
});

describe("childToLine", () => {
  const cr: CatalogResult = {
    id: "x1", brand: "Padron", series: "1964", format: "Toro",
    ring_gauge: 52, length_inches: 6, wrapper: "Maduro",
    wrapper_country: "NI", shade: null, usage_count: 3, image_url: null,
  };
  test("maps a child row to an ungrouped line (sizeCount 0 = unknown)", () => {
    expect(childToLine(cr)).toEqual({
      brand: "Padron", series: "1964", wrapper: "Maduro", shade: null,
      sizeCount: 0, repId: "x1", imageUrl: null,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/cigars/__tests__/line-group.test.ts`
Expected: FAIL — module `@/lib/cigars/line-group` not found.

- [ ] **Step 3: Implement `lib/cigars/line-group.ts`**

```ts
/**
 * Line-grouping helpers for the consolidated catalog.
 *
 * A "line" is one cigar entry (brand + series); its children are
 * the size rows in cigar_catalog. Pure functions only — no React,
 * no Supabase — so size matching and label logic are unit-testable.
 */

import type { CatalogResult } from "@/components/cigar-search";
import { lengthLabelForInches } from "@/lib/cigar-taxonomy";

export interface CatalogLine {
  brand:     string | null;
  series:    string | null;
  wrapper:   string | null;
  shade:     string | null;
  /* 0 = unknown (ungrouped fallback when the browse RPC is
     missing) — the UI hides the vitola chip then. */
  sizeCount: number;
  /* Child id the card navigates to (/discover/cigars/[repId]). */
  repId:     string;
  imageUrl:  string | null;
}

export interface SizeChild {
  id:             string;
  format:         string | null;
  ring_gauge:     number | null;
  length_inches:  number | null;
  image_url?:     string | null;
}

export interface EnteredSize {
  format:       string;         // "" = none
  ringGauge:    number | null;
  lengthInches: number | null;
}

/* Dupe-check size tolerance: format equal, ring equal, length
   within 1/8" (spec: Feature 3). */
export const LENGTH_TOLERANCE_INCHES = 0.125;

/* '50 × 4"' — ring × length, dropping whichever is missing. */
export function sizeDims(c: SizeChild): string {
  const len = c.length_inches != null
    ? (lengthLabelForInches(c.length_inches) ?? `${c.length_inches}"`)
    : null;
  if (c.ring_gauge != null && len) return `${c.ring_gauge} × ${len}`;
  if (c.ring_gauge != null)        return `${c.ring_gauge} ring`;
  if (len)                         return len;
  return "";
}

/* 'Perfecto 50 × 4"' — CTA label suffix for a selected size. */
export function sizeLabel(c: SizeChild): string {
  const parts = [c.format, sizeDims(c)].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Original size";
}

function normFormat(f: string | null | undefined): string {
  return (f ?? "").trim().toLowerCase();
}

/* The entered size matches a child when format (case-insensitive),
   ring gauge, and length (±1/8") all agree — null/empty on both
   sides counts as agreement. */
export function findMatchingSize(
  children: SizeChild[],
  entered:  EnteredSize,
): SizeChild | null {
  for (const c of children) {
    const formatOk = normFormat(c.format) === normFormat(entered.format);
    const ringOk   = (c.ring_gauge ?? null) === (entered.ringGauge ?? null);
    const lengthOk =
      c.length_inches == null || entered.lengthInches == null
        ? (c.length_inches ?? null) === (entered.lengthInches ?? null)
        : Math.abs(c.length_inches - entered.lengthInches) <= LENGTH_TOLERANCE_INCHES;
    if (formatOk && ringOk && lengthOk) return c;
  }
  return null;
}

/* Ungrouped fallback: one card per child row, chip hidden. */
export function childToLine(c: CatalogResult): CatalogLine {
  return {
    brand:     c.brand,
    series:    c.series,
    wrapper:   c.wrapper,
    shade:     c.shade,
    sizeCount: 0,
    repId:     c.id,
    imageUrl:  c.image_url,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/cigars/__tests__/line-group.test.ts`
Expected: PASS (all tests). Note: `lengthLabelForInches(7.25)` must yield `7 1/4"` — if the taxonomy label list has no 7 1/4 entry it falls back to `7.25"`; check `lib/cigar-taxonomy.ts` LENGTHS and adjust the test's expected string to the actual label for 7.25 before assuming the implementation is wrong.

- [ ] **Step 5: Commit**

```bash
git add lib/cigars/line-group.ts lib/cigars/__tests__/line-group.test.ts
git commit -m "feat: line-group helpers (size labels, 1/8-inch match, ungrouped fallback)"
```

---

### Task 4: Fetchers + SWR keys

**Files:**
- Modify: `lib/data/keys.ts` (add two keys near `catalogBrands`)
- Modify: `lib/data/cigar-fetchers.ts` (append three fetchers)

**Interfaces:**
- Consumes: `CatalogLine`, `SizeChild`, `childToLine` from Task 3; existing `fetchCigarPage`, `CATALOG_SELECT` pattern.
- Produces (used by Tasks 5–7):

```ts
// keys.ts additions
catalogLines: (query: string, page: number, brand = "") => ["catalog-lines", query, brand, page] as const,
lineSiblings: (brand: string, series: string | null) => ["line-siblings", brand, series ?? ""] as const,

// cigar-fetchers.ts additions
export interface CatalogLinePage { lines: CatalogLine[]; hasMore: boolean; grouped: boolean; }
export async function fetchCatalogLines(args: { query: string; brand?: string; pageIndex: number; pageSize: number }): Promise<CatalogLinePage>;
export async function fetchLineSiblings(brand: string, series: string | null): Promise<SizeChild[]>;
export interface LineMatch {
  similarity: number;
  line: { brand: string; series: string | null; wrapper: string | null; shade: string | null;
          wrapper_country: string | null; binder_country: string | null; filler_countries: string[] | null };
  children: SizeChild[];
}
export async function matchCigarLines(brand: string, series: string | null): Promise<LineMatch | null>;
```

- [ ] **Step 1: Add the keys**

In `lib/data/keys.ts`, after the `catalogBrands` entry add:

```ts
  /* Line-grouped catalog browse (consolidated cards). */
  catalogLines: (query: string, page: number, brand = "") =>
    ["catalog-lines", query, brand, page] as const,
  /* All size rows of one line (brand + series group). Public data,
     shared across users. */
  lineSiblings: (brand: string, series: string | null) =>
    ["line-siblings", brand, series ?? ""] as const,
```

- [ ] **Step 2: Append the fetchers**

In `lib/data/cigar-fetchers.ts`, add imports at the top:

```ts
import { childToLine, type CatalogLine, type SizeChild } from "@/lib/cigars/line-group";
```

Append at the end of the file:

```ts
/* ── Line-grouped browse (consolidated catalog) ─────────────────── */

export interface CatalogLinePage {
  lines:   CatalogLine[];
  hasMore: boolean;
  /* false = the get_catalog_lines RPC is missing (migration not yet
     applied) and this page fell back to ungrouped child rows. */
  grouped: boolean;
}

interface CatalogLineRpcRow {
  brand: string | null; series: string | null;
  wrapper: string | null; shade: string | null;
  size_count: number; rep_id: string; image_url: string | null;
  total_usage: number;
}

/* PostgREST "function not found" — the manual-apply migration hasn't
   run yet. Every new RPC caller degrades on this. */
function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || /function .* does not exist|not find the function/i.test(error.message ?? "");
}

export async function fetchCatalogLines({
  query,
  brand,
  pageIndex,
  pageSize,
}: {
  query: string; brand?: string; pageIndex: number; pageSize: number;
}): Promise<CatalogLinePage> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_catalog_lines", {
    p_search: query || null,
    p_brand:  brand || null,
    p_offset: pageIndex * pageSize,
    p_limit:  pageSize,
  });

  if (error) {
    if (!isMissingFunction(error)) throw new Error(error.message);
    /* Fallback: ungrouped child rows, one card each (today's list). */
    const page = await fetchCigarPage({ query, brand, pageIndex, pageSize });
    return { lines: page.results.map(childToLine), hasMore: page.hasMore, grouped: false };
  }

  const rows = (data ?? []) as CatalogLineRpcRow[];
  return {
    lines: rows.map((r) => ({
      brand: r.brand, series: r.series, wrapper: r.wrapper, shade: r.shade,
      sizeCount: Number(r.size_count), repId: r.rep_id, imageUrl: r.image_url,
    })),
    hasMore: rows.length === pageSize,
    grouped: true,
  };
}

/* ── Line siblings (detail size picker) ─────────────────────────── */

/* All size rows of the tapped child's line, via (brand, series)
   equality — identical to line grouping post-backfill and correct
   before any migration runs. */
export async function fetchLineSiblings(
  brand:  string,
  series: string | null,
): Promise<SizeChild[]> {
  const supabase = createClient();
  let q = supabase
    .from("cigar_catalog")
    .select("id, format, ring_gauge, length_inches, image_url")
    .eq("brand", brand);
  q = series === null ? q.is("series", null) : q.eq("series", series);
  const { data, error } = await q
    .order("ring_gauge", { ascending: true, nullsFirst: false })
    .order("length_inches", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SizeChild[];
}

/* ── Manual-add dupe check ──────────────────────────────────────── */

export interface LineMatch {
  similarity: number;
  line: {
    brand: string; series: string | null;
    wrapper: string | null; shade: string | null;
    wrapper_country: string | null; binder_country: string | null;
    filler_countries: string[] | null;
  };
  children: SizeChild[];
}

interface MatchRpcRow {
  similarity: number; brand: string; series: string | null;
  wrapper: string | null; shade: string | null;
  wrapper_country: string | null; binder_country: string | null;
  filler_countries: string[] | null;
  child_id: string; child_format: string | null;
  child_ring_gauge: number | null; child_length_inches: number | null;
}

/* null = no match above threshold OR the RPC is missing (dupe check
   silently skipped — creation is never blocked). */
export async function matchCigarLines(
  brand:  string,
  series: string | null,
): Promise<LineMatch | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("match_cigar_lines", {
    p_brand:  brand,
    p_series: series,
  });
  if (error) {
    if (isMissingFunction(error)) return null;
    throw new Error(error.message);
  }
  const rows = (data ?? []) as MatchRpcRow[];
  if (rows.length === 0) return null;
  const first = rows[0];
  return {
    similarity: first.similarity,
    line: {
      brand: first.brand, series: first.series,
      wrapper: first.wrapper, shade: first.shade,
      wrapper_country: first.wrapper_country,
      binder_country: first.binder_country,
      filler_countries: first.filler_countries,
    },
    children: rows.map((r) => ({
      id: r.child_id, format: r.child_format,
      ring_gauge: r.child_ring_gauge, length_inches: r.child_length_inches,
    })),
  };
}
```

- [ ] **Step 3: Type-check and run the lib suite**

Run: `npx tsc --noEmit --pretty false 2>&1 | head -20 && npm run test:unit`
Expected: clean compile for the touched files; all lib tests PASS (keys test unaffected — it doesn't enumerate keys exhaustively; if it does, extend it with the two new builders).

- [ ] **Step 4: Commit**

```bash
git add lib/data/keys.ts lib/data/cigar-fetchers.ts
git commit -m "feat: line browse/siblings/match fetchers with missing-RPC fallbacks"
```

---

### Task 5: Consolidated browse UI (mockup 04)

**Files:**
- Modify: `components/cigars/DiscoverCigarsClient.tsx`

**Interfaces:**
- Consumes: `fetchCatalogLines`, `CatalogLinePage` (Task 4), `keyFor.catalogLines`, `CatalogLine`.
- Produces: browse renders one card per line; cards navigate to `/discover/cigars/[repId]`; no per-card action buttons (mockup 04 — actions moved to detail). `AddToHumidorSheet`, wishlist handler, `Toast`, and their imports are removed from this file.

- [ ] **Step 1: Swap the data layer**

In `DiscoverCigarsClient.tsx`:
- Replace the `useSWRInfinite<CigarPage>` block: key builder `keyFor.cigarSearch(...)` → `keyFor.catalogLines(debouncedQ, pageIndex, brandSel ?? "")` (same tuple order: `(pageIndex, prev)` guard on `prev.hasMore` unchanged), fetcher → `fetchCatalogLines({ query: q as string, brand: (brand as string) || undefined, pageIndex: pageIndex as number, pageSize: PAGE_SIZE })`, generic → `CatalogLinePage`.
- Derivations: `const lines = (data ?? []).flatMap((p) => p.lines);` and `hasMore` reads `p.hasMore` from the last page as today.
- Update imports: drop `CatalogResult`, `fetchCigarPage`, `AddToHumidorSheet` dynamic import, `createClient`, `globalMutate`; add `fetchCatalogLines`, `type CatalogLinePage` from `@/lib/data/cigar-fetchers` and `type CatalogLine` from `@/lib/cigars/line-group`.
- Delete `handleAddHumidor`, `handleAddWishlist`, `handleHumidorSuccess`, `humidorCigar`, `wishlistPending`, `toast` state, the `<Toast>` render, and the `<AddToHumidorSheet>` render (browse cards no longer act — detail does).

- [ ] **Step 2: Rewrite the two card components**

Replace `CatalogGridCard` and `CatalogListRow` with line-shaped versions (keep `IntentLink`, `CigarImage`, class names, and the save-on-navigate hook):

```tsx
function vitolaChip(count: number) {
  if (count < 1) return null;
  return (
    <span
      className="inline-block self-start text-[10px] font-semibold px-2.5 py-1 rounded-full mt-1.5"
      style={{ backgroundColor: "rgba(212,160,74,0.12)", color: "var(--gold, #D4A04A)" }}
    >
      {count} vitola{count !== 1 ? "s" : ""}
    </span>
  );
}

function LineGridCard({ line, onCardNav }: { line: CatalogLine; onCardNav: () => void }) {
  return (
    <IntentLink
      href={`/discover/cigars/${line.repId}`}
      onClick={onCardNav}
      className="card flex flex-col gap-2 h-full p-0 overflow-hidden cursor-pointer"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div className="w-full aspect-[4/3] bg-muted overflow-hidden flex-shrink-0 relative">
        <CigarImage
          imageUrl={line.imageUrl}
          wrapper={line.wrapper}
          alt={line.series ?? line.brand ?? ""}
          fill
          sizes="(min-width: 768px) 25vw, 50vw"
          quality={60}
          className="object-contain"
        />
      </div>
      <div className="px-3 pt-1 pb-3 flex flex-col gap-1 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground truncate">
          {line.brand}
        </p>
        <p
          className="text-sm font-semibold text-foreground leading-snug line-clamp-2"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {line.series ?? line.brand}
        </p>
        {line.wrapper && (
          <p className="text-xs text-muted-foreground truncate">{line.wrapper}</p>
        )}
        {vitolaChip(line.sizeCount)}
      </div>
    </IntentLink>
  );
}

function LineListRow({ line, onCardNav }: { line: CatalogLine; onCardNav: () => void }) {
  return (
    <IntentLink
      href={`/discover/cigars/${line.repId}`}
      onClick={onCardNav}
      className="card flex items-center gap-3 p-3 cursor-pointer"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0 relative">
        <CigarImage
          imageUrl={line.imageUrl}
          wrapper={line.wrapper}
          alt={line.series ?? line.brand ?? ""}
          fill
          sizes="48px"
          quality={70}
          className="object-contain"
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
          {line.brand}
        </p>
        <p
          className="text-sm font-semibold text-foreground truncate"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {line.series ?? line.brand}
        </p>
        {line.wrapper && (
          <p className="text-xs text-muted-foreground truncate">{line.wrapper}</p>
        )}
      </div>
      {line.sizeCount >= 1 && (
        <span
          className="flex-shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full"
          style={{ backgroundColor: "rgba(212,160,74,0.12)", color: "var(--gold, #D4A04A)" }}
        >
          {line.sizeCount} vitola{line.sizeCount !== 1 ? "s" : ""}
        </span>
      )}
    </IntentLink>
  );
}
```

Render sites: map `lines` and key by `line.repId`; pass only `line` and `onCardNav={saveListState}`. Section labels: replace `cigars.length` with `lines.length` (drill-down label keeps its current "`${brandSel} · N+ cigar(s)`" template; N now counts lines, matching the brands-landing count semantics).

- [ ] **Step 3: Check the restore path still compiles and behaves**

The restore effect references `data?.length` for content-readiness — it still does (pages of lines). `serializeCatalogRestore` inputs (`query`, `brandSel`, `brandsShown`, `size`, `y`) are untouched. Run: `npx vitest run lib/cigars/__tests__/catalog-restore.test.ts` — Expected: PASS.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit --pretty false 2>&1 | head -20`
Expected: no errors in `DiscoverCigarsClient.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/cigars/DiscoverCigarsClient.tsx
git commit -m "feat: consolidated catalog browse — one card per line with vitola chip"
```

---

### Task 6: Detail page with size picker (mockup 04)

**Files:**
- Modify: `app/(app)/discover/cigars/[id]/CigarDetailRoute.tsx`
- Modify: `components/cigars/CigarDetailClient.tsx`
- Modify: `components/cigars/CigarActions.tsx`

**Interfaces:**
- Consumes: `fetchLineSiblings`, `keyFor.lineSiblings` (Task 4); `sizeLabel`, `sizeDims`, `SizeChild` (Task 3); existing `fetchCigarDetail`, `fetchCigarWishlisted`, `lengthLabelForInches`.
- Produces: `CigarDetailClient` props become `{ cigar: CigarDetailRow; siblings: SizeChild[] }`. `CigarActions` props become `{ cigarId: string; sizeText: string }` (wishlist flag now fetched internally per selected child; `initialIsWishlisted` prop removed).

- [ ] **Step 1: Fetch siblings in `CigarDetailRoute.tsx`**

Replace the file's data section with:

```tsx
  const { data: cigar } = useSWR(
    allowed ? keyFor.cigar(cigarId) : null,
    () => fetchCigarDetail(cigarId),
  );

  /* Size rows of this line — dependent on the cigar row (brand +
     series drive the group). Null-brand rows are their own group. */
  const { data: siblings } = useSWR(
    allowed && cigar?.brand ? keyFor.lineSiblings(cigar.brand, cigar.series) : null,
    () => fetchLineSiblings(cigar!.brand as string, cigar!.series),
  );

  if (!allowed || !session || cigar === undefined) return <CigarDetailSkeleton />;
  if (cigar === null) notFound();

  const sizeRows: SizeChild[] = cigar.brand
    ? (siblings ?? [])
    : [{ id: cigar.id, format: cigar.format, ring_gauge: cigar.ring_gauge, length_inches: cigar.length_inches, image_url: cigar.image_url }];
  if (cigar.brand && siblings === undefined) return <CigarDetailSkeleton />;

  /* key: navigating detail→detail (different cigar) must reset the
     size selection — without a remount, selectedId would go stale. */
  return <CigarDetailClient key={cigar.id} cigar={cigar} siblings={sizeRows} />;
```

Imports: add `fetchLineSiblings` and `type SizeChild` from their modules; remove `fetchCigarWishlisted` and the `isWishlisted` SWR block (moves into `CigarActions`); remove the `userId` const if now unused.

- [ ] **Step 2: Rework `CigarDetailClient.tsx`**

Props and state:

```tsx
interface Props {
  cigar:    CigarDetailRow;
  siblings: SizeChild[];
}

export function CigarDetailClient({ cigar: c, siblings }: Props) {
  /* Tapped child preselected (humidor deep links keep working). */
  const [selectedId, setSelectedId] = useState(c.id);
  const selected =
    siblings.find((s) => s.id === selectedId) ??
    ({ id: c.id, format: c.format, ring_gauge: c.ring_gauge, length_inches: c.length_inches, image_url: c.image_url } as SizeChild);
```

Changes to the render (keep back link, hero layout, dividers, reviews section as-is):

1. **Details grid** — blend-only. Remove the Format / Ring Gauge / Length entries from the `details` array (they live in the size rows now). Keep Wrapper, Shade, Wrapper Country, Binder Country, Filler Countries.
2. **Hero image** — first non-null among selected child, then any sibling, then wrapper default:

```tsx
  const heroImage = selected.image_url ?? c.image_url ?? siblings.find((s) => s.image_url)?.image_url ?? null;
```

Pass `imageUrl={heroImage}` to the hero `CigarImage`.
3. **Size picker** — insert between the Details section and the actions:

```tsx
      <Divider className="my-6" />

      <section className="space-y-3 animate-slide-up">
        <h2>Choose a size</h2>
        <div role="radiogroup" aria-label="Choose a size" className="space-y-2">
          {siblings.map((s) => {
            const sel = s.id === selectedId;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={sel}
                onClick={() => setSelectedId(s.id)}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-colors duration-150"
                style={{
                  backgroundColor: sel ? "rgba(212,160,74,0.07)" : "var(--card)",
                  border: `1px solid ${sel ? "var(--gold, #D4A04A)" : "var(--border)"}`,
                }}
              >
                <span
                  aria-hidden="true"
                  className="flex-shrink-0 rounded-full"
                  style={{
                    width: 17, height: 17,
                    border: `1.5px solid ${sel ? "var(--gold, #D4A04A)" : "var(--muted-foreground)"}`,
                    backgroundColor: "transparent",
                    boxShadow: sel ? "inset 0 0 0 3.5px var(--background), inset 0 0 0 12px var(--gold, #D4A04A)" : "none",
                  }}
                />
                <span className="flex-1 text-sm font-medium text-foreground">
                  {s.format ?? "Original size"}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {sizeDims(s)}
                </span>
              </button>
            );
          })}
        </div>
      </section>
```

4. **Actions** — both the desktop (in-hero) and mobile action slots become:

```tsx
<CigarActions cigarId={selected.id} sizeText={sizeLabel(selected)} />
```

5. **Suggest an edit** — acts on the SELECTED child (blend from the line-shared fields, size from the selection), with the mockup's hint line under it:

```tsx
      <section className="sm:max-w-xs space-y-2">
        <CigarEditSuggestButton
          cigar={{
            id:               selected.id,
            brand:            c.brand,
            series:           c.series,
            format:           selected.format,
            ring_gauge:       selected.ring_gauge,
            length_inches:    selected.length_inches,
            shade:            c.shade,
            wrapper:          c.wrapper,
            wrapper_country:  c.wrapper_country,
            binder_country:   c.binder_country,
            filler_countries: c.filler_countries,
          }}
          hasPending={hasPendingEdit}
        />
        <p className="text-[11px] text-center text-muted-foreground">
          Applies to the selected vitola
        </p>
      </section>
```

The pending-edit SWR key becomes per-selected-child: `keyFor.cigarPendingEdit(userId, selectedId)` with fetcher `() => fetchCigarPendingEdit(selectedId)`.

6. **Header** — `<h1>` stays `{c.series ?? c.format}`; remove the standalone `{c.format && <p>…</p>}` line under it (format now lives in the size rows).

Imports: add `useState`, `sizeDims`, `sizeLabel`, `type SizeChild`.

- [ ] **Step 3: Rework `CigarActions.tsx` to be selection-aware**

Replace props and the wishlist seed:

```tsx
interface CigarActionsProps {
  cigarId:  string;   // the SELECTED size (child id)
  sizeText: string;   // e.g. 'Perfecto 50 × 4"' — CTA label suffix
}
```

- Internal wishlist flag via SWR (replaces the `initialIsWishlisted` prop):

```tsx
  const { ready, session } = useAppSession();
  const userId = ready && session ? session.userId : null;
  const { data: isWishlisted = false, mutate: mutateWishlisted } = useSWR(
    userId ? keyFor.cigarWishlisted(userId, cigarId) : null,
    () => fetchCigarWishlisted(userId as string, cigarId),
  );
```

`toggleWishlist` keeps its optimistic pattern but through the SWR cache: `mutateWishlisted(!prev, { revalidate: false })` up front, `mutateWishlisted(prev, { revalidate: false })` on error, `void mutateWishlisted()` at the end alongside the existing `revalidateHumidor(user.id)`.
- Button labels carry the selection (no em dashes):

```tsx
        <button type="button" className="btn btn-primary w-full" onClick={() => setSheetOpen(true)}>
          Add to Humidor · {sizeText}
        </button>
        <button type="button" onClick={toggleWishlist} disabled={wishlistLoading} className={...unchanged...}>
          {isWishlisted ? "On Wishlist ✓" : `Add to Wishlist · ${sizeText}`}
        </button>
```

- Imports: add `useSWR`, `keyFor`, `fetchCigarWishlisted`, `useAppSession`; drop the now-unused `useState` for `isWishlisted` only (keep it for `sheetOpen`, `toast`, `wishlistLoading`).
- `AddToHumidorSheet cigarId={cigarId}` unchanged — switching size while the sheet is closed retargets it naturally.

- [ ] **Step 4: Type-check and run unit tests**

Run: `npx tsc --noEmit --pretty false 2>&1 | head -20 && npm run test:unit`
Expected: clean; all PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/discover/cigars/[id]/CigarDetailRoute.tsx" components/cigars/CigarDetailClient.tsx components/cigars/CigarActions.tsx
git commit -m "feat: line detail — shared blend grid, size picker, selection-aware actions"
```

---

### Task 7: Manual-add duplicate check (mockup 06)

**Files:**
- Create: `components/cigars/DupeCheckDialog.tsx`
- Modify: `components/humidor/AddCigarSheet.tsx`
- Modify: `components/humidor/WishlistClient.tsx` (same manual form — same dupe check; Path A adds the existing child to the wishlist)
- Modify: call sites of `AddCigarSheet`'s `onAdded` (grep `onAdded=` — `HumidorClient.tsx`) to accept an optional message.

**Interfaces:**
- Consumes: `matchCigarLines`, `LineMatch` (Task 4); `findMatchingSize`, `sizeDims`, `SizeChild`, `EnteredSize` (Task 3); existing `cigarDetailsToRpcArgs`, `addHumidorItem`.
- Produces: `DupeCheckDialog` component; `AddCigarSheetProps.onAdded` becomes `(message?: string) => void`.

- [ ] **Step 1: Create `components/cigars/DupeCheckDialog.tsx`**

```tsx
"use client";

/*
 * Manual-add duplicate interstitial (mockup 06 step 3). Fires only
 * when match_cigar_lines returns a close match; never blocks
 * creation. Renders as a centered modal above the add sheet.
 */

import { useEffect } from "react";
import type { LineMatch } from "@/lib/data/cigar-fetchers";
import type { SizeChild } from "@/lib/cigars/line-group";
import { sizeDims } from "@/lib/cigars/line-group";

interface DupeCheckDialogProps {
  match:        LineMatch;
  matchedChild: SizeChild | null;   // pre-highlighted "your size"
  busy:         boolean;
  onUseExisting: (child: SizeChild) => void;  // Path A
  onAddSize:     () => void;                  // Path B
  onCreateNew:   () => void;                  // Path C
  onCancel:      () => void;                  // scrim/Escape: back to the form
}

export function DupeCheckDialog({
  match, matchedChild, busy,
  onUseExisting, onAddSize, onCreateNew, onCancel,
}: DupeCheckDialogProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const meta = [match.line.wrapper, match.line.shade, match.line.wrapper_country]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Possible duplicate cigar">
      <div className="absolute inset-0 bg-black/65" onClick={busy ? undefined : onCancel} />
      <div
        className="absolute left-4 right-4 top-1/2 -translate-y-1/2 rounded-2xl p-5 overflow-y-auto sm:max-w-md sm:mx-auto"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", maxHeight: "86%" }}
      >
        <h3 className="text-lg font-bold text-foreground mb-1" style={{ fontFamily: "var(--font-serif)" }}>
          Is this the same cigar?
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
          A close match is already in the catalog. Using it keeps every member&apos;s reviews and stats connected.
        </p>

        <div className="rounded-xl p-3.5" style={{ backgroundColor: "var(--background)", border: "1px solid rgba(212,160,74,0.35)" }}>
          <p className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground">{match.line.brand}</p>
          <p className="text-base text-foreground" style={{ fontFamily: "var(--font-serif)" }}>
            {match.line.series ?? match.line.brand}
          </p>
          {meta && <p className="text-[11px] text-muted-foreground">{meta}</p>}
          <div className="mt-2.5 space-y-1.5">
            {match.children.map((s) => {
              const yours = s.id === matchedChild?.id;
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-[13px]"
                  style={{
                    border: `1px solid ${yours ? "var(--gold, #D4A04A)" : "var(--border)"}`,
                    backgroundColor: yours ? "rgba(212,160,74,0.07)" : "transparent",
                  }}
                >
                  <span className="text-foreground">{s.format ?? "Original size"}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground tabular-nums">{sizeDims(s)}</span>
                    {yours && (
                      <span className="text-[9px] tracking-wider uppercase" style={{ color: "var(--gold, #D4A04A)" }}>
                        your size
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {matchedChild && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onUseExisting(matchedChild)}
            className="btn btn-primary w-full mt-3 disabled:opacity-40"
          >
            Yes, add the {matchedChild.format ?? "matching size"}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onAddSize}
          className="btn btn-secondary w-full mt-2 disabled:opacity-40"
        >
          Same cigar, but my size isn&apos;t listed
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCreateNew}
          className="w-full mt-2 py-2.5 text-sm text-muted-foreground disabled:opacity-40"
        >
          No, mine is different. Create a new listing
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the check into `AddCigarSheet.tsx`**

1. Imports:

```tsx
import { matchCigarLines, type LineMatch } from "@/lib/data/cigar-fetchers";
import { findMatchingSize, type SizeChild } from "@/lib/cigars/line-group";
import { DupeCheckDialog } from "@/components/cigars/DupeCheckDialog";
```

2. Props: `onAdded: (message?: string) => void;` (update the `AddCigarSheetProps` interface and its JSDoc if any).
3. State, next to submit state:

```tsx
  const [dupe, setDupe] = useState<{ match: LineMatch; matchedChild: SizeChild | null } | null>(null);
```

Reset `setDupe(null)` in the open-reset effect.
4. Split `handleSubmit`. Extract the humidor-insert half (everything from `const { data: { user } }` through `clearCigarDraft`/`onAdded`/`onClose`) into:

```tsx
  /* Second phase: humidor insert + bookkeeping for a resolved
     catalog row. `suggest` controls the community-review row
     (false when attaching to an existing listing — Path A). */
  async function finishInsert(cigarId: string, opts: { suggest: boolean; bumpUsage?: CatalogResult | null; message?: string }) {
    ...existing body, with:
    - usage bump only when opts.bumpUsage is set (the selected-cigar path)
    - the cigar_catalog_suggestions insert gated on
      `isManual && submitToCatalog && opts.suggest`
    - `onAdded(opts.message)` instead of `onAdded()`
  }
```

`handleSubmit` becomes:

```tsx
  async function handleSubmit() {
    const brand = isManual ? manual.brand.trim() : (selected?.brand ?? "Unknown");
    if (!brand) { setSubmitError("Brand is required."); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (selected) {
        await finishInsert(selected.id, { suggest: false, bumpUsage: selected });
        return;
      }
      /* Manual path: fuzzy-match BEFORE any insert. null = no match
         or RPC missing — straight save, zero added friction. */
      const match = await matchCigarLines(brand, manual.series.trim() || null).catch(() => null);
      if (match && match.children.length > 0) {
        setDupe({
          match,
          matchedChild: findMatchingSize(match.children, {
            format:       manual.format,
            ringGauge:    manual.ringGauge    ? Number(manual.ringGauge)    : null,
            lengthInches: manual.lengthInches ? Number(manual.lengthInches) : null,
          }),
        });
        return; // interstitial takes over; submitting reset in finally
      }
      await createListingAndFinish(manual.brand.trim(), manual.series.trim() || null);
    } catch (err) {
      console.error("AddCigarSheet submit error:", err);
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  /* Insert RPC + finish. Passing explicit brand/series lets Path B
     use the MATCHED LINE's exact strings (typo never enters the
     catalog); the v2 RPC copies blend from the line on attach. */
  async function createListingAndFinish(brand: string, series: string | null, message?: string) {
    const supabase = createClient();
    const args = { ...cigarDetailsToRpcArgs(manual), p_brand: brand, p_series: series };
    const { data, error: rpcErr } = await supabase.rpc("insert_cigar_to_catalog", args);
    if (rpcErr || !data) {
      setSubmitError(rpcErr?.message ?? "Failed to save cigar to catalog.");
      return;
    }
    await finishInsert(data as string, { suggest: true, message });
  }
```

5. Interstitial handlers + render (inside the returned fragment, after `UpgradeLimitModal`):

```tsx
      {dupe && (
        <DupeCheckDialog
          match={dupe.match}
          matchedChild={dupe.matchedChild}
          busy={submitting}
          onCancel={() => setDupe(null)}
          onUseExisting={async (child) => {
            setSubmitting(true);
            try {
              await finishInsert(child.id, {
                suggest: false,
                message: "Added to your humidor. Linked to the existing catalog listing.",
              });
              setDupe(null);
            } finally { setSubmitting(false); }
          }}
          onAddSize={async () => {
            setSubmitting(true);
            try {
              await createListingAndFinish(
                dupe.match.line.brand,
                dupe.match.line.series,
                "Added to your humidor. Your size joined the existing listing.",
              );
              setDupe(null);
            } finally { setSubmitting(false); }
          }}
          onCreateNew={async () => {
            setSubmitting(true);
            try {
              await createListingAndFinish(
                manual.brand.trim(),
                manual.series.trim() || null,
                "Added to your humidor. New catalog listing created, pending review.",
              );
              setDupe(null);
            } finally { setSubmitting(false); }
          }}
        />
      )}
```

(Toast copy above is the approved mockup copy with em dashes removed — Global Constraints.)

- [ ] **Step 3: Parent call sites accept the message**

Grep: `grep -rn "onAdded" components app --include="*.tsx"`. In `HumidorClient.tsx` (and any other `AddCigarSheet` parent), change the handler to:

```tsx
onAdded={(message?: string) => { /* existing refresh logic */ setToast(message ?? "Added to your humidor!"); }}
```

matching whatever the existing toast/refresh body is — only the message default changes.

- [ ] **Step 4: Wire the same check into `WishlistClient.tsx`**

`WishlistClient` has its own manual form + `insert_cigar_to_catalog` call (~line 180). Apply the same pattern: match before insert, `DupeCheckDialog` with the three paths, Path A inserts the wishlist row against the existing child id, Paths B/C call the RPC (Path B with the matched line's brand/series) then insert the wishlist row. Wishlist toast copy: "Added to your wishlist. Linked to the existing catalog listing." / "Added to your wishlist. Your size joined the existing listing." / "Added to your wishlist. New catalog listing created, pending review." Reuse the exact state/handler shape from Step 2 (rename `finishInsert` to fit the wishlist insert body already in that file).

- [ ] **Step 5: Type-check and run unit tests**

Run: `npx tsc --noEmit --pretty false 2>&1 | head -20 && npm run test:unit`
Expected: clean; PASS.

- [ ] **Step 6: Commit**

```bash
git add components/cigars/DupeCheckDialog.tsx components/humidor/AddCigarSheet.tsx components/humidor/WishlistClient.tsx components/humidor/HumidorClient.tsx
git commit -m "feat: manual-add duplicate check — match interstitial with three outcomes"
```

---

### Task 8: Admin edit-approval routes blend fields to the line

**Files:**
- Modify: `app/api/admin/cigar-edit-suggestions/[id]/route.ts`
- Modify: `components/admin/CigarEditReviewModal.tsx`

**Interfaces:**
- Consumes: DB objects from Task 2 (`cigar_lines`, `cigar_catalog.line_id`, sync trigger). Must degrade to today's child-only patch when `line_id` doesn't exist yet.
- Produces: no API shape change (`PATCH` body/status codes unchanged, plus a 409 for line-rename collisions).

- [ ] **Step 1: Split the approve patch in `route.ts`**

Replace the approve block (step 5 in the file) with:

```ts
  // 5. On approve, apply the diff — line-owned fields go to
  //    cigar_lines (the sync trigger propagates to every size);
  //    size fields patch the child row. Falls back to child-only
  //    patching when the line migration hasn't been applied.
  if (body.action === "approve") {
    const raw = suggestion.suggested as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (ALLOWED_FIELDS.has(k)) patch[k] = v;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Suggestion contains no applicable fields" }, { status: 422 });
    }

    /* Line linkage — tolerate a missing column (migration pending). */
    let lineId: string | null = null;
    const { data: childRow, error: lineReadErr } = await admin
      .from("cigar_catalog")
      .select("line_id")
      .eq("id", suggestion.cigar_id)
      .maybeSingle();
    if (!lineReadErr && childRow) lineId = (childRow as { line_id: string | null }).line_id;

    const LINE_FIELDS = new Set([
      "brand", "series", "wrapper", "shade",
      "wrapper_country", "binder_country", "filler_countries",
    ]);
    const linePatch:  Record<string, unknown> = {};
    const childPatch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      (lineId && LINE_FIELDS.has(k) ? linePatch : childPatch)[k] = v;
    }

    if (lineId && Object.keys(linePatch).length > 0) {
      const { error: lineErr } = await admin
        .from("cigar_lines")
        .update(linePatch)
        .eq("id", lineId);
      if (lineErr) {
        const conflict = lineErr.code === "23505";
        return NextResponse.json(
          { error: conflict
              ? "That brand and series already exist as another line. Merge via the audit workflow instead."
              : "Failed to apply line fields" },
          { status: conflict ? 409 : 500 },
        );
      }
    }

    if (Object.keys(childPatch).length > 0) {
      const { error: updateErr } = await admin
        .from("cigar_catalog")
        .update(childPatch)
        .eq("id", suggestion.cigar_id);
      if (updateErr) {
        return NextResponse.json({ error: "Failed to apply suggestion" }, { status: 500 });
      }
    }
```

(The remainder of the handler — marking the suggestion approved, revalidateTag, response — stays untouched.)

- [ ] **Step 2: Add the line-wide note to `CigarEditReviewModal.tsx`**

Read the modal first. Where the changed-fields diff renders, add one conditional line above the Approve/Reject buttons:

```tsx
{["brand", "series", "wrapper", "shade", "wrapper_country", "binder_country", "filler_countries"]
  .some((f) => f in suggestedFields) && (
  <p className="text-[11px] text-muted-foreground">
    Brand, series and blend changes apply to every size of this cigar.
  </p>
)}
```

adapting `suggestedFields` to the modal's actual diff variable name.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit --pretty false 2>&1 | head -20`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "app/api/admin/cigar-edit-suggestions/[id]/route.ts" components/admin/CigarEditReviewModal.tsx
git commit -m "feat: admin edit approval routes line fields to cigar_lines (trigger fans out)"
```

---

### Task 9: Series-pollution audit script + report

**Files:**
- Create: `scripts/audit-catalog-lines.ts`
- Create (generated): `docs/reports/2026-09-06-catalog-lines-audit.md`

**Interfaces:**
- Consumes: `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` from `.env.local` (same pattern as `scripts/seed-cigar-catalog.ts` — read that file first and mirror its client setup/run invocation, e.g. `npx tsx scripts/audit-catalog-lines.ts`).
- Produces: a markdown report; NOTHING runs automatically — every entry ships proposed action + ready-to-run per-entry SQL + verify queries for Dave's one-by-one approval.

- [ ] **Step 1: Write the script**

`scripts/audit-catalog-lines.ts` — read-only against the DB. Structure:

```ts
/*
 * Catalog line audit — read-only. Produces the merge-candidate
 * report the spec's Feature 4 calls for. Run: npx tsx scripts/audit-catalog-lines.ts
 */
```

1. Fetch all rows: `id, brand, series, format, ring_gauge, length_inches, wrapper, shade, wrapper_country, binder_country, filler_countries, usage_count` (paginate by 1000 via `.range()` until short page).
2. Group in JS by `brand + " " + (series ?? "")`.
3. **Section A — prefix/superset series:** for each brand, pairs of distinct series where `a.toLowerCase().startsWith(b.toLowerCase() + " ")` (one is a word-prefix of the other) — classic vitola-in-series pollution ("Hemingway" vs "Hemingway Short Story").
4. **Section B — trigram near-matches ≥ 0.87:** implement trigram similarity locally (pad with two spaces, 3-grams, `|A∩B| / |A∪B|` — mirror Postgres semantics closely enough for a report) over `brand + ' ' + series` strings within the same brand.
5. **Section C — blend-conflict groups:** groups whose children disagree on any of wrapper/shade/wrapper_country/binder_country/filler_countries (stringify-compare). These are the backfill's untouched-copy groups.
6. **Section D — data health (spec open item 2):** counts of children with null `format`, null `ring_gauge`, null `length_inches`, null `brand`; total rows; total groups.
7. For every A/B entry emit: the two groups with child counts + sample sizes, a proposed action ("merge into X" when one side is an obvious vitola-polluted variant; otherwise "leave distinct"), and ready-to-run SQL:

```sql
-- Merge '<BRAND> / <SERIES-B>' into '<BRAND> / <SERIES-A>'
update cigar_catalog set
  line_id = (select id from cigar_lines where brand = '<BRAND>' and coalesce(series,'') = '<SERIES-A>'),
  series  = '<SERIES-A>'
where brand = '<BRAND>' and coalesce(series, '') = '<SERIES-B>';
delete from cigar_lines
where brand = '<BRAND>' and coalesce(series, '') = '<SERIES-B>'
  and not exists (select 1 from cigar_catalog c where c.line_id = cigar_lines.id);
-- Verify:
-- select count(*) from cigar_catalog where brand = '<BRAND>' and coalesce(series,'') = '<SERIES-B>';  -- 0
-- select count(*) from humidor_items;  -- unchanged
```

with single quotes SQL-escaped (`''`). Note in the report header that these merges are edit-in-place (`line_id` repoint + series text fix): child ids never change, so humidor items are untouched.
8. Write the markdown to `docs/reports/2026-09-06-catalog-lines-audit.md` (create `docs/reports/` if needed).

Keep the script under 400 lines; extract `trigramSimilarity(a, b)` as a small pure function at the top.

- [ ] **Step 2: Run it and commit the generated report**

Run: `npx tsx scripts/audit-catalog-lines.ts`
Expected: report file written; console summary like `A: N prefix pairs, B: M near-matches, C: K conflicts, D: format nulls…`. This runs against prod data read-only — safe. If env/creds are unavailable in this session, commit the script alone and add "run audit script" to the PR's pre-merge checklist.

- [ ] **Step 3: Commit**

```bash
git add scripts/audit-catalog-lines.ts docs/reports/
git commit -m "feat: catalog-lines audit script + merge-candidate report (read-only, per-entry SQL)"
```

---

### Task 10: Full verification + PR

**Files:** none new.

- [ ] **Step 1: Unit + type + lint gates**

Run: `npm run test:unit && npx tsc --noEmit --pretty false 2>&1 | tail -3`
Expected: all tests PASS; no NEW type errors vs main.

- [ ] **Step 2: Build + shells gate**

Run: `npm run build && npm run check:shells`
Expected: build succeeds; `/discover/cigars` still prerenders static (`○`); shells check green.

- [ ] **Step 3: Runtime verification (verify-in-app skill)**

Use the `verify-in-app` project skill (`scripts/verify-in-app.mjs`) against a local dev server. Journeys:
1. Catalog browse → line card (vitola chip visible when RPC applied, hidden in fallback) → detail → size select flips CTA labels → Add to Humidor for the selected size.
2. Manual add: (a) no-match brand → straight save; (b) near-match typo → interstitial with pre-highlighted size → all three paths; (c) cancel via scrim returns to the form intact.
3. Discover tabs visible and below the top bar on `/discover/cigar-news`, `/discover/channels`, `/discover/vendors`; absent on `/discover/cigars` and a `/discover/cigars/[id]`.
4. Admin edit review shows the line-wide note.
Console: zero errors; network: zero 5xx. NOTE: the local DB is prod Supabase — migrations 1–2 may not be applied yet; verify the FALLBACK behaviors explicitly (ungrouped browse, skipped dupe check) and, if Dave has applied the SQL, the grouped behaviors too.

- [ ] **Step 4: Push + PR**

Pre-push gate: `gh pr list --head feat/catalog-lines --state all` (must be empty or OPEN).

```bash
git push -u origin feat/catalog-lines
gh pr create --title "feat: catalog lines — consolidated browse, size picker, dupe prevention, discover tab fix" --body "<summary per repo conventions>"
```

PR body must include: (1) the migration apply-order gate for Dave (1–2 before deploy; 3–6 before features activate; copy-paste SQL blocks are handed over in chat per the manual-SQL memory rule), (2) the spec deviation on conflict-group backfill, (3) the two mockup deltas (no card action buttons; toasts instead of success screen), (4) test plan with the verify-in-app journeys above.

- [ ] **Step 5: Hand Dave the SQL**

In chat (not just the PR), paste each migration as its own copy-paste block with its verify queries, in apply order, flagged as a pre-deploy gate. (Memory rule: manual SQL is always pasted in chat with a copy button.)
