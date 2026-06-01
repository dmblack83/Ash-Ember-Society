# Burn Report — Per-Third Review Redesign

Date: 2026-05-31
Status: Approved design, ready for implementation plan

---

## Goal

The current Burn Report uses a 6-step wizard: Basics → Pairing → Rating → Flavor Profile → Overall → Summary. Thirds were bolted onto the Overall step as three optional textareas. That shape doesn't fit users who review *by thirds* — the cigar evolves, and the user wants to capture fresh ratings and tasting notes for each phase rather than one global judgment at the end.

This spec replaces the standalone Rating and Flavor Profile steps and reworks the Overall step's thirds section so each third becomes a full-fidelity per-phase review (notes, ratings, tasting notes, photo).

## Current state

Files of record:

- `components/humidor/BurnReport.tsx` (2,243 lines) — wizard
- `components/humidor/VerdictCard.tsx` (665 lines) — summary card
- `app/(app)/humidor/[id]/burn-report/page.tsx` — server entry
- `app/api/burn-report/route.ts` — submit endpoint
- `lib/burn-report-draft.ts` — localStorage draft persistence
- `lib/data/flavor-tags.ts` — `flavor_tags` cached fetch

Today's wizard:

1. **Basics** — smoked at, location, occasion (chip group), pairing
2. **Pairing** — pairing drink chip group, pairing notes
3. **Rating** — four 1-5 star ratings: draw, burn, construction, flavor
4. **Flavor Profile** — chip selection across 9 categories from `flavor_tags`
5. **Overall** — `overall_rating` slider (1-100, grade words Poor/Below/Average/Good/Outstanding), Enable Thirds toggle, three textareas when on, Review, Smoke Duration (minutes), Photos (up to 3)
6. **Summary** — VerdictCard preview + Edit / Share-to-Lounge actions

VerdictCard today:
- Masthead: No. N, title (brand · series), sub (format · wrapper)
- Grade row: italic numeral + grade word
- Sub-ratings strip: Draw · Burn · Build · Flavor (whole stars only)
- Photo strip (single shared list, up to 3)
- Thirds block (eyebrows + notes string only) when toggle was on and ≥1 third had text
- Pull quote: review text with author byline
- Spec strip: Duration · Pairing · Occasion

## Target state

### Top-level flow (4 steps, was 6)

1. Basics (unchanged)
2. Pairing (unchanged)
3. Overall (was step 5; now also subsumes Rating and Flavor Profile)
4. Summary (unchanged structure; VerdictCard rendering updated)

### Overall page — Thirds OFF

In this order, top to bottom:

1. **Overall Rating** — existing `overall_rating` slider, 1-100, with italic numeral + grade word (Poor / Below / Average / Good / Outstanding). Required.
2. **Enable Thirds** toggle — existing control with existing copy: "Enable Thirds" / "Break your review into phases". Off.
3. **Review** — existing textarea, placeholder *"Share your thoughts on this cigar…"*. Required.
4. **Tasting Notes** — relocated from removed Step 4. All 9 categories (Earth · Wood · Spice · Sweet · Cream · Roast · Fruit · Grass · Other) using the existing `Chip` control. Optional.
5. **Ratings** — relocated from removed Step 3. Four 1-5 star inputs: **Draw, Burn, Build, Flavor**. Required.
6. **Smoke Duration (minutes)** — existing italic-serif numeric input. Optional.
7. **Photos (up to 3)** — existing 3-slot grid with X to remove and + ADD. Optional.

### Overall page — Thirds ON

In this order, top to bottom:

