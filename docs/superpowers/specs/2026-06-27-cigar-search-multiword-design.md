# Cigar Search — Multi-Word Combination Matching

Date: 2026-06-27
Status: Approved (design)

## Problem

Cigar search matches the **entire** typed string as one substring against
`brand`, `series`, and `format` only. Typing a combination like
`Padron 1926 35` finds nothing, because no single field contains that whole
string, and physical attributes (ring gauge, length, wrapper, country,
shade) are not searchable at all.

There are two independent query paths that both do this same naive match:

- `components/cigar-search.tsx` — the search dropdown (Add sheet, Wishlist,
  band scanner).
- `lib/data/cigar-fetchers.ts` `fetchCigarPage` — the Discover browse grid
  (SWR-driven).

Both currently run `brand.ilike.%q% OR series.ilike.%q% OR format.ilike.%q%`
with `q` = the full input string.

## Goal

Type **any combination** of words and have each word narrow the results.
Every typed word must match somewhere in the row; more words = fewer
results.

Examples:
- `Padron 1926 35` → `Padron · 1926 Serie Maduro · No 35`,
  `Padron · 1926 Serie Natural · No 35`, etc.
- `Maduro 50 toro` → all Maduro Toros with a 50 ring gauge.

Out of scope for this version: typo / fuzzy tolerance (exact substrings
only), relevance ranking beyond `usage_count`, and the Discover page's
non-search filter chips.

## Matching Model

- Split the input on whitespace into **tokens**.
- Normalize each token: lowercase, escape LIKE wildcards (`%`, `_`), drop
  empties, cap the count (6 tokens) to bound query size.
- **Every token must appear as a case-insensitive substring of the row.**
  Tokens are ANDed together.
- Empty input → "Popular" view (top `usage_count`), unchanged.
- Ordering for both popular and search: `usage_count` desc, then `id` asc
  (stable pagination). Search results are currently unordered in
  `fetchCigarPage` — this normalizes them.

## Data Layer

One migration, applied in the Supabase SQL editor **and** committed under
`supabase/migrations/`:

```sql
ALTER TABLE cigar_catalog ADD COLUMN search_text text
GENERATED ALWAYS AS (
  lower(concat_ws(' ',
    brand, series, format, wrapper, wrapper_country, shade,
    ring_gauge::text, length_inches::text))
) STORED;
```

- All expression parts (`lower`, `concat_ws`, `::text`) are immutable, so a
  `STORED` generated column is valid and auto-updates whenever any source
  column changes — no trigger, no data drift.
- Searchable field set = the 8 columns the app already selects
  (`CATALOG_SELECT`). The previously-dropped, unused `name` column is
  intentionally excluded (parity with current behavior); revisit later if
  needed.

Index (future-proofing — optional at current scale):

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS cigar_catalog_search_text_trgm
  ON cigar_catalog USING gin (search_text gin_trgm_ops);
```

At ~4,221 rows an unindexed `ILIKE %x%` scan is sub-millisecond; the GIN
trigram index is included so the feature scales as the catalog grows.

## Query Layer (centralize — DRY)

- New pure helper `tokenizeSearch(input: string): string[]` — whitespace
  split, lowercase, wildcard-escape, drop empties, cap count. Unit-tested.
- `fetchCigarPage` (in `lib/data/cigar-fetchers.ts`) becomes the **single**
  catalog query path:
  - Empty query → order by `usage_count` desc, `id` asc; range-paginate.
  - Non-empty → one `.ilike('search_text', '%' + token + '%')` per token,
    chained (PostgREST ANDs successive filters), same ordering, same
    pagination.
- Refactor `components/cigar-search.tsx` `doSearch` to call `fetchCigarPage`
  (with its own `pageSize` of 8) instead of its own inline `.or(...)`. This
  removes the duplicated field list and query logic.

### Security note

The current `.or(\`brand.ilike.%${query}%,...\`)` interpolates raw user
input into a PostgREST filter string — a filter-injection vector. Moving to
the builder form `.ilike(column, pattern)` with LIKE-wildcards escaped in
each token is parameter-safe and removes that risk.

## UX

- `Highlight` updated to bold **each** matched token (not the whole query
  string), so `padron 1926 35` highlights all three across brand/series/
  format.
- Popular list, no-results message, and the "Can't find it? Add manually"
  fallback are unchanged.

## Testing (TDD)

- Unit: `tokenizeSearch` — whitespace split, lowercasing, wildcard escaping
  (`%`/`_`), empty-token removal, token cap, numeric tokens preserved.
- Unit: per-token filter/pattern building (pure pattern construction, not
  the network round-trip).
- Manual / integration smoke:
  - `Padron 1926 35` returns the Padron 1926 No 35 variants.
  - `Maduro 50 toro` narrows by name + spec.
  - Single token behaves like today.
  - Empty input → Popular.
  - No match → "Add manually" fallback.

## Risks

- **Migration drift** (a repeated failure mode in this project): the
  generated column must be run in the prod Supabase SQL editor *and*
  committed as a migration file, then verified by a search after applying.
  Add to the go-live checklist.
- **Loose numeric substrings**: a bare `5` matches many rows. Acceptable —
  additional tokens narrow, and `usage_count` ordering floats common picks
  to the top.
- **Performance**: negligible at current scale; the trigram index covers
  future growth.

## Files Touched

- `supabase/migrations/20260627_cigar_catalog_search_text.sql` (new)
- `lib/data/cigar-fetchers.ts` (multi-token query, ordering)
- `lib/cigar-search-query.ts` (new pure helper: `tokenizeSearch`) + `lib/__tests__/cigar-search-query.test.ts`
- `components/cigar-search.tsx` (reuse `fetchCigarPage`; multi-token Highlight)
- Go-live checklist note for the manual migration step
