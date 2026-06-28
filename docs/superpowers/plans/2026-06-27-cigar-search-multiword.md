# Cigar Search — Multi-Word Combination Matching: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users type any combination of words (brand, series, vitola, wrapper, country, shade, ring, length) and have every word narrow the cigar results.

**Architecture:** Add one generated `search_text` column to `cigar_catalog` that concatenates all searchable fields into one lowercased string. Search splits input into tokens and requires every token to `ILIKE` the column (ANDed). A new pure tokenizer module is unit-tested; both query surfaces (Discover grid and the search dropdown) funnel through the single `fetchCigarPage` fetcher.

**Tech Stack:** Next.js (App Router), TypeScript, Supabase (PostgREST + supabase-js), SWR, Vitest.

## Global Constraints

- Exact-substring matching only — no fuzzy / typo tolerance in this version.
- Searchable fields = the 8 columns already in `CATALOG_SELECT`: `brand, series, format, ring_gauge, length_inches, wrapper, wrapper_country, shade`. The dropped/unused `name` column is intentionally excluded.
- Token cap: 6 tokens (`MAX_SEARCH_TOKENS`).
- Result ordering everywhere (popular and search): `usage_count` desc, then `id` asc.
- The DB migration must be applied manually in the Supabase SQL editor AND committed as a `supabase/migrations/` file, then verified — manual SQL-editor migrations have silently missed prod before.
- No em dashes in any user-facing copy (none is added here).
- Tests live under `lib/**/*.test.ts` (Vitest `include` glob).

---

### Task 1: Database — `search_text` generated column

**Files:**
- Create: `supabase/migrations/20260627_cigar_catalog_search_text.sql`

**Interfaces:**
- Produces: a `cigar_catalog.search_text text` column (generated, stored) that every later task queries via `.ilike("search_text", ...)`.

This task has no Vitest cycle — it is a SQL migration applied manually in the Supabase SQL editor and verified with a query. Do not skip the verification step.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260627_cigar_catalog_search_text.sql`:

```sql
-- Multi-word cigar search: one lowercased, concatenated search column.
-- Generated + STORED so it auto-updates on insert/update with no trigger.
-- All expression parts (lower, concat_ws, ::text) are immutable.

alter table cigar_catalog
  add column if not exists search_text text
  generated always as (
    lower(concat_ws(' ',
      brand, series, format, wrapper, wrapper_country, shade,
      ring_gauge::text, length_inches::text))
  ) stored;

-- Trigram index keeps `ILIKE %x%` fast as the catalog grows.
create extension if not exists pg_trgm;
create index if not exists cigar_catalog_search_text_trgm
  on cigar_catalog using gin (search_text gin_trgm_ops);
```

- [ ] **Step 2: Apply it in the Supabase SQL editor**

Open the project's Supabase SQL editor (project `qagaiuibtwuhihukghyx`) and run the file's contents against the production database.

- [ ] **Step 3: Verify the column exists and matches**

Run in the SQL editor:

```sql
select brand, series, format, search_text
from cigar_catalog
where search_text ilike '%padron%'
  and search_text ilike '%1926%'
  and search_text ilike '%35%'
limit 5;
```

Expected: returns Padron 1926 No 35 rows (Maduro and Natural variants), and `search_text` reads like `padron 1926 serie maduro no 35 ... <ring> <length>`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260627_cigar_catalog_search_text.sql
git commit -m "feat(search): add cigar_catalog.search_text generated column + trgm index"
```

---

### Task 2: Pure search-query module

**Files:**
- Create: `lib/cigar-search-query.ts`
- Test: `lib/__tests__/cigar-search-query.test.ts`