1. **Overall Rating** — same control. Required.
2. **Enable Thirds** toggle — on.
3. **Three third buttons** — appear where today's three textareas appear. One button per third, full width, vertical stack:
   - Eyebrow shows today's exact label: "First Third · Beginning", "Second Third · Middle", "Final Third · End"
   - CTA right-aligned: `Begin ›` when no data saved; `Review ›` once saved
   - Small gold dot indicator on the left edge fills once that third has saved content (matches today's pattern)
   - Tap opens the per-third slide-up sheet
4. **Review** — same textarea, placeholder *"Overall recap — pull it together…"*. Required.
5. **Tasting Notes** — hidden (collected per third).
6. **Ratings** — hidden (averaged from per-third stars on submit).
7. **Smoke Duration (minutes)** — same input. Optional.
8. **Photos (up to 3)** — same 3-slot grid. Single shared list. Photos added inside per-third sheets auto-populate left-to-right in chronological order (first → second → final). User can delete (X) or add (+) directly on the Overall page up to the 3-photo cap.

### Per-Third slide-up sheet

Opens when the user taps a Begin/Review button. Pattern matches existing `AddToHumidorSheet`.

Header:
- Eyebrow (gold mono caps): today's third tag — "First Third · Beginning" / "Second Third · Middle" / "Final Third · End"
- Title (italic serif): the tag itself, no separate sub-title — matches existing wizard step header pattern
- Close X (top right) — equivalent to Cancel

Body (top to bottom):

1. **Notes** — auto-grow textarea (use existing `AutoGrowTextarea`). Today's exact placeholder per third:
   - First: "Opening notes, light, first impressions…"
   - Second: "How it's developing — flavor shifts, draw, burn…"
   - Final: "Finish, complexity, lingering notes…"
   Required.
2. **Ratings** — four 1-5 star inputs: Draw, Burn, Build, Flavor. Required.
3. **Tasting Notes** — tap-row showing selected chips preview and gold count badge:
   - Empty state: *"Add tasting notes ›"* with no count badge
   - Filled state: *"Cedar, Cream, Coffee"* (truncated with ellipsis) + gold pill `3` + chevron
   - Tapping opens the tasting-notes sub-sheet (see below)
   Optional, no cap.
4. **Photo** — single slot, optional, X to remove, + ADD when empty. On Save, adds to the shared report photo list in third order.

Action row (bottom, sticky):
- **Cancel** — discards any in-sheet edits, reverts to the third's last saved state (or to empty if never saved). Closes sheet.
- **Save** — commits in-sheet state to the in-memory form, updates the Overall button to `Review ›` with the gold dot lit. Closes sheet.

### Tasting Notes sub-sheet (opened from per-third sheet)

A second sheet over the per-third sheet.

Header:
- Title (italic serif): "Tasting Notes"
- Close X (top right) — equivalent to Done

Body:
- Sticky **Selected (N)** summary at the top: gold-bordered pill row containing every selected chip. Each chip there deselects on tap.
- Per-category sections in this order: Earth, Wood, Spice, Sweet, Cream, Roast, Fruit, Grass, Other.
- Each category header shows a gold count badge ("1 selected") when ≥1 chip in that category is selected.
- Chips use the existing `Chip` control.

Action row:
- Single full-width **Done** button — collapses the sub-sheet back to the per-third sheet. Selections persist in the per-third sheet's in-memory state (still subject to Cancel/Save on the per-third sheet).

### Validation

- **Thirds OFF**: Review required. Four Ratings required (each > 0). Score required. Photos / Tasting Notes / Smoke Duration optional.
- **Thirds ON**: Review required. Score required. All three thirds required: each must have Notes (non-empty) and all four Ratings (each > 0). Tasting Notes and per-third Photo optional. Submit blocks with a clear message ("Complete all three thirds to submit") if any third is incomplete.

### Rating averaging (thirds ON)

For each of the four dimensions (Draw, Burn, Build, Flavor):

1. Average the three thirds' 1-5 star values (e.g., draw 5 + 4 + 5 = 4.67).
2. Round UP to the nearest quarter (0.25): 4.67 → 4.75.

Stored values:
- Per-third raw values live in `burn_report_thirds` (see Data model).
- The headline (rounded-up quarter average) is denormalized onto `smoke_logs.{draw_rating,burn_rating,construction_rating,flavor_rating}` so existing read paths (VerdictCard, lists, lounge feed, stats) don't have to compute on every read.

### VerdictCard updates

- **Masthead**: unchanged. Stays `BURN REPORT · NO. N · MMM DD YYYY` exactly as today (`VerdictCard.tsx:332-336`).
- **Sub-ratings strip**: render quarter-fill stars using SVG mask + CSS `clip-path` (`inset(0 X% 0 0)`). Five 22px stars per dimension, gold fill over a faint base. Decimal value below the stars (e.g., `4.7`).
- **Per-third block** (when thirds enabled and ≥1 third saved): each third renders as
  - Eyebrow: today's exact tag ("First Third · Beginning" etc.)
  - Notes: italic serif (today's styling)
  - Tasting tag chips: small gold pills below the notes (new)
  - No per-third ratings (deliberately kept compact)
- **Photo strip**: unchanged behavior; renders the shared photo list in order.
- **Spec strip**: Duration · Pairing · Occasion (unchanged).

### BurnReportPreviewCard — no change

`BurnReportPreviewCard` (used in Humidor → Burn Reports list and the Lounge feed) stays exactly as today. The component's own header comment establishes: *"No photos, no review text, no specs, no thirds. Those live in the full view."* Quarter-fill stars and per-third data render only inside the full `VerdictCard` (opened by tapping the preview).

## Data model

Current state: a `burn_reports` table already exists as a 1:1 child of `smoke_logs` (`supabase/migrations/20260502_burn_reports_table.sql`). The thirds columns (`thirds_enabled`, `third_beginning`, `third_middle`, `third_end`) live on `burn_reports`, not on `smoke_logs`. The four star-rating columns (`draw_rating`, `burn_rating`, `construction_rating`, `flavor_rating`) and the 1-100 `overall_rating` live on `smoke_logs`.

### New table: `burn_report_thirds`

Child of `burn_reports` (one row per third — three rows per thirds-enabled report).

```
id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid()
burn_report_id       uuid          NOT NULL REFERENCES burn_reports(id) ON DELETE CASCADE
user_id              uuid          NOT NULL REFERENCES profiles(id)     ON DELETE CASCADE
third_index          smallint      NOT NULL CHECK (third_index IN (1,2,3))
notes                text          NOT NULL
draw_rating          smallint      NOT NULL CHECK (draw_rating BETWEEN 1 AND 5)
burn_rating          smallint      NOT NULL CHECK (burn_rating BETWEEN 1 AND 5)
construction_rating  smallint      NOT NULL CHECK (construction_rating BETWEEN 1 AND 5)
flavor_rating        smallint      NOT NULL CHECK (flavor_rating BETWEEN 1 AND 5)
photo_url            text          NULL
created_at           timestamptz   NOT NULL DEFAULT now()
UNIQUE (burn_report_id, third_index)
```

`user_id` is denormalized (matches the pattern on `burn_reports` itself) so RLS can filter without joining through `burn_reports`.

RLS: owner read/write/update/delete via `auth.uid() = user_id`. Mirror the four policies on `burn_reports`. Add a `_lounge_read` policy mirroring the corresponding `smoke_logs._lounge_read` rule so shared reports remain readable in the lounge feed — confirm before ship per the go-live checklist migration-drift audit.

### New join table: `burn_report_third_flavor_tags`

```
third_id       uuid  NOT NULL REFERENCES burn_report_thirds(id) ON DELETE CASCADE
flavor_tag_id  uuid  NOT NULL REFERENCES flavor_tags(id)        ON DELETE RESTRICT
PRIMARY KEY (third_id, flavor_tag_id)
```

RLS: read/write/delete to authenticated users owning the parent third (subselect on `burn_report_thirds.user_id`). Lounge read: same pattern as `burn_report_thirds`.

### Column-type migration on `smoke_logs`

`draw_rating`, `burn_rating`, `construction_rating`, `flavor_rating` change from `smallint` → `numeric(3,2)` so the averaged-and-rounded-up quarter value (e.g., 4.75) can be stored on thirds-enabled reports. Existing integer values cast cleanly.

```sql
ALTER TABLE smoke_logs
  ALTER COLUMN draw_rating         TYPE numeric(3,2) USING draw_rating::numeric(3,2),
  ALTER COLUMN burn_rating         TYPE numeric(3,2) USING burn_rating::numeric(3,2),
  ALTER COLUMN construction_rating TYPE numeric(3,2) USING construction_rating::numeric(3,2),
  ALTER COLUMN flavor_rating       TYPE numeric(3,2) USING flavor_rating::numeric(3,2);
```

Downstream type updates (TypeScript): `smoke_logs.*_rating` consumers currently typed as `number` continue to work — Supabase serializes `numeric` as JS `number`. No client changes needed beyond awareness that the value can now be fractional in thirds-enabled rows.

### Existing columns preserved on `burn_reports`

`burn_reports.thirds_enabled`, `third_beginning`, `third_middle`, `third_end` remain in place so legacy posted reports keep rendering through `VerdictCard`'s existing path. The new flow:
- Continues to set `burn_reports.thirds_enabled` accurately.
- Writes the per-third Notes text to `third_beginning` / `third_middle` / `third_end` as a denormalized read convenience (so the existing VerdictCard render path still finds the notes without a `burn_report_thirds` join when only Notes are needed).
- Additionally populates `burn_report_thirds` rows with the full per-third payload (ratings, tasting tag ids, photo URL).

Read paths needing the rich per-third data (per-third tasting chips in the new VerdictCard) join `burn_report_thirds`. Read paths needing only notes (existing VerdictCard prior to the partial-stars / chips upgrade) can keep reading the denormalized columns.

## API

The existing `POST /api/burn-report` route already performs the multi-step submit (smoke_logs insert → burn_reports child insert → humidor quantity decrement) as documented in `app/api/burn-report/route.ts:1-29`. The new `burn_report_thirds` insert and join-table inserts slot in immediately after the `burn_reports` child insert; same "log and continue" failure semantics apply (a thirds insert failure logs but does not roll back the smoke_log).

`POST /api/burn-report` payload extended:

```ts
{
  // ... existing smoke_logs fields unchanged
  thirds_enabled: boolean,
  thirds?: Array<{                       // present only when thirds_enabled === true
    index: 1 | 2 | 3,
    notes: string,
    draw_rating: number,                  // 1-5 integer
    burn_rating: number,
    construction_rating: number,
    flavor_rating: number,
    flavor_tag_ids: string[],
    photo_index?: number                  // index into the request's photo array; absent if no per-third photo
  }>
}
```

Server-side:
1. Insert `smoke_logs` row with the rounded-up quarter averages on the four rating columns (compute server-side from `thirds[]` when present).
2. Insert three `burn_report_thirds` rows.
3. Insert join rows in `burn_report_third_flavor_tags`.
4. Upload photos (existing pipeline). When a third declares `photo_index`, set its `burn_report_thirds.photo_url` to the corresponding uploaded URL; the same URL also appears in the report's shared photo list.

## Draft persistence

`lib/burn-report-draft.ts` shape extended to persist per-third in-progress data:

```ts
form.thirds: {
  1: { notes: string, draw: number, burn: number, build: number, flavor: number, flavor_tag_ids: string[] },
  2: { ... },
  3: { ... },
}
```

Per-third `File` objects can't serialize (same constraint as today's main photos). Photos dropped on draft restore — matches existing behavior. Notes/ratings/tags persist.

Legacy `third_beginning/middle/end` form keys remain readable so an in-flight draft from a previous app version continues to work; they're written as empty strings on save in the new flow.

## Edit mode

`app/(app)/humidor/burn-reports/[id]/edit/page.tsx`:

- Server fetch joins `burn_report_thirds` + `burn_report_third_flavor_tags` for the smoke_log.
- Hydrate `form.thirds` shape from the joined data.
- Per-third photo editing is deferred for now, matching today's behavior (photos read-only in edit mode). The per-third sheet's Photo slot becomes read-only when `hidePhotos=true` is in effect.

## Out of scope

- Per-third analytics dashboards (averages over time, per-third heatmaps)
- Per-third photo editing in edit mode (deferred, matches today's photo edit limitation)
- Per-third Occasion / Pairing overrides (those stay whole-report)
- In-flight verdict preview between thirds (verdict only renders at Summary step)
- AI/Vision auto-tagging from per-third photos

## Open questions

None blocking implementation. The following copy is the recommendation but can be tuned during implementation review:

- Per-third sheet title — using the eyebrow tag verbatim ("First Third · Beginning") avoids inventing new copy. Confirm during implementation if a separate title feels needed.
- Submit-blocked toast wording: "Complete all three thirds to submit." Confirm during implementation review.
- Tasting Notes tap-row empty-state copy: *"Add tasting notes ›"*.
