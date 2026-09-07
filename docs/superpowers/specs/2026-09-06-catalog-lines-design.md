# Cigar Lines: Catalog Consolidation, Duplicate Prevention, Discover Tab Fix — Design

**Date:** 2026-09-06
**Status:** APPROVED. Build runs in a fresh session as ONE PR.
**Mockups (all reviewed and approved by Dave):**
- `mockups/mobile-nav/04-catalog-consolidated.html` — grouped browse + detail with size picker (corrected to real schema: full details grid; size rows = Format + ring × length; no vitola-name field exists)
- `mockups/mobile-nav/05-manual-add-dupe-check.html` — early dupe-check concept (superseded by 06 for exact flow)
- `mockups/mobile-nav/06-manual-add-flow.html` — exact manual-add walkthrough: search-first → real form → duplicate check with size pre-highlight → three outcomes

## Goals

1. **Fix the #607 regression**: the Discover sub-nav (Channels / Industry News / Vendors) is hidden under the mobile top bar.
2. **Consolidate the catalog**: one entry per cigar line (brand + series); user picks the size (format + ring + length). 4,221 rows → ~1,717 line entries (audit-verified on seed data; zero blend-field conflicts inside any group).
3. **Prevent duplicates at the source**: manual adds fuzzy-match existing lines; near-matches get a confirm step; creation is never blocked.
4. **Audit deliverable**: report of polluted series (vitola names embedded in the series label) as merge candidates for Dave's per-entry approval. No automated merging — the 59 seed "near-dupes" are mostly legitimately distinct (Serie G vs Serie V, year editions).

## Data model (Dave's parent-child structure, staged safely)

### Why staged, not full restructure now

`cigar_catalog` already IS the child table (one row per size). Stripping blend columns off it now would break `search_text` — a Postgres GENERATED column computing from same-row brand/series/format; generated columns cannot reference another table — forcing a search re-architecture, plus 12+ read sites, RPCs, and RLS across a hand-applied prod migration. Instead: add the parent, make it the single WRITE authority, keep child copies as a database-maintained cache, and record full normalization as a later cleanup.

### New table: `cigar_lines` (parent — the shared DNA, written once)

- `id uuid pk`, `brand text not null`, `series text` (null = brand-only line)
- Blend: `wrapper`, `shade`, `wrapper_country`, `binder_country`, `filler_countries text[]`
- `community_added boolean`, `approved boolean` (mirror child semantics), `created_at`
- Unique index on `(brand, coalesce(series,''))`
- RLS: authenticated read; writes via RPCs/admin only. Anon: no access (matches catalog hardening).

### Child link: `cigar_catalog.line_id uuid references cigar_lines(id) on delete restrict`

- Child rows keep every existing column and their IDs FOREVER. `humidor_items`, `smoke_logs`, edit suggestions, image submissions all keep pointing at `cigar_catalog.id` untouched. Loss of humidor cigars is structurally impossible: all operations are additive (backfill stamps `line_id`) or edit-in-place (merges repoint `line_id` + fix series text; IDs never change). Existing FK already blocks deleting any referenced child; `on delete restrict` blocks deleting a line that still has children.

### Sync contract (the invariant, enforced by the database)

- `cigar_lines` is the ONLY writable home of blend fields. App/admin edits write lines.
- Trigger on `cigar_lines` UPDATE propagates blend fields to its children's copies (UPDATE only — can never delete rows or touch ids/format/ring/length). `search_text` regenerates automatically because it computes from child columns.
- Child blend columns become derived copies; direct child blend writes are disallowed at the app layer (insert RPC populates them from the line at creation).
- **End state (separate future effort, not this PR):** migrate reads to line joins, then drop child blend columns.

### Backfill (one-time, manual-apply)