**Interfaces:**
- Produces:
  - `MAX_SEARCH_TOKENS: number` (= 6)
  - `tokenizeSearch(input: string): string[]` — lowercased, whitespace-split, trimmed, de-duplicated, empties dropped, capped at `MAX_SEARCH_TOKENS`.
  - `escapeLike(token: string): string` — escapes `\`, `%`, `_` for literal LIKE matching.
  - `toLikePattern(token: string): string` — returns `%<escaped>%`.

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/cigar-search-query.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  tokenizeSearch,
  escapeLike,
  toLikePattern,
  MAX_SEARCH_TOKENS,
} from "../cigar-search-query";

describe("tokenizeSearch", () => {
  it("splits on whitespace and lowercases", () => {
    expect(tokenizeSearch("Padron 1926 35")).toEqual(["padron", "1926", "35"]);
  });

  it("collapses runs of whitespace and trims", () => {
    expect(tokenizeSearch("  maduro   toro ")).toEqual(["maduro", "toro"]);
  });

  it("returns [] for blank input", () => {
    expect(tokenizeSearch("   ")).toEqual([]);
  });

  it("de-duplicates repeated words", () => {
    expect(tokenizeSearch("padron padron 1926")).toEqual(["padron", "1926"]);
  });

  it("caps the number of tokens at MAX_SEARCH_TOKENS", () => {
    const input = "a b c d e f g h";
    expect(tokenizeSearch(input)).toHaveLength(MAX_SEARCH_TOKENS);
  });

  it("preserves numeric tokens", () => {
    expect(tokenizeSearch("maduro 50")).toEqual(["maduro", "50"]);
  });
});

describe("escapeLike", () => {
  it("escapes percent signs", () => {
    expect(escapeLike("50%")).toBe("50\\%");
  });

  it("escapes underscores", () => {
    expect(escapeLike("a_b")).toBe("a\\_b");
  });

  it("escapes backslashes first", () => {
    expect(escapeLike("a\\b")).toBe("a\\\\b");
  });
});

describe("toLikePattern", () => {
  it("wraps an escaped token in wildcards", () => {
    expect(toLikePattern("toro")).toBe("%toro%");
  });

  it("wraps an escaped wildcard token literally", () => {
    expect(toLikePattern("50%")).toBe("%50\\%%");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/__tests__/cigar-search-query.test.ts`
Expected: FAIL — `Failed to load url ../cigar-search-query` (module does not exist yet).

- [ ] **Step 3: Write the module**

Create `lib/cigar-search-query.ts`:

```ts
/* ------------------------------------------------------------------
   Pure helpers for multi-word cigar search. No DOM, no network — the
   tokenizing + LIKE-pattern logic lives here so it is unit-testable and
   shared by both the Discover grid (fetchCigarPage) and the search
   dropdown (cigar-search.tsx). See
   docs/superpowers/specs/2026-06-27-cigar-search-multiword-design.md.
   ------------------------------------------------------------------ */

/** Upper bound on tokens per query — keeps the chained ILIKE filter list
 *  bounded regardless of how much the user types. */
export const MAX_SEARCH_TOKENS = 6;

/** Split raw input into normalized search tokens: lowercased,
 *  whitespace-split, trimmed, de-duplicated, empties dropped, capped. */
export function tokenizeSearch(input: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of input.toLowerCase().split(/\s+/)) {
    const token = raw.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
    if (tokens.length >= MAX_SEARCH_TOKENS) break;
  }
  return tokens;
}

/** Escape LIKE wildcards so user input matches literally under Postgres'
 *  default '\' escape character. Backslash MUST be escaped first. */
export function escapeLike(token: string): string {
  return token.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&");
}

/** Build a contains-pattern (`%token%`) with the token's own LIKE
 *  metacharacters escaped, so the surrounding `%` are the only wildcards. */
export function toLikePattern(token: string): string {
  return `%${escapeLike(token)}%`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/__tests__/cigar-search-query.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add lib/cigar-search-query.ts lib/__tests__/cigar-search-query.test.ts
git commit -m "feat(search): pure tokenizer + LIKE-pattern helpers"
```

---

### Task 3: Multi-token query in `fetchCigarPage`

**Files:**
- Modify: `lib/data/cigar-fetchers.ts`

**Interfaces:**
- Consumes: `tokenizeSearch`, `toLikePattern` from `@/lib/cigar-search-query` (Task 2).
- Produces: `fetchCigarPage({ query, pageIndex, pageSize }): Promise<CigarPage>` — unchanged signature; now token-ANDed against `search_text` and always ordered `usage_count` desc, `id` asc.

This task has no new unit test (it is a thin network adapter over the Task 2 helpers, which are already tested). Verification is the build plus a manual smoke check.

