# Add-Cigar Flow Rebuild — Design Spec

**Date:** 2026-09-08
**Status:** Approved by Dave (sections 01, 02, 04, 05 of the mockup)
**Visual authority:** `mockups/add-cigar-flow/index.html` — the mockup is the byte-level design reference. Implementation is transcription of the approved sections plus the production deltas below, not re-design. Sections 07 (journey strip) and 08 (scanner path) are elaborations of the approved four, not separate features.

## Verdicts

| Section | Verdict |
|---|---|
| 01 Line-grouped search | **APPROVED** |
| 02 In-sheet vitola picker | **APPROVED** |
| 03 Minimal manual add | **NOT approved** — manual path keeps today's full `CigarDetailFields` form, `nameRequired`, dupe-check interstitial, draft persistence. Do not slim it. |
| 04 One-tap save, details later | **APPROVED** |
| 05 One sheet everywhere | **APPROVED** — Dave: "important to maintain a single flow regardless of the entry point" |
| 06 Browse quick-add "+" | **REJECTED — do not repropose** |

## What gets built

### 1. Line-grouped search (mockup 01)

The Add sheet's search returns catalog **lines** (brand + series + vitola-count chip + wrapper meta), not flat `cigar_catalog` rows. Default state = popular lines. Data: the same source that powers `/discover/cigars` browse (`get_catalog_lines` RPC via `fetchCatalogLines`), including its search param and its `PGRST202` fallback behavior. Single-vitola lines skip the picker: tap goes straight to the save step with the vitola resolved. "Can't find it? Add manually" persists in both the empty and populated dropdown states.

### 2. In-sheet vitola picker (mockup 02)

Tapping a multi-vitola line swaps the search for: selected-line card (brand caps, serif series, Change button) + a Choose Vitola radio list identical in structure to `CigarDetailClient`'s radiogroup (vitola name left, mono dims right, gold selected state; name falls back to format, then dims). Vitola data via `fetchLineSiblings`. CTA carries the choice: `Add <vitola> <dims>`. Dims are length-first via the shared `sizeDims`/`sizeLabel` helpers — never hand-rolled strings.

### 3. One-tap save (mockup 04)

The save step shows: Quantity stepper + (2+ humidors only) humidor picker + collapsed "Add purchase details" expander + primary CTA `Add to Humidor` (quantity-aware label as today). Expander contains: Purchase Date (default today), Price Per Cigar, Source/Retailer, Start Aging (synced to Purchase Date until either is overridden), Ready to Smoke By (`AgingTargetSelect`, default 2_weeks), Notes. Every field keeps today's default when never expanded; saving collapsed must produce exactly what today's form produces with untouched fields.

### 4. One unified sheet (mockup 05 + 08)

One component serves every entry point, opening at one of three states:

| Entry point | Opens at |
|---|---|
| Humidor tab → Add Cigar → Search Catalog | Search (state 1) |
| Band scanner match tap | Vitola picker (state 2) with a "from scan" affordance; scanner matches group to LINES (a band identifies the line, not the size) |
| Catalog detail `CigarActions`, wishlist promote | Save (state 3), vitola pre-resolved |
| Scanner no-match → "Search the catalog" | Search, prefilled with OCR best guess |
| Scanner no-match → "Add manually" | Manual form, brand prefilled when OCR found one |

The unified sheet carries BOTH previously-drifted behaviors everywhere: already-in-humidor conflict handling (today only in `AddToHumidorSheet`: add to existing entry vs new entry) and Ready to Smoke By (today only in `AddCigarSheet`). `AddToHumidorSheet` is retired; its consumers (`CigarActions`, `WishlistClient` promote, `CigarBandScanner`) move to the unified sheet. Wishlist's own add flow (`AddWishlistSheet`) keeps its notes-only shape but shares the search + picker states.

Scanner changes are scoped to the handoff: camera/OCR/scoring pipeline unchanged; its match list groups candidates by `line_id` (line card + optional lower-confidence rows + "None of these? Search instead"), and its result tap opens the unified sheet instead of `AddToHumidorSheet`.

## Production deltas vs the mockup

1. Mockup's schematic bottom nav / toast in 07 step 6: production uses the real toast system (above the nav) and real humidor list; no new components.
2. Draft persistence (`cigar-draft.ts`) and the iOS eviction restore pattern must survive the rebuild for the manual path (unchanged behavior).
3. Free-tier limit modal, usage-count bump, `ensureDefaultHumidor`, and the dupe-check interstitial keep today's wiring.
4. Search debounce (300ms) and page-size behavior follow the existing browse implementation, including "Load more".
5. All copy inside frames is final EXCEPT the toast text: reuse existing toast messages where they exist today.
6. No em dashes in any user-facing copy.

## Non-goals

- No browse-card quick-add (REJECTED 06).
- No manual-form slimming (03 not approved).
- No scanner OCR/scoring changes beyond line-grouping the presented matches.
- No visual redesign of the humidor page, chooser modal, or catalog browse.

## Bugs / data notes riding separately (not this build)

- Seed-series pollution ("Hemingway Best Seller NT" style one-vitola series) degrades line grouping — admin data-cleanup pass via the merge tools (#610/#613).
- Live search rows render dims ring-first today; the rebuild replaces those rows wholesale with length-first `sizeDims`.