- Group existing rows by `(brand, coalesce(series,''))` → insert one line per group (blend values = the group's consensus) → stamp `line_id` on every row.
- Conflict guard: groups whose rows disagree on any blend field are NOT guessed — they get per-variant lines and are listed in the audit report. (Seed data: 0 conflicts; prod may differ via community adds.)
- Verify queries shipped with the SQL: catalog row count unchanged; every row has `line_id`; line count = distinct group count; zero orphans; humidor_items count unchanged.
- Rollback: drop trigger, drop `line_id` column, drop `cigar_lines` → byte-identical to today.

## Feature 1: #607 regression fix (Discover tab bar)

- `app/(app)/discover/layout.tsx` fixed sub-nav: `top: 0` → `top: var(--page-top-offset)` (the same two-variable treatment every other fixed header got in #607; this file was missed because the conversion grep excluded `layout.tsx` filenames).
- The tab bar is EXCLUDED on `/discover/cigars*`: the layout skips rendering tabs (and the TAB_BAR_H content offset) for catalog routes. Approved catalog mockups show no tabs; catalog reachability is the side sheet / rail. Field-guide and content routes keep tabs as today.

## Feature 2: Consolidated catalog (mockup 04)

- **Browse**: one card per line — brand eyebrow, series (serif), wrapper meta, gold "N sizes" chip (chip label: "N vitolas" per mockup; copy final: "N vitolas"). Search matches child rows (`search_text`, unchanged) with results grouped to lines. Brand drill-down lists the brand's lines. Brands landing counts lines, not child rows.
- **Detail**: URL stays `/discover/cigars/[id]` where id = ANY child row id. The page loads that child's line + all sibling children; renders brand + series header, full shared details grid (Wrapper, Shade, Wrapper Country, Binder Country, Filler Countries), then "Choose a size": radio rows of `Format · ring × length`, the tapped child preselected. Add to Humidor / Wishlist / Suggest an Edit act on the SELECTED child id and the button labels carry the selection ("Add to Humidor · Perfecto 50 × 4\""). Existing humidor deep links (child ids) keep working and preselect that size.
- **Back-from-detail restore** (shipped in #607) continues to work unchanged — same route shape.
- Data: new fetcher for line-grouped browse (RPC or grouped select over `line_id`), line+children detail fetch keyed off child id. `get_catalog_brands` updated to count lines per brand (ranking by member adds unchanged).
- Edit suggestions: unchanged submission (per child row). Admin approval routes blend-field changes to the LINE (trigger propagates to siblings) and size fields to the child. Admin review modal gains a one-line note showing which fields apply line-wide.

## Feature 3: Manual add duplicate check (mockup 06 — exact flow)

- Steps 1–2 unchanged: search-first; manual form with today's exact fields and order; "Your Entry" section unchanged.
- On save, BEFORE any insert: `match_cigar_lines(brand, series)` RPC — pg_trgm similarity against lines. Threshold tuned against real data at implementation (start ~0.5 similarity on brand+series concat; must catch "Gran Reserve"→"Gran Reserva"). Returns best match + its children.
- **Match found** → interstitial (exact mockup 06): line card with blend meta + size list. If the entered format/ring/length matches an existing child (format equal, ring equal, length within 1/8"), that row is pre-highlighted "your size" and the primary CTA is "Yes — add the [Format] to my humidor".
  - Path A "use existing size": humidor insert against the existing child id. Nothing created. Typo never enters the catalog.
  - Path B "my size isn't listed": insert ONE child row under the matched line (format/ring/length from the form; blend fields copied from the line, ignoring any conflicting blend the user typed — the line is authority). Then humidor insert against it.
  - Path C "create a new listing": today's behavior — insert RPC creates line + child (community_added). Never blocked.
- **No match** → straight save (line + child created), no interstitial, zero added friction.
- `insert_cigar_to_catalog` RPC v2: creates-or-attaches line, stamps `line_id`, copies blend from line on attach. Existing rate limit on the API route unchanged.

## Feature 4: Series-pollution audit (deliverable, not automation)

- Script (`scripts/audit-catalog-lines.ts`, service-role, run by Dave or with creds) producing a markdown report: (a) same-brand series where one is a prefix/superset of another, (b) trigram near-matches above 0.87, (c) backfill blend-conflict groups. Each entry: proposed action (merge into X / leave distinct) + ready-to-run per-entry SQL (repoint `line_id`, fix series text, delete empty line) + verify queries.
- Dave approves entry-by-entry; nothing runs automatically.

## SQL migrations (all manual-apply in Supabase SQL editor, pre-deploy gates, each with verify queries)

1. `cigar_lines` table + RLS + `line_id` column + FK + sync trigger.
2. Backfill + verification block.
3. `match_cigar_lines(p_brand, p_series)` RPC (trigram; authenticated only).
4. `get_catalog_brands` v3 (count lines; ranking by humidor adds unchanged).
5. `insert_cigar_to_catalog` v2 (create-or-attach line).

## Build order (single PR)

1. Discover tab-bar fix (independent, first — it's a live regression).
2. Migrations written + SQL handed to Dave (copy-paste blocks + verifies).
3. Fetchers/keys: line browse, line detail (by child id), match RPC client, brands v3.
4. Catalog browse + detail UI (mockup 04).
5. AddCigarSheet dupe-check step (mockup 06) + insert RPC v2 wiring.
6. Audit script + generated report.
7. Tests: unit (grouping helpers, size-match logic incl. 1/8" tolerance, restore still green), full suite, build + `check:shells`, `verify-in-app` journeys (catalog browse→detail→size select→add; manual add all three interstitial paths + no-match path; discover tabs visible on news/channels/vendors, absent on catalog; admin edit review).

## Out of scope

- Dropping child blend columns (recorded end-state, later effort).
- Automated merging of any existing entries.
- Admin UI for line merges (SQL-per-entry via audit report for now; UI later if volume warrants).
- Line-level images/descriptions (child image_url logic unchanged; display first non-null among children).
- Any change to burn reports, smoke logs, humidor internals.

## Open items for the build session

1. Dave applies migrations 1–2 before the UI PR deploys (3–5 before their features activate; the code must degrade gracefully if RPCs are missing: browse falls back to ungrouped list, add flow skips the dupe check).
2. Verify prod `format` population during build (seed JSON had vitola names in a dropped column; if many child rows have null format, size rows render as "ring × length" only — design already tolerates this).
3. Trigram threshold tuning against prod data.
