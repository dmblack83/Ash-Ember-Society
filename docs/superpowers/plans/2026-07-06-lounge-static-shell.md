# Lounge Static Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `/lounge` from a server-coupled edge route to a static client shell (the `/humidor` / `/account` pattern) so bottom-nav taps are instant on cold load and the heavy feed render stops running on every app open via nav prefetch.

**Architecture:** `page.tsx` becomes a static page rendering a client `LoungeRoute` (session gate via `useGatedSession` + shell data via SWR). The server data island is deleted; its seed work moves to a client `fetchLoungeShellData` (categories, pinned posts, rules gate, founder badge), and the feed's page 0 is fetched by the existing `fetchLoungeFeedPage` through `useSWRInfinite`. To keep page-0 feature parity (report numbers "NO. 45", per-third tasting notes), those two enrichments are added to the shared client fetcher — which also fixes the existing inconsistency where pages 1+ lacked them.

**Tech Stack:** Next.js App Router (static shell), SWR + persistent localStorage cache, Supabase browser client under RLS, existing client-safe helpers `computeReportNumbers` (RPC `get_report_numbers`) and `getBurnReportThirdsTaggedBatch`.

## Global Constraints

- Never break functioning code; feed behavior and visuals must be unchanged apart from load mechanics.
- No em dashes in user-facing copy (code/comments exempt).
- PWA performance is paramount: no new client deps; shell must render user-agnostic HTML.
- New branch off freshly-fetched `origin/main`; new PR; never push to a merged PR branch (pre-push gate).
- One concern per PR: `/lounge/[postId]` and `/lounge/rooms/[slug]` stay untouched.

## Verified Premises (2026-07-06, this session)

- `fetchLoungeFeedPage` (client) already produces `CategoryFeedPage` for all pages; the island seed duplicates it minus two enrichments (`report_number`, `thirds_tagged_rows`) that `InlinePost.tsx:153-186` renders.
- `computeReportNumbers` (lib/data/burn-report-number.ts) and `getBurnReportThirdsTaggedBatch` (lib/data/burn-report-thirds-batch.ts) are client-safe (no server imports; supabase passed as param).
- `useGatedSession` (lib/auth/use-gated-session.ts) is the shared shell gate; `HumidorRoute` is the reference.
- `PullToRefresh` with no `onRefresh` mutates all SWR keys (components/ui/PullToRefresh.tsx:106-109) — correct for a pure-SWR shell.
- `forum_categories` is anon-readable (server used `createAnonClient`), so authed client reads pass RLS.
- Only `app/(app)/lounge/page.tsx` imports the root `_islands.tsx`; `[postId]` has its own islands file.
- Lifecycle walk (seed removal): `LoungeFeedClient` reads chip/view from `useSearchParams` already; seed props only gate `fallbackData`. Removing the seed means SWR default mount behavior: persistent cache paints instantly on revisits, first visit shows skeleton then data. `pinnedPosts`/`hasUnlocked` remain mount-time `useState` captures — unchanged semantics because `LoungeRoute` mounts `LoungeFeedClient` only after shell data resolves.

---

### Task 1: Shell SWR key

**Files:**
- Modify: `lib/data/keys.ts` (lounge section, ~line 52-69)
- Test: `lib/data/__tests__/keys.test.ts`

**Interfaces:**
- Produces: `keyFor.loungeShell(userId: string) => readonly ["lounge-shell", string]`

- [ ] **Step 1: Add failing test** — in `keys.test.ts`, assert `keyFor.loungeShell("u1")` equals `["lounge-shell", "u1"]`.
- [ ] **Step 2: Run** `npx vitest run lib/data/__tests__/keys.test.ts` — expect FAIL (loungeShell undefined).
- [ ] **Step 3: Implement** — add to `keyFor`:

```ts
  /* Lounge shell (categories + pinned + rules gate + founder badge) —
     per-user because pinned enrichment carries viewer liked/vote state. */
  loungeShell: (userId: string) => ["lounge-shell", userId] as const,
```

- [ ] **Step 4: Run test — PASS.**
- [ ] **Step 5: Commit** `feat: add lounge-shell SWR key`

### Task 2: Shared enrichment in lounge-fetchers + report numbers + thirds

**Files:**
- Modify: `lib/data/lounge-fetchers.ts`
- Test: `lib/data/__tests__/lounge-fetchers.test.ts`

**Interfaces:**
- Produces: `enrichPostBatch(supabase, batch: RawPost[], userId: string, feedbackCategoryId: string | null): Promise<{ posts: PostItem[]; likedIds: string[] }>` (module-internal, exported for tests), `RawPost` at module scope.
- `POST_SELECT` burn_reports join gains `id` (needed by thirds batch).
- `fetchLoungeFeedPage` delegates steps 2-6 to `enrichPostBatch`; behavior identical plus `report_number` (via `computeReportNumbers`) and `thirds_tagged_rows` (via `getBurnReportThirdsTaggedBatch` with a full `flavor_tags` map).