- [ ] **Step 1: Replace the query body**

In `lib/data/cigar-fetchers.ts`, add the import near the top (below the existing imports):

```ts
import { tokenizeSearch, toLikePattern } from "@/lib/cigar-search-query";
```

Replace the entire `fetchCigarPage` function body (currently the block that builds `q`, branches on `if (query)` with `.or(...)`, and returns) with:

```ts
export async function fetchCigarPage({
  query,
  pageIndex,
  pageSize,
}: FetchArgs): Promise<CigarPage> {
  const supabase = createClient();
  const offset   = pageIndex * pageSize;
  const tokens   = tokenizeSearch(query);

  let q = supabase.from("cigar_catalog").select(CATALOG_SELECT);

  // Each token must appear somewhere in the row. Chained PostgREST
  // filters are ANDed, so every token narrows the result set.
  for (const token of tokens) {
    q = q.ilike("search_text", toLikePattern(token));
  }

  q = q
    .order("usage_count", { ascending: false })
    .order("id",          { ascending: true })
    .range(offset, offset + pageSize - 1);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const results = (data ?? []) as unknown as CatalogResult[];
  return {
    results,
    hasMore: results.length === pageSize,
  };
}
```

- [ ] **Step 2: Update the file's header comment**

Replace the top doc comment's line `* - Search: ilike across brand / series / format` with:

```
 * - Search: every typed word must ILIKE the generated search_text column
 *   (tokens ANDed) — see lib/cigar-search-query.ts.
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit --pretty false`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/data/cigar-fetchers.ts
git commit -m "feat(search): token-ANDed search_text query in fetchCigarPage"
```

---

### Task 4: Route the dropdown through `fetchCigarPage`

**Files:**
- Modify: `components/cigar-search.tsx`

**Interfaces:**
- Consumes: `fetchCigarPage` from `@/lib/data/cigar-fetchers` (Task 3).
- Produces: no new exports; the dropdown now uses the shared fetcher (removing its own inline `.or(...)` query and the direct Supabase client usage).

This removes duplicated query logic and the unsafe filter-string interpolation. No new unit test (UI behavior is covered by the manual smoke check in Task 6); verification is typecheck + lint.

- [ ] **Step 1: Swap imports**

In `components/cigar-search.tsx`, remove:

```ts
import { createClient } from "@/utils/supabase/client";
```

and add:

```ts
import { fetchCigarPage } from "@/lib/data/cigar-fetchers";
```

Leave `CATALOG_SELECT` and the `CatalogResult` interface exactly as they are (they remain the shared source of those types).

- [ ] **Step 2: Replace `loadPopular`**

Replace the entire `loadPopular` function with:

```ts
  async function loadPopular() {
    const { results } = await fetchCigarPage({
      query:     "",
      pageIndex: 0,
      pageSize:  20,
    });
    setResults(results);
    setIsPopular(true);
    setShowDropdown(true);
    /* Popular list is the curated top-20; no pagination here. */
    setHasMore(false);
  }
```

- [ ] **Step 3: Replace `doSearch` with a page-index version**

Replace the entire `doSearch` `useCallback` with:

```ts
  /* doSearch handles BOTH the first page (pageIndex=0, replaces results)
     and subsequent pages (pageIndex>0, appends). Delegates to the shared
     fetchCigarPage so the dropdown and the Discover grid run identical
     multi-token matching + ordering. */
  const doSearch = useCallback(async (q: string, pageIndex: number) => {
    if (pageIndex === 0) setSearching(true);
    else                 setLoadingMore(true);

    const { results: rows, hasMore: more } = await fetchCigarPage({
      query:     q,
      pageIndex,
      pageSize:  SEARCH_PAGE_SIZE,
    });

    setResults((prev) => (pageIndex === 0 ? rows : [...prev, ...rows]));
    setIsPopular(false);
    setShowDropdown(true);
    setHasMore(more);
    setSearching(false);
    setLoadingMore(false);
  }, []);
```

- [ ] **Step 4: Update the "Load more" call site**

The query-change effect already calls `doSearch(query.trim(), 0)` — that stays correct (offset 0 → pageIndex 0).

In the "Load more" button's `onClick`, replace:

```tsx
                  onClick={() => doSearch(query.trim(), results.length)}
