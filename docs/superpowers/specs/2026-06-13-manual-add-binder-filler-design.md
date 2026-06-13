# Unify cigar detail capture — manual add gains binder + filler

**Date:** 2026-06-13
**Status:** Approved (design)
**Branch:** `feat/manual-add-binder-filler`

## Problem

The "update cigar" flow (`SuggestCigarEditSheet`) captures 10 detail fields, including
**Binder Country** and **Filler Countries**. The manual "add cigar" flow
(`AddCigarSheet`) captures only 8 — it never asks for binder or filler, even though the
cigar detail page displays them and the `cigar_catalog` table stores them.

A third surface, `WishlistClient`, has its own copy of the manual-add form and has
already drifted: it is missing the Shade field that `AddCigarSheet` has.

Three hand-maintained copies of the same form means the "add" and "update" experiences
differ and will keep diverging.

## Goal

Make the detail-capture experience identical across all three flows by extracting one
shared, controlled form component, and persist binder + filler from the manual-add paths.

Out of scope: redesigning the taxonomy, changing the admin review surfaces, altering the
edit-suggestion diff/approval mechanics, or touching the catalog-search (non-manual) path.

## Decisions (from brainstorming)

1. **Extract one shared form** used by all three sheets (not copy-paste). Guarantees the
   flows stay identical.
2. **Name-only labels everywhere.** Dropdowns render the option name without the
   `— description` hint. This matches the edit sheet today; the Add sheet loses its
   current descriptions on Shade / Wrapper / Wrapper Country.

## Architecture

### New component: `components/cigars/CigarDetailFields.tsx`

A controlled presentational component. Owns no submit logic.

```ts
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

interface Props {
  value:    CigarDetails;
  onChange: (next: CigarDetails) => void;
}
```

Field rendering (top to bottom):

| Field | Control | Options | Notes |
|---|---|---|---|
| Brand | text input | free text | required at submit (enforced by host sheet) |
| Series / Name | text input | free text | |
| Format | select | `FORMATS` | name only |
| Ring Gauge | select | `RING_GAUGES` | name only |
| Length | select | `LENGTHS` | label shown, `inches` stored |
| Shade | select | `SHADES` | name only |
| Wrapper | select | `WRAPPERS` | name only |
| Wrapper Country | select | `WRAPPER_COUNTRIES` | name only |
| Binder Country | select | `WRAPPER_COUNTRIES` | name only |
| Filler Countries | pill multi-select | `WRAPPER_COUNTRIES` | toggle in/out, append-on-tap order |

Styling follows the existing sheet conventions (`input` class, `minHeight: 48`, two-column
grid with full-width spans for text + wrapper rows). The component is a presentational
unit: it can be understood and tested without any host sheet, and its only dependency is
`@/lib/cigar-taxonomy`.

### Consumers

All three switch to `<CigarDetailFields>` for the manual detail block. Each keeps its own
state container and submit logic.

- **`AddCigarSheet`** — manual state becomes a `CigarDetails`. `handleSubmit` extends the
  `insert_cigar_to_catalog` RPC call and the `cigar_catalog_suggestions` insert with
  `binderCountry` + `fillerCountries`. Gains binder + filler.
- **`WishlistClient`** — same change. Gains binder + filler **and** Shade (closing the
  existing drift).
- **`SuggestCigarEditSheet`** — renders `<CigarDetailFields>`; keeps its
  snapshot/diff/POST-the-diff logic unchanged. Its `FormState` maps to `CigarDetails`
  (rename only; field set is already identical).

## Data flow

Manual add (both Add and Wishlist sheets):

```
CigarDetailFields (controlled)
  → host sheet state (CigarDetails)
  → handleSubmit
      → rpc insert_cigar_to_catalog(p_..., p_binder_country, p_filler_countries)  → cigar_catalog row
      → (if "submit to catalog" checked) insert cigar_catalog_suggestions(..., binder_country, filler_countries)
      → addHumidorItem / wishlist insert (unchanged)
```

Update flow (unchanged mechanics):

```
CigarDetailFields → FormState/CigarDetails → diff vs snapshot → POST /api/cigar-edit-suggestions
  → admin approve → cigar_catalog update (binder_country, filler_countries already whitelisted)
```

## Database migration

One file: `supabase/migrations/20260613_cigar_binder_filler_manual_add.sql`. Run manually
in the Supabase SQL editor (per the project's migration-drift history — migrations are not
auto-applied).

1. **`cigar_catalog_suggestions`** — add the two columns:
   ```sql
   alter table cigar_catalog_suggestions
     add column if not exists binder_country   text,
     add column if not exists filler_countries text[];
   ```
2. **`insert_cigar_to_catalog`** — `create or replace` with two new params,
   `p_binder_country text default null` and `p_filler_countries text[] default null`,
   inserting both into the existing `cigar_catalog.binder_country` /
   `cigar_catalog.filler_countries` columns. Preserves all existing params and behavior.

`cigar_catalog` itself needs no change — both columns exist and are already written by the
edit-approve path (`app/api/admin/cigar-edit-suggestions/[id]/route.ts`).

**Ordering:** migration must be applied before the UI ships, or the RPC call fails on the
unknown parameters.

## Error handling

- Brand-required validation stays in each host sheet (unchanged).
- RPC failure surfaces the existing `setSubmitError` path.
- Empty selects persist as `null`; empty filler array persists as `null` (matches the edit
  flow's `toJsonbShape`).

## Testing

- **Unit (`CigarDetailFields`):** renders all 10 fields; selecting a value fires `onChange`
  with the right key; toggling filler pills adds/removes and **preserves tap order**;
  toggling an active pill removes it.
- **Manual verification:** add a custom cigar with a binder country and 2+ filler
  countries (in a deliberate order); confirm it saves and the cigar detail page shows
  binder + filler in that order. Repeat from the Wishlist add sheet. Confirm the edit sheet
  still submits a correct diff.

## Risks

- **Migration drift** (known recurring issue): if the SQL is not run, the manual-add RPC
  call breaks. Mitigation: ship the migration file, call it out explicitly, verify in the
  Supabase SQL editor before/at deploy.
- **Three-file refactor:** swapping all three sheets to the shared component is the bulk of
  the diff. Mitigation: the component is purely presentational and controlled, so each
  host's submit logic is untouched except for the two added fields.
```