- [ ] Extract steps 2-6 of `fetchLoungeFeedPage` into `enrichPostBatch`; move `RawPost` to module scope; change smoke_logs select `burn_report:burn_reports(...)` to include `id`; fetch the full `flavor_tags` list (small table) instead of `.in(allTagIds)`; after building `smokeLogMap`, call `computeReportNumbers(supabase, smokeLogIds)` and stamp `report_number`; collect thirds-enabled burn report ids and merge `thirds_tagged_rows` like the island did (island code at old `_islands.tsx:202-226` is the reference).
- [ ] Add unit tests for the exported pure `normalizePostBatch` helper (vote tally mapping, closed status, missing author) if extracted; otherwise cover `enrichPostBatch`'s pure sub-steps.
- [ ] `npx vitest run lib/data/__tests__/lounge-fetchers.test.ts` — PASS; `npx tsc --noEmit` clean for the file's consumers.
- [ ] Commit `feat: shared post enrichment with report numbers and thirds in lounge client fetcher`

### Task 3: fetchLoungeShellData

**Files:**
- Modify: `lib/data/lounge-fetchers.ts`

**Interfaces:**
- Produces:

```ts
export interface LoungeShellData {
  categories:     ForumCategory[];
  pinnedPosts:    PostItem[];
  rulesPost:      { id: string; title: string; content: string } | null;
  hasUnlocked:    boolean;
  agreementCount: number;
  isFounder:      boolean;
}
export async function fetchLoungeShellData(userId: string): Promise<LoungeShellData>
```

- [ ] Implement: wave 1 parallel = categories (`forum_categories` select mirroring `ForumCategory` fields, order sort_order), raw pinned batch (`POST_SELECT`, `is_system=false`, `is_pinned=true`, created_at desc), rules post (`is_system=true`, `is_pinned=true`, maybeSingle), own profile `assigned_badges` (own-row RLS). Wave 2 parallel = `enrichPostBatch(pinned)` + user-agreed count + total-agreed count (head count queries on `forum_post_likes`, matching old `_islands.tsx:153-160`).
- [ ] `npx tsc --noEmit` clean. Commit `feat: client shell data fetcher for lounge`

### Task 4: LoungeRoute client shell + static page

**Files:**
- Create: `app/(app)/lounge/LoungeRoute.tsx`
- Modify: `app/(app)/lounge/page.tsx`
- Delete: `app/(app)/lounge/_islands.tsx`

**Interfaces:**
- Consumes: `useGatedSession`, `keyFor.loungeShell`, `fetchLoungeShellData`, `LoungeShellSkeleton`, `PullToRefresh`, `LoungeFeedClient` (Task 5 prop shape).

- [ ] `LoungeRoute.tsx` mirrors `HumidorRoute`/`AccountRoute`: gate via `useGatedSession`; `useSWR(allowed ? keyFor.loungeShell(userId) : null, () => fetchLoungeShellData(userId))`; skeleton until both gate and shell data resolve; then `<PullToRefresh><LoungeFeedClient …shell props… userId={session.userId} /></PullToRefresh>`.
- [ ] `page.tsx` becomes the static shell (no `runtime` export, no `getServerUser`, keep `metadata`), rendering `<LoungeRoute />`.
- [ ] Delete `_islands.tsx`. Verify no remaining importers: `grep -rn "lounge/_islands\|LoungeFeedDataIsland" app components lib`.
- [ ] Commit `feat: lounge static client shell route`

### Task 5: Remove seed props from LoungeFeedClient

**Files:**
- Modify: `components/lounge/LoungeFeedClient.tsx`

**Interfaces:**
- Produces (new Props): `{ categories, pinnedPosts, rulesPost, hasUnlocked, agreementCount, userId, isFounder }` — `initialPage`, `initialChip`, `initialView` removed.

- [ ] Remove seed props and `seedMatches`; `useSWRInfinite` options become `{ revalidateFirstPage: false }`; `pages = data ?? []`.
- [ ] Commit `refactor: drop server seed path from LoungeFeedClient`

### Task 6: Full gate + branch finish

- [ ] `npx tsc --noEmit` (project + `tsconfig.sw.json`) — clean.
- [ ] `npm run test:unit` — pass.
- [ ] `npm run build` — pass (verifies static prerender of /lounge, no `useSearchParams` Suspense violation; if the build demands it, wrap `<LoungeRoute />` in `<Suspense fallback={<LoungeShellSkeleton />}>`).
- [ ] `npx eslint` on changed files — no new errors.
- [ ] Runtime verification: NOT possible in this environment (test account credentials rotated). State this explicitly in the PR; Dave verifies in the PWA.
- [ ] Pre-push PR-state gate, push, open PR.