```

with:

```tsx
                  onClick={() => doSearch(query.trim(), results.length / SEARCH_PAGE_SIZE)}
```

(`results.length` is always a whole multiple of `SEARCH_PAGE_SIZE` whenever `hasMore` is true, so this is an integer page index.)

- [ ] **Step 5: Verify typecheck + lint pass**

Run: `npx tsc --noEmit --pretty false`
Expected: no errors (in particular, no "createClient declared but never used").

Run: `npx eslint components/cigar-search.tsx`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add components/cigar-search.tsx
git commit -m "refactor(search): route dropdown through shared fetchCigarPage"
```

---

### Task 5: Highlight every matched token

**Files:**
- Modify: `components/cigar-search.tsx`

**Interfaces:**
- Consumes: `tokenizeSearch` from `@/lib/cigar-search-query` (Task 2).
- Produces: updated `Highlight` component (same props `{ text, query }`) that bolds each matched token instead of the whole query string.

- [ ] **Step 1: Add the import**

In `components/cigar-search.tsx`, extend the search-query import (or add it if Task 4's import line was for a different module):

```ts
import { tokenizeSearch } from "@/lib/cigar-search-query";
```

- [ ] **Step 2: Replace the `Highlight` component**

Replace the entire existing `Highlight` function with:

```tsx
export function Highlight({ text, query }: { text: string; query: string }) {
  const tokens = tokenizeSearch(query);
  if (!text || tokens.length === 0) return <>{text}</>;

  // Build one alternation of regex-escaped tokens; split keeps the matches.
  const pattern = tokens
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const parts = text.split(new RegExp(`(${pattern})`, "gi"));
  const tokenSet = new Set(tokens); // tokens are already lowercased

  return (
    <>
      {parts.map((part, i) =>
        tokenSet.has(part.toLowerCase()) ? (
          <span key={i} style={{ color: "var(--gold)", fontWeight: 600 }}>
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit --pretty false`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/cigar-search.tsx
git commit -m "feat(search): highlight each matched search token"
```

---

### Task 6: Full verification + manual smoke

**Files:** none (verification only).

Prerequisite: Task 1's migration is applied to the database (the queries reference `search_text`).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all suites pass, including `lib/__tests__/cigar-search-query.test.ts`.

- [ ] **Step 2: Typecheck the project**

Run: `npx tsc --noEmit --pretty false`
Expected: no errors.

- [ ] **Step 3: Manual smoke (dev server, signed in)**

Run: `npm run dev`, sign in, then in the Discover Cigars search and the Add-to-Humidor search dropdown verify:
- `Padron 1926 35` → Padron 1926 No 35 variants (Maduro and Natural).
- `Maduro 50 toro` → Maduro Toros with a 50 ring gauge.
- A single word (e.g. `Padron`) behaves like before.
- Empty input → Popular list (no "Load more").
- A nonsense string (e.g. `zzzqqq`) → "No results" + "Add manually".
- Matched words render in gold in the result rows.

- [ ] **Step 4: No commit** (verification only). If any check fails, return to the owning task.

---

## Self-Review

**Spec coverage:**
- Matching model (tokenize, AND, cap, empty→popular, ordering) → Tasks 2, 3.
- Data layer (generated column + trgm index) → Task 1.
- Query centralization (shared fetcher, dropdown reuse) → Tasks 3, 4.
- Security (remove `.or` interpolation) → Task 4 (dropdown) + Task 3 (grid); both now use `.ilike` + escaped patterns.
- UX (multi-token Highlight; popular/no-results unchanged) → Task 5.
- Testing (tokenizer unit tests; manual smoke) → Tasks 2, 6.
- Migration-drift risk (manual apply + verify + committed file) → Task 1.

**Placeholder scan:** none — every code/SQL step is complete.

**Type consistency:** `tokenizeSearch`, `escapeLike`, `toLikePattern`, `MAX_SEARCH_TOKENS` are defined in Task 2 and consumed with identical names/signatures in Tasks 3–5. `fetchCigarPage`'s `FetchArgs`/`CigarPage` types are unchanged from the existing file.
