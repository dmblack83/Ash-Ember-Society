# Lounge Unified Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the lounge's room-based navigation with a single unified feed filtered by category chips, per the approved spec at `docs/superpowers/specs/2026-07-05-lounge-unified-feed-design.md`.

**Architecture:** One SWR-infinite feed client (`LoungeFeedClient`) replaces `LoungeForumClient` + `CategoryFeed`. Category becomes nullable in the fetcher and cache key. URL carries chip/view state (`/lounge?c=burn-reports&v=hot`) via shallow `window.history.pushState` (no server round-trip on chip taps). Old room routes become server redirects. Hot ranking is a Postgres RPC with graceful fallback to New.

**Tech Stack:** Next.js App Router (edge runtime lounge routes), Supabase JS, SWR (`useSWRInfinite`), vitest for unit tests.

## Global Constraints

- No em dashes in any user-facing string (UI copy, toasts, empty states). Internal comments are exempt.
- Follow existing inline-style + Tailwind-token conventions (`var(--gold)`, `var(--ember)`, `var(--card)`, etc). No new fonts, no token redefinition.
- `NewPostSheet` must stay lazy (`next/dynamic`, `ssr: false`).
- Manual SQL is delivered as a copy-paste block for Dave (Supabase SQL editor) plus a committed migration file; code must work (with fallback) before the SQL is applied.
- Unit tests live under `lib/**` (`vitest run lib/` — the config only includes `lib/**/*.test.ts`).
- Commit after each task. Never `git add .` (untracked personal files exist in the repo root); add files explicitly.
- Verified prod category slugs: `lounge-rules` (gate), `welcome`, `general-discussion`, `burn-reports`, `product-feedback`. The rules post is found by `is_system=true AND is_pinned=true` and lives in `lounge-rules`, NOT in `welcome`.

## Decisions locked by this plan

1. **Single PR.** Hot sort falls back to New until the SQL is applied, so nothing is blocked on the DB.
2. **Chip URL values** are `general`, `burn-reports`, `feedback` (short forms per spec), mapped internally to the real category slugs. `welcome` redirects to `?c=general`.
3. **Welcome category row is deleted** by the migration after reassigning its posts (rules wiring is unaffected, see constraint above).
4. **Text posts render full body** in the feed (the pre-existing non-preview `InlinePost` mode, matching the mockup); the title links to `/lounge/[postId]` (canonical deep link). `previewMode` is removed as dead code.
5. **New Post with the Burn Reports chip active** opens the composer preselected to Burn Reports, which shows an explainer + "Log a Smoke in the Humidor" button (spec requires Burn Reports in the dropdown; burn posts can only be authored from a smoke log).

---

### Task 1: Migration SQL (manual-apply)

**Files:**
- Create: `supabase/migrations/20260705_lounge_unified_feed.sql`

**Interfaces:**
- Produces: DB function `get_hot_posts(p_category_id uuid, p_limit integer, p_offset integer) returns table (post_id uuid)`, called from the client via `supabase.rpc("get_hot_posts", { p_category_id, p_limit, p_offset })` (Task 4).

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Lounge unified feed (2026-07-05)
-- Manual-apply in the Supabase SQL editor. Safe to re-run.
--
-- 1. Fold Welcome/Introductions posts into General Discussion
-- 2. Delete the welcome category row (rules post lives in the
--    lounge-rules gate category and is looked up by
--    is_system + is_pinned, so this row anchors nothing)
-- 3. get_hot_posts RPC: posts ranked by comment count over the
--    trailing 7 days, tie-break created_at desc
-- 4. Indexes for the unfiltered newest-first feed and the hot join
-- ============================================================

-- 1. Reassign Welcome posts to General Discussion
update forum_posts
set category_id = (select id from forum_categories where slug = 'general-discussion')
where category_id = (select id from forum_categories where slug = 'welcome');

-- 2. Remove the Welcome category (no posts reference it after step 1)
delete from forum_categories where slug = 'welcome';

-- 3. Hot ranking RPC. Invoker rights + STABLE, so forum_posts RLS
--    applies to the caller as normal.
create or replace function get_hot_posts(
  p_category_id uuid    default null,
  p_limit       integer default 15,
  p_offset      integer default 0
)
returns table (post_id uuid)
language sql
stable
as $$
  select p.id
  from forum_posts p
  left join forum_comments c
    on c.post_id = p.id
   and c.created_at >= now() - interval '7 days'
  where p.is_system = false
    and p.is_pinned is distinct from true
    and (p_category_id is null or p.category_id = p_category_id)
  group by p.id
  order by count(c.id) desc, p.created_at desc
  limit p_limit offset p_offset;
$$;

grant execute on function get_hot_posts(uuid, integer, integer) to authenticated;

-- 4. Indexes
create index if not exists forum_posts_created_at_idx
  on forum_posts (created_at desc);

create index if not exists forum_comments_post_created_idx
  on forum_comments (post_id, created_at desc);
```

- [ ] **Step 2: Verify queries (include in the PR description for Dave)**

```sql
-- All should be run after applying the block above.
select slug, name from forum_categories order by sort_order;
-- expect: lounge-rules, general-discussion, burn-reports, product-feedback (no welcome)

select count(*) as orphaned from forum_posts
where category_id not in (select id from forum_categories);
-- expect: 0

select * from get_hot_posts(null, 5, 0);
-- expect: up to 5 post ids, no error

select indexname from pg_indexes
where tablename in ('forum_posts', 'forum_comments')
  and indexname in ('forum_posts_created_at_idx', 'forum_comments_post_created_idx');
-- expect: both rows
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260705_lounge_unified_feed.sql
git commit -m "feat: lounge unified feed migration (welcome fold-in, hot RPC, feed indexes)"
```

---

### Task 2: Chip helpers (`lib/lounge/chips.ts`) — TDD

**Files:**
- Create: `lib/lounge/chips.ts`
- Test: `lib/lounge/__tests__/chips.test.ts`

**Interfaces:**
- Produces (used by Tasks 10-12):
  - `type ChipValue = "all" | "general" | "burn-reports" | "feedback"`
  - `type FeedView = "new" | "hot" | "mine"`, `type FeedbackView = "open" | "closed" | "mine"`
  - `CHIPS: readonly { value: ChipValue; label: string; categorySlug: string | null }[]`
  - `parseChip(c: string | null | undefined): ChipValue`
  - `parseView(v: string | null | undefined, isFeedback: boolean): FeedView | FeedbackView`
  - `categorySlugForChip(chip: ChipValue): string | null`
  - `chipForCategorySlug(slug: string): ChipValue | null` (maps `welcome` → `general`)
  - `roomRedirectQuery(slug: string): string`
  - `feedParamsForView(view): { filter: "all" | "mine" | "open" | "closed"; sort: "new" | "hot" }`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/lounge/__tests__/chips.test.ts
import { describe, it, expect } from "vitest";
import {
  parseChip,
  parseView,
  categorySlugForChip,
  chipForCategorySlug,
  roomRedirectQuery,
  feedParamsForView,
} from "../chips";

describe("parseChip", () => {
  it("returns a valid chip value unchanged", () => {
    expect(parseChip("burn-reports")).toBe("burn-reports");
    expect(parseChip("general")).toBe("general");
    expect(parseChip("feedback")).toBe("feedback");
  });
  it("falls back to all for missing or unknown values", () => {
    expect(parseChip(null)).toBe("all");
    expect(parseChip(undefined)).toBe("all");
    expect(parseChip("welcome")).toBe("all");
    expect(parseChip("nonsense")).toBe("all");
  });
});

describe("parseView", () => {
  it("non-feedback: accepts hot and mine, defaults to new", () => {
    expect(parseView("hot", false)).toBe("hot");
    expect(parseView("mine", false)).toBe("mine");
    expect(parseView(null, false)).toBe("new");
    expect(parseView("closed", false)).toBe("new");
  });
  it("feedback: accepts closed and mine, defaults to open", () => {
    expect(parseView("closed", true)).toBe("closed");
    expect(parseView("mine", true)).toBe("mine");
    expect(parseView(null, true)).toBe("open");
    expect(parseView("hot", true)).toBe("open");
  });
});

describe("category slug mapping", () => {
  it("maps chips to real category slugs", () => {
    expect(categorySlugForChip("all")).toBeNull();
    expect(categorySlugForChip("general")).toBe("general-discussion");
    expect(categorySlugForChip("burn-reports")).toBe("burn-reports");
    expect(categorySlugForChip("feedback")).toBe("product-feedback");
  });
  it("maps category slugs back to chips, folding welcome into general", () => {
    expect(chipForCategorySlug("general-discussion")).toBe("general");
    expect(chipForCategorySlug("burn-reports")).toBe("burn-reports");
    expect(chipForCategorySlug("product-feedback")).toBe("feedback");
    expect(chipForCategorySlug("welcome")).toBe("general");
    expect(chipForCategorySlug("lounge-rules")).toBeNull();
  });
});

describe("roomRedirectQuery", () => {
  it("builds the ?c= query for known room slugs", () => {
    expect(roomRedirectQuery("general-discussion")).toBe("?c=general");
    expect(roomRedirectQuery("welcome")).toBe("?c=general");
    expect(roomRedirectQuery("burn-reports")).toBe("?c=burn-reports");
    expect(roomRedirectQuery("product-feedback")).toBe("?c=feedback");
  });
  it("returns empty string for unknown slugs (plain /lounge)", () => {
    expect(roomRedirectQuery("speakeasy")).toBe("");
    expect(roomRedirectQuery("lounge-rules")).toBe("");
  });
});

describe("feedParamsForView", () => {
  it("maps views to fetcher filter + sort", () => {
    expect(feedParamsForView("new")).toEqual({ filter: "all", sort: "new" });
    expect(feedParamsForView("hot")).toEqual({ filter: "all", sort: "hot" });
    expect(feedParamsForView("mine")).toEqual({ filter: "mine", sort: "new" });
    expect(feedParamsForView("open")).toEqual({ filter: "open", sort: "new" });
    expect(feedParamsForView("closed")).toEqual({ filter: "closed", sort: "new" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/lounge/__tests__/chips.test.ts`
Expected: FAIL — cannot resolve `../chips`.

- [ ] **Step 3: Implement `lib/lounge/chips.ts`**

```typescript
/*
 * Unified lounge feed: chip and view definitions + URL param helpers.
 *
 * Chips are the category filter row (/lounge?c=<chip>). Chip values are
 * short URL-facing forms; categorySlug maps each chip to the real
 * forum_categories.slug. "welcome" was folded into General Discussion
 * (migration 20260705) so it maps to the general chip for old links.
 *
 * The secondary row is one contextual slot (?v=<view>):
 *   - feedback chip:  open (default) | closed | mine
 *   - everything else: new (default) | hot | mine
 */

export type ChipValue    = "all" | "general" | "burn-reports" | "feedback";
export type FeedView     = "new" | "hot" | "mine";
export type FeedbackView = "open" | "closed" | "mine";
export type LoungeFilter = "all" | "mine" | "open" | "closed";
export type LoungeSort   = "new" | "hot";

export interface ChipDef {
  value:        ChipValue;
  label:        string;
  categorySlug: string | null;
}

export const CHIPS: readonly ChipDef[] = [
  { value: "all",          label: "All",          categorySlug: null },
  { value: "general",      label: "General",      categorySlug: "general-discussion" },
  { value: "burn-reports", label: "Burn Reports", categorySlug: "burn-reports" },
  { value: "feedback",     label: "Feedback",     categorySlug: "product-feedback" },
] as const;

export function parseChip(c: string | null | undefined): ChipValue {
  return CHIPS.some((chip) => chip.value === c) ? (c as ChipValue) : "all";
}

export function parseView(
  v: string | null | undefined,
  isFeedback: boolean,
): FeedView | FeedbackView {
  if (isFeedback) return v === "closed" || v === "mine" ? v : "open";
  return v === "hot" || v === "mine" ? v : "new";
}

export function categorySlugForChip(chip: ChipValue): string | null {
  return CHIPS.find((c) => c.value === chip)?.categorySlug ?? null;
}

export function chipForCategorySlug(slug: string): ChipValue | null {
  if (slug === "welcome") return "general";
  return CHIPS.find((c) => c.categorySlug === slug)?.value ?? null;
}

/* Query string for the /lounge/rooms/[slug] redirect route. Unknown
   slugs land on the plain feed (empty string). */
export function roomRedirectQuery(slug: string): string {
  const chip = chipForCategorySlug(slug);
  return chip && chip !== "all" ? `?c=${chip}` : "";
}

/* Map a secondary-row view onto fetcher params. "Hot" and "My Posts"
   are mutually exclusive views, so hot never combines with mine. */
export function feedParamsForView(
  view: FeedView | FeedbackView,
): { filter: LoungeFilter; sort: LoungeSort } {
  if (view === "hot")  return { filter: "all",  sort: "hot" };
  if (view === "mine") return { filter: "mine", sort: "new" };
  if (view === "open" || view === "closed") return { filter: view, sort: "new" };
  return { filter: "all", sort: "new" };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/lounge/__tests__/chips.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add lib/lounge/chips.ts lib/lounge/__tests__/chips.test.ts
git commit -m "feat: lounge chip/view URL helpers with unit tests"
```

---

### Task 3: Cache key update (`keyFor.loungeFeed`) — TDD

**Files:**
- Modify: `lib/data/keys.ts:60-65`
- Test: `lib/data/__tests__/keys.test.ts` (new)

**Interfaces:**
- Produces: `keyFor.loungeFeed(categoryId: string | null, page: number, userId: string, filter?: "all" | "mine" | "open" | "closed", sort?: "new" | "hot")`. Null categoryId means the All feed. Existing caller `CategoryFeed.tsx` keeps compiling (extra param defaults) until it is deleted in Task 12.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/data/__tests__/keys.test.ts
import { describe, it, expect } from "vitest";
import { keyFor } from "../keys";

describe("keyFor.loungeFeed", () => {
  it("uses a stable sentinel for the all-categories feed", () => {
    const key = keyFor.loungeFeed(null, 0, "user-1", "all", "new");
    expect(key).toEqual(["lounge-feed", "all-categories", 0, "user-1", "all", "new"]);
  });

  it("keeps category feeds distinct from the all feed", () => {
    const all = keyFor.loungeFeed(null, 0, "user-1", "all", "new");
    const cat = keyFor.loungeFeed("cat-9", 0, "user-1", "all", "new");
    expect(all).not.toEqual(cat);
  });

  it("partitions the cache by sort", () => {
    const hot = keyFor.loungeFeed(null, 0, "user-1", "all", "hot");
    const fresh = keyFor.loungeFeed(null, 0, "user-1", "all", "new");
    expect(hot).not.toEqual(fresh);
  });

  it("defaults filter to all and sort to new", () => {
    expect(keyFor.loungeFeed("cat-9", 1, "user-1")).toEqual(
      ["lounge-feed", "cat-9", 1, "user-1", "all", "new"],
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/data/__tests__/keys.test.ts`
Expected: FAIL — key tuple has 5 elements / categoryId type mismatch.

- [ ] **Step 3: Update `keyFor.loungeFeed` in `lib/data/keys.ts`**

Replace the existing `loungeFeed` entry (lines 60-65) with:

```typescript
  loungeFeed:   (
    categoryId: string | null,
    page:       number,
    userId:     string,
    filter:     "all" | "mine" | "open" | "closed" = "all",
    sort:       "new" | "hot" = "new",
  ) => ["lounge-feed", categoryId ?? "all-categories", page, userId, filter, sort] as const,
```

Also update the comment block directly above it (lines 52-59) to:

```typescript
  /* ── Lounge / forum. Liked status is per-user, so userId is part
   *   of the key — switching account on the same browser produces a
   *   fresh cache, not stale liked flags.
   *
   *   categoryId is null for the unified All feed ("all-categories"
   *   sentinel keeps the tuple shape stable). `filter` and `sort`
   *   partition the cache per secondary-row view so toggling chips
   *   or views hits independent cache entries. Stale keys persisted
   *   by the old per-room lounge are orphaned and harmless. */
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/data/__tests__/keys.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check (old CategoryFeed caller must still compile)**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add lib/data/keys.ts lib/data/__tests__/keys.test.ts
git commit -m "feat: nullable category + sort in loungeFeed cache key"
```

---

### Task 4: Unified feed fetcher (`fetchLoungeFeedPage`) — TDD for pure helpers

**Files:**
- Modify: `lib/data/lounge-fetchers.ts` (add new function alongside `fetchCategoryFeedPage`; the old one is deleted in Task 12)
- Modify: `components/lounge/InlinePost.tsx:26-48` (add optional `category_id` to `PostItem`)
- Test: `lib/data/__tests__/lounge-fetchers.test.ts` (new)

**Interfaces:**
- Consumes: `keyFor.loungeFeed` shape (Task 3), `get_hot_posts` RPC (Task 1, may not exist yet — must fall back).
- Produces:
  - `PostItem` gains `category_id?: string | null` (optional so the old rooms island keeps compiling until Task 12).
  - `orderByIds<T extends { id: string }>(rows: T[], ids: string[]): T[]` — exported pure helper.
  - `fetchLoungeFeedPage(args: { categoryId: string | null; feedbackCategoryId: string | null; userId: string; pageIndex: number; pageSize: number; filter?: "all" | "mine" | "open" | "closed"; sort?: "new" | "hot" }): Promise<CategoryFeedPage>`

- [ ] **Step 1: Add `category_id` to `PostItem` in `components/lounge/InlinePost.tsx`**

In the `PostItem` interface, after `id: string;` add:

```typescript
  /* Source category. Optional during the room→feed transition; the
     unified fetcher always sets it. */
  category_id?:  string | null;
```

- [ ] **Step 2: Write the failing test for `orderByIds`**

```typescript
// lib/data/__tests__/lounge-fetchers.test.ts
import { describe, it, expect } from "vitest";
import { orderByIds } from "../lounge-fetchers";

describe("orderByIds", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("reorders rows to match the id list (hot RPC ranking)", () => {
    expect(orderByIds(rows, ["c", "a", "b"]).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("drops ids with no matching row", () => {
    expect(orderByIds(rows, ["b", "missing", "a"]).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("returns empty for empty ids", () => {
    expect(orderByIds(rows, [])).toEqual([]);
  });
});
```

Note: `lib/data/lounge-fetchers.ts` starts with `"use client"` — vitest (node env) tolerates the directive; the existing `lib/data/__tests__` suite already imports client-marked modules' pure siblings. If the import fails on unrelated browser globals, move `orderByIds` into `lib/lounge/order-by-ids.ts` instead and update the import — keep the same signature.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/data/__tests__/lounge-fetchers.test.ts`
Expected: FAIL — `orderByIds` is not exported.

- [ ] **Step 4: Implement in `lib/data/lounge-fetchers.ts`**

Add after the `CategoryFeedPage` interface (line 46):

```typescript
export type LoungeFilter = "all" | "mine" | "open" | "closed";
export type LoungeSort   = "new" | "hot";

/* Reorder DB rows to match a ranked id list (the hot RPC returns ids
   in rank order; the follow-up .in() fetch does not preserve it). */
export function orderByIds<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as T[];
}

interface FetchLoungeFeedArgs {
  /* null = the unified All feed (no category filter). */
  categoryId:         string | null;
  /* Product Feedback category id — vote tallies are fetched for posts
     in this category regardless of which chip is active. */
  feedbackCategoryId: string | null;
  userId:             string;
  pageIndex:          number;
  pageSize:           number;
  filter?:            LoungeFilter;
  sort?:              LoungeSort;
}

const POST_SELECT =
  "id, title, content, created_at, user_id, category_id, image_url, is_locked, is_system, smoke_log_id, status, " +
  "forum_post_likes(count), forum_comments(count)";
```

Then add the new fetcher (directly after the constants above). It mirrors `fetchCategoryFeedPage` steps 2-6 exactly; the differences are the nullable category, the hot path, and per-post feedback vote detection:

```typescript
export async function fetchLoungeFeedPage({
  categoryId,
  feedbackCategoryId,
  userId,
  pageIndex,
  pageSize,
  filter = "all",
  sort   = "new",
}: FetchLoungeFeedArgs): Promise<CategoryFeedPage> {
  const supabase = createClient();
  const offset   = pageIndex * pageSize;

  type RawPost = {
    id:                string;
    title:             string;
    content:           string;
    created_at:        string;
    user_id:           string | null;
    category_id:       string | null;
    image_url:         string | null;
    is_locked:         boolean;
    is_system:         boolean;
    smoke_log_id:      string | null;
    status:            string | null;
    forum_post_likes:  { count: number }[];
    forum_comments:    { count: number }[];
  };

  /* ── 1. Posts (excluding pinned) ──────────────────────────────── */
  let batch: RawPost[] = [];

  let usedHot = false;
  if (sort === "hot") {
    /* Hot ranking lives in the get_hot_posts RPC (comment count over
       the trailing 7 days, tie-break created_at desc). If the RPC is
       missing (manual SQL not applied yet) fall back to New — same
       pattern as get_report_numbers. */
    const { data: hotRows, error: hotError } = await supabase.rpc("get_hot_posts", {
      p_category_id: categoryId,
      p_limit:       pageSize,
      p_offset:      offset,
    });
    if (!hotError && hotRows) {
      usedHot = true;
      const ids = (hotRows as { post_id: string }[]).map((r) => r.post_id);
      if (ids.length === 0) return { posts: [], likedIds: [], hasMore: false };
      const { data: rows, error } = await supabase
        .from("forum_posts")
        .select(POST_SELECT)
        .in("id", ids);
      if (error) throw new Error(error.message);
      batch = orderByIds((rows ?? []) as unknown as RawPost[], ids);
    } else if (hotError) {
      log.warn({
        scope:   "lounge-hot-fallback",
        message: "get_hot_posts RPC unavailable, falling back to newest-first",
        error:   hotError,
      });
    }
  }

  if (!usedHot) {
    let postsQuery = supabase
      .from("forum_posts")
      .select(POST_SELECT)
      .eq("is_system", false)
      .neq("is_pinned", true);

    if (categoryId)          postsQuery = postsQuery.eq("category_id", categoryId);
    if (filter === "mine")   postsQuery = postsQuery.eq("user_id", userId);
    if (filter === "open")   postsQuery = postsQuery.eq("status",  "open");
    if (filter === "closed") postsQuery = postsQuery.eq("status",  "closed");

    const { data: rawPosts, error: postsError } = await postsQuery
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (postsError) throw new Error(postsError.message);
    batch = (rawPosts ?? []) as unknown as RawPost[];
  }

  if (batch.length === 0) {
    return { posts: [], likedIds: [], hasMore: false };
  }

  /* ── 2. Author profiles ─────────────────────────────────────── */
  const authorIds = [...new Set(batch.map((p) => p.user_id).filter(Boolean) as string[])];
  type AuthorEntry = {
    display_name:    string | null;
    avatar_url:      string | null;
    badge:           string | null;
    membership_tier: string | null;
  };
  const nameMap: Record<string, AuthorEntry> = {};
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("public_profiles")
      .select("id, display_name, avatar_url, badge, membership_tier")
      .in("id", authorIds);
    for (const p of (profiles ?? []) as Array<{ id: string } & AuthorEntry>) {
      nameMap[p.id] = {
        display_name:    p.display_name,
        avatar_url:      p.avatar_url,
        badge:           p.badge           ?? null,
        membership_tier: p.membership_tier ?? null,
      };
    }
  }

  /* ── 3. Liked status for the viewer ───────────────────────────── */
  const newPostIds = batch.map((p) => p.id);
  const likedSet   = new Set<string>();
  if (newPostIds.length > 0) {
    const { data: likes } = await supabase
      .from("forum_post_likes")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", newPostIds);
    for (const l of (likes ?? []) as { post_id: string }[]) likedSet.add(l.post_id);
  }

  /* ── 4. Smoke logs + flavor tags (verdict card data) ──────────── */
  const smokeLogIds = batch.map((p) => p.smoke_log_id).filter(Boolean) as string[];
  const smokeLogMap: Record<string, SmokeLogData> = {};
  if (smokeLogIds.length > 0) {
    const { data: logs } = await supabase
      .from("smoke_logs")
      .select(`
        id, smoked_at, overall_rating, draw_rating, burn_rating,
        construction_rating, flavor_rating, pairing_drink, pairing_food,
        location, occasion, smoke_duration_minutes, review_text, photo_urls,
        content_video_id, flavor_tag_ids, user_id, cigar_id,
        cigar:cigar_catalog(brand, series, format),
        burn_report:burn_reports(thirds_enabled, third_beginning, third_middle, third_end)
      `)
      .in("id", smokeLogIds);

    const rawLogs = (logs ?? []) as Array<
      Record<string, unknown> & {
        id:               string;
        flavor_tag_ids:   string[] | null;
        user_id:          string | null;
        burn_report:      Array<Record<string, unknown>> | null;
      }
    >;

    const allTagIds = [...new Set(rawLogs.flatMap((l) => l.flavor_tag_ids ?? []))];
    const tagNameMap: Record<string, string> = {};
    if (allTagIds.length > 0) {
      const { data: tags } = await supabase
        .from("flavor_tags")
        .select("id, name")
        .in("id", allTagIds);
      for (const t of (tags ?? []) as { id: string; name: string }[]) tagNameMap[t.id] = t.name;
    }

    for (const logRow of rawLogs) {
      const author = logRow.user_id ? nameMap[logRow.user_id as string] : null;
      smokeLogMap[logRow.id] = {
        ...(logRow as unknown as SmokeLogData),
        flavor_tag_names: (logRow.flavor_tag_ids ?? [])
          .map((id) => tagNameMap[id])
          .filter(Boolean) as string[],
        author_display_name: author?.display_name ?? null,
        author_city:         null,
      };
    }
  }

  /* ── 5. Vote tallies for feedback posts in this batch ─────────── */
  const feedbackPostIds = feedbackCategoryId
    ? batch.filter((p) => p.category_id === feedbackCategoryId).map((p) => p.id)
    : [];
  const voteMap: Record<string, { upvotes: number; downvotes: number; userVote: 0 | 1 | -1 }> = {};
  if (feedbackPostIds.length > 0) {
    const { data: votes } = await supabase
      .from("forum_post_votes")
      .select("post_id, user_id, value")
      .in("post_id", feedbackPostIds);
    for (const v of (votes ?? []) as { post_id: string; user_id: string; value: number }[]) {
      const cur = voteMap[v.post_id] ?? { upvotes: 0, downvotes: 0, userVote: 0 as 0 | 1 | -1 };
      if (v.value === 1)  cur.upvotes   += 1;
      if (v.value === -1) cur.downvotes += 1;
      if (v.user_id === userId) cur.userVote = v.value as 1 | -1;
      voteMap[v.post_id] = cur;
    }
  }

  /* ── 6. Normalize ─────────────────────────────────────────────── */
  const posts: PostItem[] = batch.map((p) => {
    const v = voteMap[p.id] ?? { upvotes: 0, downvotes: 0, userVote: 0 as 0 | 1 | -1 };
    return {
      id:            p.id,
      title:         p.title,
      content:       p.content,
      created_at:    p.created_at,
      user_id:       p.user_id,
      category_id:   p.category_id ?? null,
      author:        p.user_id ? (nameMap[p.user_id] ?? null) : null,
      like_count:    p.forum_post_likes[0]?.count ?? 0,
      comment_count: p.forum_comments[0]?.count   ?? 0,
      image_url:     p.image_url ?? null,
      is_locked:     p.is_locked,
      is_system:     p.is_system,
      smoke_log:     p.smoke_log_id ? (smokeLogMap[p.smoke_log_id] ?? null) : null,
      upvotes:       v.upvotes,
      downvotes:     v.downvotes,
      user_vote:     v.userVote,
      status:        (p.status === "closed" ? "closed" : "open") as "open" | "closed",
    };
  });

  return {
    posts,
    likedIds: [...likedSet],
    hasMore:  batch.length >= pageSize,
  };
}
```

Add the `log` import at the top of the file (after the existing imports):

```typescript
import { log } from "@/lib/log";
```

- [ ] **Step 5: Run tests + type-check**

Run: `npx vitest run lib/ && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/data/lounge-fetchers.ts lib/data/__tests__/lounge-fetchers.test.ts components/lounge/InlinePost.tsx
git commit -m "feat: unified lounge feed fetcher with hot RPC + newest-first fallback"
```

---

### Task 5: Extract `PostComments` from `InlinePost` (behavior-preserving refactor)

**Files:**
- Create: `components/lounge/PostComments.tsx`
- Modify: `components/lounge/InlinePost.tsx` (replace the inline comments block + `CommentNode` with the extracted component)

**Interfaces:**
- Produces: `PostComments({ postId: string; userId: string; isLocked: boolean; onCountChange?: (delta: number) => void })` — loads all comments for the post on mount, renders composer + threaded list with edit/delete/reply. `onCountChange` fires `+1` per added comment/reply, `-1` per deletion (replies removed by cascade count as one). Used by `InlinePost` (comments toggle) and by the fullscreen burn-report modal (Task 7).

- [ ] **Step 1: Create `components/lounge/PostComments.tsx`**

Move these pieces out of `components/lounge/InlinePost.tsx`, verbatim except where noted:
- the `Comment` interface (lines 50-63) — export it
- the `Avatar` helper (lines 90-101) — copy (InlinePost keeps its own)
- `relativeTime` (lines 86-88) — copy
- the `CommentNode` component (lines 223-352) — move unchanged
- the comments-loading `useEffect` (lines 403-445), `handleComment` (499-518), `handleDeleteComment` (520-523), `handleEditSave` (525-527), `handleReplyCreated` (529-532), and the `topLevel`/`repliesByParent` memo (554-567) — move into the new component
- the rendered comments block (the JSX between `{commentsLoading ? ... }` at lines 876-939) — becomes the new component's render

The new file's skeleton (the moved bodies fill in the marked sections):

```typescript
"use client";

/*
 * PostComments — the lounge comment machinery, extracted from
 * InlinePost so the same composer + threaded list renders in two
 * places: inline under a feed card (mounted when the comments toggle
 * opens) and inside the fullscreen burn-report modal.
 *
 * Loads every comment for the post on mount — callers control
 * lazy-loading by mounting the component on demand (InlinePost only
 * mounts it when commentsOpen flips true, preserving the previous
 * load-on-first-open behavior).
 */

import { useState, useEffect, useMemo, memo } from "react";
import { createClient }        from "@/utils/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { AvatarFrame }         from "@/components/ui/AvatarFrame";
import { resolveBadge }        from "@/lib/badge";
import { log }                 from "@/lib/log";

export interface Comment {
  id:                string;
  content:           string;
  created_at:        string;
  updated_at:        string;
  user_id:           string;
  parent_comment_id: string | null;
  profiles: {
    display_name:    string | null;
    avatar_url:      string | null;
    badge:           string | null;
    membership_tier: string | null;
  } | null;
}

interface PostCommentsProps {
  postId:         string;
  userId:         string;
  isLocked:       boolean;
  onCountChange?: (delta: number) => void;
}

/* [relativeTime + Avatar helpers copied here]  */
/* [CommentNode moved here unchanged]           */

export function PostComments({ postId, userId, isLocked, onCountChange }: PostCommentsProps) {
  const supabase = useMemo(() => createClient(), []);
  const [comments,          setComments]          = useState<Comment[] | null>(null);
  const [commentsLoading,   setCommentsLoading]   = useState(true);
  const [commentText,       setCommentText]       = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError,      setCommentError]      = useState<string | null>(null);

  /* [comments-loading useEffect moved here — condition becomes
      `if (comments !== null) return;` (no commentsOpen), and the
      log scope becomes "lounge:post-comments"] */

  /* [handleComment moved here — on success additionally calls
      onCountChange?.(1)] */

  /* [handleDeleteComment moved here — calls onCountChange?.(-1)] */
  /* [handleEditSave, handleReplyCreated moved here — reply-created
      additionally calls onCountChange?.(1)] */
  /* [topLevel/repliesByParent memo moved here unchanged] */

  return (
    <div>
      {/* [the JSX previously rendered inside InlinePost's comments
          block: loading spinner OR (composer when !isLocked, empty
          state, threaded CommentNode list) — unchanged markup] */}
    </div>
  );
}
```

Concrete deltas from the moved code (everything else is verbatim):
- `post.id` → `postId`, `post.is_locked` → `isLocked` throughout.
- `setCommentCount((n) => n + 1)` → `onCountChange?.(1)`; `setCommentCount((n) => Math.max(0, n - 1))` → `onCountChange?.(-1)`.
- The loading effect runs on mount: `useEffect(() => { if (comments !== null) return; ... }, [comments, postId, supabase])`.

- [ ] **Step 2: Rewire `InlinePost` to use it**

In `components/lounge/InlinePost.tsx`:
- Delete the moved code (Comment interface, CommentNode, comments state/effect/handlers, the inline comments JSX). Keep `commentsOpen` and `commentCount` state.
- Add import: `import { PostComments } from "./PostComments";`
- Replace the inline-comments block (previously `{!previewMode && commentsOpen && (...)}`) with:

```tsx
      {/* Inline comments */}
      {commentsOpen && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px 16px" }}>
          <PostComments
            postId={post.id}
            userId={userId}
            isLocked={post.is_locked}
            onCountChange={(delta) => setCommentCount((n) => Math.max(0, n + delta))}
          />
        </div>
      )}
```

(Keep the `!previewMode` guard for now if previewMode still exists at this point — it is removed in Task 7. If editing both in one pass is simpler, do Tasks 5-7 as sequential commits anyway so each diff stays reviewable.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx vitest run lib/`
Expected: clean. Then `npm run build` for the route-level check.

- [ ] **Step 4: Commit**

```bash
git add components/lounge/PostComments.tsx components/lounge/InlinePost.tsx
git commit -m "refactor: extract PostComments from InlinePost for reuse in fullscreen reports"
```

---

### Task 6: First photo on the condensed burn card

**Files:**
- Modify: `components/humidor/BurnReportPreviewCard.tsx`

**Interfaces:**
- Produces: `BurnReportPreviewCardProps` gains `photoUrl?: string | null`. When set, the photo renders below the 4-cell rating stripe; when null/absent the card is unchanged (spec: omitted when the report has no photos).

- [ ] **Step 1: Add the prop and render block**

Add to `BurnReportPreviewCardProps`:

```typescript
  /* First report photo, rendered below the rating stripe. Omitted
     entirely when null (reports without photos keep the compact card). */
  photoUrl?: string | null;
```

Add `photoUrl = null` to the destructured props. Add the import at the top:

```typescript
import Image from "next/image";
```

After the stripe `<div>` (the `repeat(4, 1fr)` grid, lines 283-294), inside the `<button>`, add:

```tsx
      {photoUrl && (
        <div
          style={{
            position:     "relative",
            height:       165,
            margin:       "0 10px 10px",
            borderRadius: 6,
            overflow:     "hidden",
            border:       "1px solid var(--line-soft)",
          }}
        >
          <Image
            src={photoUrl}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 560px"
            quality={78}
            style={{ objectFit: "cover" }}
          />
        </div>
      )}
```

- [ ] **Step 2: Verify existing call sites unaffected**

Run: `npx tsc --noEmit`
Expected: clean (prop is optional; humidor burn-reports list keeps its current look).

- [ ] **Step 3: Commit**

```bash
git add components/humidor/BurnReportPreviewCard.tsx
git commit -m "feat: optional first-photo strip on the condensed burn report card"
```

---

### Task 7: InlinePost feed behavior (category tag, fullscreen burn report with comments, drop previewMode)

**Files:**
- Modify: `components/lounge/InlinePost.tsx`

**Interfaces:**
- Consumes: `PostComments` (Task 5), `BurnReportPreviewCard.photoUrl` (Task 6).
- Produces: `InlinePost` props become:

```typescript
interface Props {
  post:             PostItem;
  initialLiked:     boolean;
  userId:           string;
  isFeedback:       boolean;
  isFounder?:       boolean;
  onDelete:         (postId: string) => void;
  onClose?:         (postId: string) => void;
  /* Category tag chip (All view only). Rendered in the author row;
     tapping it activates that category's chip in the feed. */
  categoryTag?:     string | null;
  onCategoryTagTap?: () => void;
}
```

`previewMode` is removed (its only callers, the room feeds, are deleted in Task 12; `PinnedPostCard` never passed it).

- [ ] **Step 1: Update the Props interface** — replace `previewMode?: boolean;` (and its comment) with the `categoryTag` / `onCategoryTagTap` entries shown above. Remove `previewMode = false` from the destructure and delete the `isTextPreview` constant.

- [ ] **Step 2: BurnReportCard — always fullscreen, with comments**

Replace `BurnReportCardProps` and the component's routing logic:

```typescript
interface BurnReportCardProps {
  log:          SmokeLogData;
  postAuthorId: string | null;
  viewerId:     string;
  /* Post identity for the comments section inside the fullscreen view. */
  postId:       string;
  postLocked:   boolean;
}
```

Inside `BurnReportCard`:
- Delete the `useRouter` import usage, `previewMode`, `postId`-routing branch, and the `handleTap` conditional. Tap always opens the modal: `onTap={() => setExpanded(true)}`.
- Lightbox always active: `const lightbox = usePhotoLightbox(photoUrls);`
- Pass the first photo to the preview card: add `photoUrl={photoUrls[0] ?? null}` to `<BurnReportPreviewCard ... />`.
- Render the modal unconditionally (no `!previewMode &&`), and extend `belowCard`:

```tsx
          belowCard={
            <>
              {canWishlist && (
                <AddCigarToWishlistButton
                  cigarId={log.cigar_id as string}
                  userId={viewerId}
                />
              )}
              <div style={{ marginTop: 24, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
                <h3
                  style={{
                    fontFamily:    "var(--font-mono)",
                    fontSize:      10,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color:         "var(--paper-dim)",
                    margin:        "0 0 12px",
                  }}
                >
                  Comments
                </h3>
                <PostComments postId={postId} userId={viewerId} isLocked={postLocked} />
              </div>
            </>
          }
```

- [ ] **Step 3: Author row — category tag chip**

In the author-row actions cluster (next to the existing `Burn Report` chip, before the feedback status chip), add:

```tsx
            {categoryTag && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onCategoryTagTap?.(); }}
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background:              "rgba(212,160,74,0.1)",
                  color:                   "var(--gold,#D4A04A)",
                  border:                  "1px solid rgba(212,160,74,0.22)",
                  cursor:                  onCategoryTagTap ? "pointer" : "default",
                  touchAction:             "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  whiteSpace:              "nowrap",
                }}
              >
                {categoryTag}
              </button>
            )}
```

- [ ] **Step 4: Title + body — remove preview branches, keep detail deep link**

Replace the title/body conditional (the `post.smoke_log ? (previewMode ? ... ) : isTextPreview ? ... : ...` tree) with:

```tsx
        {post.smoke_log ? (
          <>
            <h2 className="font-serif font-semibold text-base leading-snug mb-2" style={{ color: "var(--foreground)" }}>
              {post.title}
            </h2>
            <BurnReportCard
              log={post.smoke_log}
              postAuthorId={post.user_id}
              viewerId={userId}
              postId={post.id}
              postLocked={post.is_locked}
            />
          </>
        ) : (
          <>
            <Link
              href={`/lounge/${post.id}`}
              prefetch={false}
              style={{ display: "block", textDecoration: "none", color: "inherit" }}
            >
              <h2 className="font-serif font-semibold text-base leading-snug mb-2" style={{ color: "var(--foreground)" }}>
                {post.title}
              </h2>
            </Link>
            <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)", whiteSpace: "pre-line", opacity: 0.9 }}>
              {post.content}
            </p>

            {post.image_url && (
              <button type="button" onClick={() => post.image_url && postImageLightbox.open(post.image_url)}
                className="mt-3 rounded-xl overflow-hidden block relative"
                style={{ width: "100%", height: 260, border: "none", padding: 0, cursor: "pointer", touchAction: "manipulation" }}
                aria-label="View image">
                <Image
                  src={post.image_url}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 100vw, 600px"
                  quality={78}
                  style={{ objectFit: "cover", display: "block" }}
                />
              </button>
            )}
          </>
        )}
```

- [ ] **Step 5: Action bar — remove the preview counts row**

Delete the `previewMode ? (<Link ... Read more →</Link>) : (...)` wrapper; keep only the like/vote + comments-toggle bar (the previous non-preview branch) rendered unconditionally. Remove the now-unused `useRouter` import if nothing else references it (like handlers still use `supabase`; `router` was only used by the deleted preview paths — verify with a grep before removing).

- [ ] **Step 6: Verify + commit**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `components/lounge/CategoryFeed.tsx` (it still passes `previewMode`). Fix by deleting the `previewMode={...}` prop lines 370-374 in `CategoryFeed.tsx` (the room feed becomes full-render for its last days of life; it is deleted in Task 12). Re-run until clean.

```bash
git add components/lounge/InlinePost.tsx components/lounge/CategoryFeed.tsx
git commit -m "feat: feed-ready InlinePost (category tag, fullscreen burn report with comments)"
```

---

### Task 8: Extract `RulesModal`

**Files:**
- Create: `components/lounge/RulesModal.tsx`
- Modify: `components/lounge/LoungeForumClient.tsx` (import instead of local definition)

**Interfaces:**
- Produces: `RulesModal({ rulesPost: { id: string; title: string; content: string }; userId: string; initialLiked: boolean; initialCount: number; onClose: () => void; onAgreed?: () => void })`. Identical UI to the current in-file modal (`LoungeForumClient.tsx:65-173`), plus `onAgreed` fired after a successful agree insert (used by the composer gate in Task 10).

- [ ] **Step 1: Create the file** — move `RulesModal` and its `FlameIcon` dependency verbatim from `LoungeForumClient.tsx` into `components/lounge/RulesModal.tsx` with `"use client"`, the imports it needs (`useState, useEffect, useMemo`, `createPortal`, `createClient`), and the `RulesPost` interface. One functional delta in `handleAgree` — after the successful insert path:

```typescript
  async function handleAgree() {
    if (liking || liked) return;
    setLiking(true);
    setLiked(true);
    setLocalCount(c => c + 1);
    const { error } = await supabase.from("forum_post_likes").insert({ user_id: userId, post_id: rulesPost.id });
    if (error && error.code !== "23505") {
      setLiked(false);
      setLocalCount(c => c - 1);
    } else {
      onAgreed?.();
    }
    setLiking(false);
  }
```

Export both the component and the `RulesPost` interface.

- [ ] **Step 2: Update `LoungeForumClient.tsx`** — delete the local `RulesModal` definition and add `import { RulesModal } from "./RulesModal";` (the local `FlameIcon` stays; the locked view still uses it).

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add components/lounge/RulesModal.tsx components/lounge/LoungeForumClient.tsx
git commit -m "refactor: extract RulesModal for reuse by the composer gate"
```

---

### Task 9: Composer — dynamic category dropdown + burn-report explainer

**Files:**
- Modify: `components/lounge/NewPostSheet.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `NewPostSheet` props become:

```typescript
interface Category {
  id:           string;
  name:         string;
  is_locked:    boolean;
  slug?:        string;
  is_feedback?: boolean;
}

interface Props {
  categories:         Category[];
  userId:             string;
  initialCategoryId?: string;
  onCreated:          (categoryId: string) => void;
  onClose:            () => void;
}
```

The `isFeedback` prop is REMOVED — feedback mode is derived from the selected category. All current callers (`LoungeForumClient`, `CategoryFeed`) are updated minimally here and deleted in Task 12.

- [ ] **Step 1: Derive mode from the selected category**

In `NewPostSheet`:
- Update the `Category` interface and `Props` as above; remove `isFeedback` from the destructure.
- After the `categoryId` state, add:

```typescript
  const selected   = categories.find((c) => c.id === categoryId) ?? null;
  const isFeedback = !!selected?.is_feedback;
  const isBurn     = selected?.slug === "burn-reports";
  const router     = useRouter();
```

Add `import { useRouter } from "next/navigation";` at the top.
- In `handleSubmit`, replace `const targetCategoryId = isFeedback ? (initialCategoryId ?? "") : categoryId;` with `const targetCategoryId = categoryId;` and add an early return `if (isBurn) return;`.
- Update `canSubmit`: `const canSubmit = !isBurn && title.trim().length > 0 && content.trim().length > 0 && categoryId.length > 0;`
- Category picker condition changes from `{!isFeedback && categories.length > 1 && (` to `{categories.length > 1 && (` (the unified composer shows the dropdown with all three options; feedback type chips appear below it when the Feedback category is selected).

- [ ] **Step 2: Burn Reports explainer**

Wrap the title/content/photo sections so they hide when `isBurn`, and add the explainer in their place (inside `bodySlot`, after the category picker):

```tsx
            {isBurn && (
              <div
                className="rounded-xl p-4"
                style={{ backgroundColor: "rgba(61,46,35,0.35)", border: "1px solid var(--border)" }}
              >
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)", fontFamily: "var(--font-serif)" }}>
                  Burn reports start from a logged smoke.
                </p>
                <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                  Head to your humidor, pick the cigar, and share the report from there.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/humidor")}
                  className="w-full rounded-xl font-semibold text-sm"
                  style={{
                    height:                  48,
                    background:              "linear-gradient(135deg, #D4A04A, #C17817)",
                    color:                   "#1A1210",
                    border:                  "none",
                    cursor:                  "pointer",
                    touchAction:             "manipulation",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  Log a Smoke in the Humidor
                </button>
              </div>
            )}
```

Guard the existing sections: feedback type chips stay `{isFeedback && (...)}`; title and content blocks become `{!isBurn && (...)}`; the photo block becomes `{!isFeedback && !isBurn && (...)}`. Hide the footer submit button when `isBurn` (in `footerSlot`, render `null` for the button: wrap the `<button>` in `{!isBurn && (...)}`).

- [ ] **Step 3: Patch the two legacy callers minimally**

In `LoungeForumClient.tsx` and `CategoryFeed.tsx`, delete the `isFeedback={...}` prop from their `<NewPostSheet ... />` calls (both files are deleted in Task 12; this just keeps the tree green).

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

```bash
git add components/lounge/NewPostSheet.tsx components/lounge/LoungeForumClient.tsx components/lounge/CategoryFeed.tsx
git commit -m "feat: composer category dropdown with feedback mode + burn-report explainer"
```

---

### Task 10: `LoungeFeedClient` — the unified feed

**Files:**
- Create: `components/lounge/LoungeFeedClient.tsx`

**Interfaces:**
- Consumes: `chips.ts` helpers (Task 2), `keyFor.loungeFeed` (Task 3), `fetchLoungeFeedPage` (Task 4), `InlinePost` with `categoryTag` (Task 7), `RulesModal` with `onAgreed` (Task 8), `NewPostSheet` (Task 9), `PinnedPostCard` (unchanged), `ForumCategory` from `lib/data/forum`.
- Produces: `LoungeFeedClient(props)` consumed by the island in Task 11:

```typescript
interface Props {
  categories:     ForumCategory[];
  pinnedPosts:    PostItem[];              // all non-system pinned posts, every category
  initialPage:    CategoryFeedPage | null; // page-0 seed for (initialChip, initialView); null for hot deep links
  initialChip:    ChipValue;
  initialView:    string;
  rulesPost:      { id: string; title: string; content: string } | null;
  hasUnlocked:    boolean;
  agreementCount: number;
  userId:         string;
  isFounder:      boolean;
}
```

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState, useMemo } from "react";
import useSWRInfinite         from "swr/infinite";
import { useSearchParams }    from "next/navigation";
import dynamic                from "next/dynamic";
import { InlinePost }         from "./InlinePost";
import { PinnedPostCard }     from "./PinnedPostCard";
import { RulesModal }         from "./RulesModal";
import type { PostItem }      from "./InlinePost";
import { keyFor }                     from "@/lib/data/keys";
import { fetchLoungeFeedPage }        from "@/lib/data/lounge-fetchers";
import type { CategoryFeedPage }      from "@/lib/data/lounge-fetchers";
import {
  CHIPS,
  parseChip,
  parseView,
  categorySlugForChip,
  chipForCategorySlug,
  feedParamsForView,
  type ChipValue,
} from "@/lib/lounge/chips";
import type { ForumCategory } from "@/lib/data/forum";
import { Toast }              from "@/components/ui/toast";
import { ScrollCarets }       from "@/components/ui/ScrollCarets";
import { RefreshButton }      from "@/components/ui/RefreshButton";

/* NewPostSheet only mounts when the user taps "+ New Post". */
const NewPostSheet = dynamic(
  () => import("./NewPostSheet").then((m) => ({ default: m.NewPostSheet })),
  { ssr: false },
);

const PAGE_SIZE = 15;
/* Stacked sticky header: title row 56 + chip row 52 + secondary row 40. */
const TITLE_H     = 56;
const CHIPS_H     = 52;
const SECONDARY_H = 40;
const HEADER_H    = TITLE_H + CHIPS_H + SECONDARY_H;

interface RulesPost {
  id:      string;
  title:   string;
  content: string;
}

interface Props {
  categories:     ForumCategory[];
  pinnedPosts:    PostItem[];
  initialPage:    CategoryFeedPage | null;
  initialChip:    ChipValue;
  initialView:    string;
  rulesPost:      RulesPost | null;
  hasUnlocked:    boolean;
  agreementCount: number;
  userId:         string;
  isFounder:      boolean;
}

export function LoungeFeedClient({
  categories, pinnedPosts: initialPinnedPosts, initialPage, initialChip,
  initialView, rulesPost, hasUnlocked, agreementCount, userId, isFounder,
}: Props) {
  const searchParams = useSearchParams();

  /* URL is the source of truth for chip + view. Chip taps write via
     window.history.pushState — Next syncs useSearchParams on native
     pushState (shallow: no server component re-render), and the back
     button walks chip history as the spec requires. */
  const chip           = parseChip(searchParams.get("c"));
  const isFeedbackChip = chip === "feedback";
  const view           = parseView(searchParams.get("v"), isFeedbackChip);
  const { filter, sort } = feedParamsForView(view);

  const idBySlug = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.slug, c.id])) as Record<string, string>,
    [categories],
  );
  const slugById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.slug])) as Record<string, string>,
    [categories],
  );

  const activeSlug         = categorySlugForChip(chip);
  const activeCategoryId   = activeSlug ? (idBySlug[activeSlug] ?? null) : null;
  const feedbackCategoryId = idBySlug["product-feedback"] ?? null;

  function pushUrl(nextChip: ChipValue, nextView: string | null) {
    const params = new URLSearchParams();
    if (nextChip !== "all") params.set("c", nextChip);
    if (nextView)           params.set("v", nextView);
    const qs = params.toString();
    window.history.pushState(null, "", qs ? `/lounge?${qs}` : "/lounge");
  }

  function handleChipTap(next: ChipValue) {
    if (next === chip) return;
    /* Chip change resets the secondary row to its default view. */
    pushUrl(next, null);
  }

  function handleViewTap(next: string) {
    const isDefault = next === (isFeedbackChip ? "open" : "new");
    pushUrl(chip, isDefault ? null : next);
  }

  /* ---- Feed (SWR infinite) ---------------------------------------- */

  const seedMatches =
    initialPage != null && chip === initialChip && view === initialView;

  const {
    data,
    size,
    setSize,
    isValidating,
    mutate: mutateFeed,
  } = useSWRInfinite<CategoryFeedPage>(
    (pageIndex, prev) => {
      if (prev && !prev.hasMore) return null;
      return keyFor.loungeFeed(activeCategoryId, pageIndex, userId, filter, sort);
    },
    ([, , pageIndex]) =>
      fetchLoungeFeedPage({
        categoryId:         activeCategoryId,
        feedbackCategoryId,
        userId,
        pageIndex:          pageIndex as number,
        pageSize:           PAGE_SIZE,
        filter,
        sort,
      }),
    {
      /* fallbackData seeds only the server-rendered (chip, view) —
         any other combination is a different key set and fetches
         fresh. Same pattern the per-room feed used. */
      fallbackData:        seedMatches ? [initialPage as CategoryFeedPage] : undefined,
      revalidateOnMount:   !seedMatches,
      revalidateFirstPage: false,
    },
  );

  const pages    = useMemo(
    () => data ?? (seedMatches ? [initialPage as CategoryFeedPage] : []),
    [data, seedMatches, initialPage],
  );
  const posts    = useMemo(() => pages.flatMap((p) => p.posts), [pages]);
  const likedIds = useMemo(() => new Set(pages.flatMap((p) => p.likedIds)), [pages]);
  const hasMore  = pages[pages.length - 1]?.hasMore ?? false;
  const loading  = isValidating;

  /* ---- Pinned posts ------------------------------------------------ */
  /* Rendered only when a specific category chip is active (All stays
     clean, per spec). Local state so optimistic delete works. */
  const [pinnedPosts, setPinnedPosts] = useState<PostItem[]>(initialPinnedPosts);
  const visiblePinnedPosts = useMemo(() => {
    if (!activeCategoryId) return [];
    const inCategory = pinnedPosts.filter((p) => p.category_id === activeCategoryId);
    return filter === "mine" ? inCategory.filter((p) => p.user_id === userId) : inCategory;
  }, [pinnedPosts, activeCategoryId, filter, userId]);

  /* ---- Composer + rules gate --------------------------------------- */

  const [unlocked,       setUnlocked]       = useState(hasUnlocked);
  const [showRules,      setShowRules]      = useState(false);
  const [pendingCompose, setPendingCompose] = useState(false);
  const [showNewPost,    setShowNewPost]    = useState(false);
  const [toast,          setToast]          = useState<string | null>(null);

  const composerCategories = useMemo(
    () =>
      (["general-discussion", "burn-reports", "product-feedback"] as const)
        .map((slug) => categories.find((c) => c.slug === slug))
        .filter((c): c is ForumCategory => !!c && !c.is_locked && !c.is_gate)
        .map((c) => ({
          id:          c.id,
          name:        c.name,
          is_locked:   c.is_locked,
          slug:        c.slug,
          is_feedback: c.is_feedback,
        })),
    [categories],
  );

  const composerInitialId =
    activeCategoryId ?? idBySlug["general-discussion"] ?? composerCategories[0]?.id ?? "";

  function showToast(msg: string) {
    setToast(null);
    requestAnimationFrame(() => setToast(msg));
  }

  function handleNewPost() {
    /* Agree-before-posting: the rules gate triggers from the composer
       (detached from the old Welcome room). Reading the feed is open. */
    if (!unlocked && rulesPost) {
      setPendingCompose(true);
      setShowRules(true);
      return;
    }
    setShowNewPost(true);
  }

  function handleCreated(categoryId: string) {
    setShowNewPost(false);
    showToast("Post created.");
    const slug       = slugById[categoryId];
    const targetChip = slug ? chipForCategorySlug(slug) : null;
    if (targetChip && targetChip !== chip) {
      /* Jump to the new post's chip; the fresh key fetches from the top. */
      pushUrl(targetChip, null);
    } else {
      mutateFeed();
    }
  }

  /* ---- Optimistic list mutations ----------------------------------- */

  function handleDeletePost(postId: string) {
    mutateFeed(
      pages.map((page) => ({ ...page, posts: page.posts.filter((p) => p.id !== postId) })),
      { revalidate: false },
    );
    setPinnedPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  function handleClosePost(postId: string) {
    /* Remove from the "open" feedback view; other views keep the post
       (its status chip re-renders on next revalidation). */
    if (filter !== "open") return;
    mutateFeed(
      pages.map((page) => ({ ...page, posts: page.posts.filter((p) => p.id !== postId) })),
      { revalidate: false },
    );
  }

  function loadMore() {
    if (loading || !hasMore) return;
    setSize(size + 1);
  }

  const secondaryOptions: { value: string; label: string }[] = isFeedbackChip
    ? [
        { value: "open",   label: "Open" },
        { value: "closed", label: "Closed" },
        { value: "mine",   label: "My posts" },
      ]
    : [
        { value: "new",  label: "New" },
        { value: "hot",  label: "Hot" },
        { value: "mine", label: "My Posts" },
      ];

  /* ---- Render ------------------------------------------------------ */

  return (
    <div style={{ minHeight: "100dvh", backgroundColor: "var(--background)", paddingBottom: "calc(72px + env(safe-area-inset-bottom))" }}>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      <ScrollCarets />

      {/* Fixed stacked header: title / chips / secondary */}
      <div
        style={{
          position:             "fixed",
          top:                  0,
          left:                 "var(--app-content-left)",
          right:                0,
          zIndex:               40,
          backgroundColor:      "rgba(26,18,16,0.97)",
          backdropFilter:       "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom:         "1px solid var(--border)",
        }}
      >
        {/* Row 1 — title + New Post */}
        <div className="flex items-center px-4 md:max-w-[50%] md:mx-auto" style={{ height: TITLE_H, gap: 12 }}>
          <h1 className="font-serif text-xl font-semibold flex-1" style={{ color: "var(--foreground)" }}>
            The Lounge
          </h1>
          <button
            type="button"
            onClick={handleNewPost}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{
              background:              "linear-gradient(135deg,#D4A04A,#C17817)",
              color:                   "#1A1210",
              border:                  "none",
              cursor:                  "pointer",
              touchAction:             "manipulation",
              WebkitTapHighlightColor: "transparent",
              flexShrink:              0,
            }}
          >
            + New Post
          </button>
        </div>

        {/* Row 2 — category chips (horizontally scrollable) */}
        <div
          className="flex items-center gap-2 px-4 md:max-w-[50%] md:mx-auto"
          style={{ height: CHIPS_H, overflowX: "auto", scrollbarWidth: "none" }}
        >
          {CHIPS.map((c) => {
            const active = c.value === chip;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => handleChipTap(c.value)}
                className="rounded-full text-xs font-semibold"
                style={{
                  flexShrink:              0,
                  padding:                 "7px 14px",
                  border:                  active ? "1px solid rgba(232,100,44,0.55)" : "1px solid var(--border)",
                  background:              active ? "rgba(232,100,44,0.14)" : "rgba(36,28,23,0.6)",
                  color:                   active ? "var(--ember,#E8642C)" : "var(--muted-foreground)",
                  cursor:                  "pointer",
                  touchAction:             "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  transition:              "background 0.15s, border-color 0.15s, color 0.15s",
                }}
                aria-pressed={active}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Row 3 — contextual secondary slot + refresh */}
        <div
          className="flex items-center px-4 md:max-w-[50%] md:mx-auto"
          style={{ height: SECONDARY_H, gap: 22, justifyContent: "space-between" }}
        >
          <div className="flex items-center" style={{ gap: 22 }}>
            {secondaryOptions.map((opt) => {
              const active = opt.value === view;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleViewTap(opt.value)}
                  className="text-xs font-semibold"
                  style={{
                    padding:                 "2px 0 6px",
                    border:                  "none",
                    background:              "transparent",
                    color:                   active ? "var(--gold,#D4A04A)" : "var(--muted-foreground)",
                    borderBottom:            active ? "2px solid var(--gold,#D4A04A)" : "2px solid transparent",
                    cursor:                  "pointer",
                    touchAction:             "manipulation",
                    WebkitTapHighlightColor: "transparent",
                  }}
                  aria-pressed={active}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <RefreshButton
            style={{
              background:              "none",
              border:                  "none",
              color:                   "var(--gold,#D4A04A)",
              padding:                 8,
              borderRadius:            999,
              cursor:                  "pointer",
              touchAction:             "manipulation",
              WebkitTapHighlightColor: "transparent",
              display:                 "flex",
              alignItems:              "center",
              justifyContent:          "center",
              flexShrink:              0,
            }}
            className=""
            onRefresh={async () => { await mutateFeed(); }}
            ariaLabel="Refresh posts"
          />
        </div>
      </div>

      {/* Feed */}
      <div style={{ paddingTop: HEADER_H }}>
        <div className="px-4 pt-3 flex flex-col gap-3 pb-4 w-full md:max-w-[50%] md:mx-auto">
          {visiblePinnedPosts.map((post) => (
            <PinnedPostCard
              key={post.id}
              post={post}
              initialLiked={likedIds.has(post.id)}
              userId={userId}
              isFeedback={post.category_id != null && post.category_id === feedbackCategoryId}
              onDelete={handleDeletePost}
            />
          ))}

          {posts.length === 0 && visiblePinnedPosts.length === 0 && !loading && (
            <div className="text-center py-16">
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                {filter === "mine"
                  ? "You haven't posted here yet."
                  : "Nothing here yet. Be the first."}
              </p>
            </div>
          )}

          {posts.map((post) => {
            const postSlug = post.category_id ? (slugById[post.category_id] ?? null) : null;
            const postChip = postSlug ? chipForCategorySlug(postSlug) : null;
            const tagLabel =
              chip === "all" && postChip
                ? CHIPS.find((c) => c.value === postChip)?.label ?? null
                : null;
            return (
              <InlinePost
                key={post.id}
                post={post}
                initialLiked={likedIds.has(post.id)}
                userId={userId}
                isFeedback={post.category_id != null && post.category_id === feedbackCategoryId}
                isFounder={isFounder}
                onDelete={handleDeletePost}
                onClose={isFeedbackChip ? handleClosePost : undefined}
                categoryTag={tagLabel}
                onCategoryTagTap={postChip ? () => handleChipTap(postChip) : undefined}
              />
            );
          })}

          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loading}
              className="w-full rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
              style={{
                height:      48,
                background:  loading ? "rgba(212,160,74,0.08)" : "rgba(212,160,74,0.1)",
                border:      "1px solid var(--border)",
                color:       loading ? "var(--muted-foreground)" : "var(--gold,#D4A04A)",
                cursor:      loading ? "default" : "pointer",
                touchAction: "manipulation",
              }}
            >
              {loading ? (
                <>
                  <span className="inline-block rounded-full border-2 border-current border-t-transparent animate-spin"
                    style={{ width: 14, height: 14 }} />
                  Loading...
                </>
              ) : "Load More"}
            </button>
          )}
        </div>
      </div>

      {/* Rules gate (from the composer) */}
      {showRules && rulesPost && (
        <RulesModal
          rulesPost={rulesPost}
          userId={userId}
          initialLiked={unlocked}
          initialCount={agreementCount}
          onClose={() => { setShowRules(false); setPendingCompose(false); }}
          onAgreed={() => {
            setUnlocked(true);
            if (pendingCompose) {
              setShowRules(false);
              setPendingCompose(false);
              setShowNewPost(true);
            }
          }}
        />
      )}

      {/* Composer */}
      {showNewPost && (
        <NewPostSheet
          categories={composerCategories}
          initialCategoryId={composerInitialId}
          userId={userId}
          onClose={() => setShowNewPost(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit`
Expected: clean (component not yet mounted anywhere).

```bash
git add components/lounge/LoungeFeedClient.tsx
git commit -m "feat: LoungeFeedClient unified feed (chips, secondary views, URL state)"
```

---

### Task 11: Island, page, and skeleton rewrite

**Files:**
- Modify: `app/(app)/lounge/page.tsx` (searchParams pass-through)
- Rewrite: `app/(app)/lounge/_islands.tsx`
- Rewrite: `app/(app)/lounge/_skeletons.tsx` (`LoungeShellSkeleton` gets the feed shape)

**Interfaces:**
- Consumes: `LoungeFeedClient` (Task 10), chips helpers (Task 2), the enrichment utilities already used by the rooms island (`computeReportNumbers`, `getFlavorTags`, `getBurnReportThirdsTaggedBatch`, `getProfileLite`, `getAllForumCategories`).
- Produces: `LoungeFeedDataIsland({ userId, chipParam, viewParam })`.

- [ ] **Step 1: Rewrite `app/(app)/lounge/page.tsx`**

```tsx
import { Suspense }            from "react";
import { redirect }             from "next/navigation";
import { getServerUser }        from "@/lib/auth/server-user";
import { LoungeFeedDataIsland } from "./_islands";
import { LoungeShellSkeleton }  from "./_skeletons";
import { PullToRefresh }        from "@/components/ui/PullToRefresh";

/*
 * Edge runtime: faster cold start than the Node serverless target.
 * The data island is implicitly dynamic (per-user queries); the shell
 * streams first. Pattern mirrors `app/(app)/home/` and `/humidor/`.
 *
 * ?c=<chip>&v=<view> select the category chip and secondary view.
 * Subsequent chip taps update the URL via shallow pushState (no
 * server round-trip); only full loads (deep link, refresh, PWA
 * resume) pass through here.
 */
export const runtime  = "edge";
export const metadata = { title: "The Lounge — Ash & Ember Society" };

interface Props {
  searchParams: Promise<{ c?: string; v?: string }>;
}

export default async function LoungePage({ searchParams }: Props) {
  const [{ c, v }, user] = await Promise.all([searchParams, getServerUser()]);
  if (!user) redirect("/login");

  return (
    <PullToRefresh>
      <Suspense fallback={<LoungeShellSkeleton />}>
        <LoungeFeedDataIsland userId={user.id} chipParam={c ?? null} viewParam={v ?? null} />
      </Suspense>
    </PullToRefresh>
  );
}
```

- [ ] **Step 2: Rewrite `app/(app)/lounge/_islands.tsx`**

This island merges the old lounge island (rules status) with the rooms island's post enrichment, with a nullable category filter. Full replacement:

```tsx
/*
 * Async server island for the unified Lounge feed.
 *
 * The page shell streams from the edge before this island resolves;
 * Suspense holds LoungeShellSkeleton until the queries below return.
 *
 * Seeds page 0 of the feed for the (chip, view) in the URL when the
 * view is a created_at-desc query. Hot deep links skip the seed —
 * the client fetches through the get_hot_posts RPC on mount.
 *
 * Pattern mirrors `app/(app)/home/_islands.tsx`.
 */

import { createClient }                    from "@/utils/supabase/server";
import { getFlavorTags }                   from "@/lib/data/flavor-tags";
import { computeReportNumbers }            from "@/lib/data/burn-report-number";
import { getBurnReportThirdsTaggedBatch }  from "@/lib/data/burn-report-thirds";
import { LoungeFeedClient }                from "@/components/lounge/LoungeFeedClient";
import type { PostItem }                   from "@/components/lounge/InlinePost";
import type { SmokeLogData }               from "@/components/lounge/PostDetailClient";
import type { CategoryFeedPage }           from "@/lib/data/lounge-fetchers";
import { getAllForumCategories }           from "@/lib/data/forum";
import { getProfileLite }                  from "@/lib/data/profile";
import {
  parseChip,
  parseView,
  categorySlugForChip,
  feedParamsForView,
} from "@/lib/lounge/chips";

const PAGE_SIZE = 15;

interface Props {
  userId:    string;
  chipParam: string | null;
  viewParam: string | null;
}

export async function LoungeFeedDataIsland({ userId, chipParam, viewParam }: Props) {
  const supabase = await createClient();

  const chip = parseChip(chipParam);
  const view = parseView(viewParam, chip === "feedback");
  const { filter, sort } = feedParamsForView(view);

  const allCategories  = await getAllForumCategories();
  const activeSlug     = categorySlugForChip(chip);
  const activeCategory = activeSlug
    ? allCategories.find((c) => c.slug === activeSlug) ?? null
    : null;

  const postSelect =
    "id, title, content, created_at, user_id, category_id, image_url, is_locked, is_system, smoke_log_id, status, " +
    "forum_post_likes(count), forum_comments(count)";

  /* First feed page — only for created_at-desc views. Hot deep links
     seed nothing (the client fetches via the RPC path). */
  let mainQ = null;
  if (sort === "new") {
    let q = supabase
      .from("forum_posts")
      .select(postSelect)
      .eq("is_system", false)
      .neq("is_pinned", true)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (activeCategory)      q = q.eq("category_id", activeCategory.id);
    if (filter === "mine")   q = q.eq("user_id", userId);
    if (filter === "open")   q = q.eq("status", "open");
    if (filter === "closed") q = q.eq("status", "closed");
    mainQ = q;
  }

  /* Phase 1: posts + pinned (all categories) + rules post + profile. */
  const [postsRes, pinnedRes, rulesPostRes, profile] = await Promise.all([
    mainQ ?? Promise.resolve({ data: null }),
    supabase
      .from("forum_posts")
      .select(postSelect)
      .eq("is_system", false)
      .eq("is_pinned", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("forum_posts")
      .select("id, title, content")
      .eq("is_system", true)
      .eq("is_pinned", true)
      .maybeSingle(),
    getProfileLite(userId),
  ]);

  const rulesPost   = rulesPostRes.data ?? null;
  const posts       = (postsRes.data  ?? []) as any[];
  const pinnedPosts = (pinnedRes.data ?? []) as any[];
  const allFetched  = [...pinnedPosts, ...posts];

  const authorIds   = [...new Set(allFetched.map((p) => p.user_id).filter(Boolean) as string[])];
  const postIds     = allFetched.map((p) => p.id) as string[];
  const smokeLogIds = allFetched.map((p) => p.smoke_log_id).filter(Boolean) as string[];

  const feedbackCategory  = allCategories.find((c) => c.is_feedback) ?? null;
  const feedbackPostIds   = feedbackCategory
    ? allFetched.filter((p) => p.category_id === feedbackCategory.id).map((p) => p.id as string)
    : [];

  /* Phase 2: all post-dependent reads + rules agreement in parallel. */
  const [
    profilesRes,
    likesRes,
    smokeLogsRes,
    reportNumberMap,
    flavorTagsList,
    votesRes,
    userAgreedRes,
    totalAgreedRes,
  ] = await Promise.all([
    authorIds.length > 0
      ? supabase
          .from("public_profiles")
          .select("id, display_name, avatar_url, badge, membership_tier")
          .in("id", authorIds)
      : Promise.resolve({ data: null }),
    postIds.length > 0
      ? supabase
          .from("forum_post_likes")
          .select("post_id")
          .eq("user_id", userId)
          .in("post_id", postIds)
      : Promise.resolve({ data: null }),
    smokeLogIds.length > 0
      ? supabase
          .from("smoke_logs")
          .select(`
            id, smoked_at, overall_rating, draw_rating, burn_rating,
            construction_rating, flavor_rating, pairing_drink, pairing_food,
            location, occasion, smoke_duration_minutes, review_text, photo_urls,
            content_video_id, flavor_tag_ids, user_id, cigar_id,
            cigar:cigar_catalog(brand, series, format),
            burn_report:burn_reports(id, thirds_enabled, third_beginning, third_middle, third_end)
          `)
          .in("id", smokeLogIds)
      : Promise.resolve({ data: null }),
    smokeLogIds.length > 0
      ? computeReportNumbers(supabase, smokeLogIds)
      : Promise.resolve({} as Record<string, number>),
    smokeLogIds.length > 0 ? getFlavorTags() : Promise.resolve([]),
    feedbackPostIds.length > 0
      ? supabase
          .from("forum_post_votes")
          .select("post_id, user_id, value")
          .in("post_id", feedbackPostIds)
      : Promise.resolve({ data: null }),
    rulesPost
      ? supabase.from("forum_post_likes").select("*", { count: "exact", head: true })
          .eq("user_id", userId).eq("post_id", rulesPost.id)
      : Promise.resolve({ count: 0 }),
    rulesPost
      ? supabase.from("forum_post_likes").select("*", { count: "exact", head: true })
          .eq("post_id", rulesPost.id)
      : Promise.resolve({ count: 0 }),
  ]);

  /* ---- Profiles: id → display info ---- */
  const nameMap: Record<string, { display_name: string | null; avatar_url: string | null; badge: string | null; membership_tier: string | null }> = {};
  for (const p of profilesRes.data ?? []) {
    nameMap[p.id] = {
      display_name:    p.display_name,
      avatar_url:      p.avatar_url,
      badge:           p.badge           ?? null,
      membership_tier: p.membership_tier ?? null,
    };
  }

  /* ---- Liked post IDs ---- */
  const likedSet = new Set<string>();
  for (const l of likesRes.data ?? []) likedSet.add(l.post_id);

  /* ---- Smoke logs (full burn report data) ---- */
  const smokeLogMap: Record<string, SmokeLogData> = {};
  if (smokeLogsRes.data) {
    const rawLogs = smokeLogsRes.data as Array<Record<string, unknown> & { id: string; flavor_tag_ids: string[] | null; user_id: string | null; burn_report: Array<Record<string, unknown>> | null }>;

    const allTagIds = new Set(rawLogs.flatMap((l) => l.flavor_tag_ids ?? []));
    const tagNameMap: Record<string, string> = {};
    for (const t of flavorTagsList) {
      if (allTagIds.has(t.id)) tagNameMap[t.id] = t.name;
    }

    for (const logRow of rawLogs) {
      const author = logRow.user_id ? nameMap[logRow.user_id as string] : null;
      smokeLogMap[logRow.id] = {
        ...(logRow as unknown as SmokeLogData),
        flavor_tag_names: (logRow.flavor_tag_ids ?? [])
          .map((id) => tagNameMap[id])
          .filter(Boolean) as string[],
        author_display_name: author?.display_name ?? null,
        author_city:         null,
        report_number:       reportNumberMap[logRow.id] ?? null,
      };
    }

    /* Per-third tasting notes for thirds-enabled reports. */
    const burnReportIds: string[] = [];
    const reportIdToSmokeLogId: Record<string, string> = {};
    for (const logRow of rawLogs) {
      const brArr = Array.isArray(logRow.burn_report) ? logRow.burn_report : [];
      const br    = brArr[0] as { id?: string; thirds_enabled?: boolean } | undefined;
      if (br?.id && br.thirds_enabled) {
        burnReportIds.push(br.id);
        reportIdToSmokeLogId[br.id] = logRow.id;
      }
    }
    if (burnReportIds.length > 0) {
      const fullTagMap: Record<string, string> =
        Object.fromEntries(flavorTagsList.map((t) => [t.id, t.name]));
      const taggedByReport = await getBurnReportThirdsTaggedBatch(
        supabase, burnReportIds, fullTagMap,
      );
      for (const [brId, rows] of Object.entries(taggedByReport)) {
        const slid = reportIdToSmokeLogId[brId];
        const cur  = smokeLogMap[slid];
        if (!cur) continue;
        const brArr = Array.isArray(cur.burn_report) ? cur.burn_report : (cur.burn_report ? [cur.burn_report] : []);
        cur.burn_report = brArr.map((b) => ({ ...b, thirds_tagged_rows: rows })) as typeof cur.burn_report;
      }
    }
  }

  /* ---- Vote tallies (feedback posts in the fetched slice) ---- */
  const voteMap: Record<string, { upvotes: number; downvotes: number; userVote: 0 | 1 | -1 }> = {};
  for (const v of (votesRes.data ?? []) as { post_id: string; user_id: string; value: number }[]) {
    const cur = voteMap[v.post_id] ?? { upvotes: 0, downvotes: 0, userVote: 0 as 0 | 1 | -1 };
    if (v.value === 1)  cur.upvotes   += 1;
    if (v.value === -1) cur.downvotes += 1;
    if (v.user_id === userId) cur.userVote = v.value as 1 | -1;
    voteMap[v.post_id] = cur;
  }

  const isFounder = (profile?.assigned_badges ?? []).includes("founder");

  /* ---- Normalize ---- */
  function normalize(p: any): PostItem {
    const v = voteMap[p.id] ?? { upvotes: 0, downvotes: 0, userVote: 0 as 0 | 1 | -1 };
    return {
      id:            p.id,
      title:         p.title,
      content:       p.content,
      created_at:    p.created_at,
      user_id:       p.user_id      ?? null,
      category_id:   p.category_id  ?? null,
      author:        p.user_id ? (nameMap[p.user_id] ?? null) : null,
      like_count:    (p.forum_post_likes as { count: number }[])[0]?.count ?? 0,
      comment_count: (p.forum_comments  as { count: number }[])[0]?.count ?? 0,
      image_url:     p.image_url    ?? null,
      is_locked:     p.is_locked,
      is_system:     p.is_system,
      smoke_log:     p.smoke_log_id ? (smokeLogMap[p.smoke_log_id] ?? null) : null,
      upvotes:       v.upvotes,
      downvotes:     v.downvotes,
      user_vote:     v.userVote,
      status:        (p.status === "closed" ? "closed" : "open") as "open" | "closed",
    };
  }

  const initialPage: CategoryFeedPage | null = mainQ
    ? {
        posts:    posts.map(normalize),
        likedIds: [...likedSet],
        hasMore:  posts.length >= PAGE_SIZE,
      }
    : null;

  return (
    <LoungeFeedClient
      categories={allCategories}
      pinnedPosts={pinnedPosts.map(normalize)}
      initialPage={initialPage}
      initialChip={chip}
      initialView={view}
      rulesPost={rulesPost}
      hasUnlocked={(userAgreedRes.count ?? 0) > 0}
      agreementCount={totalAgreedRes.count ?? 0}
      userId={userId}
      isFounder={isFounder}
    />
  );
}
```

Note: `getForumCategoryStats` is no longer imported — the per-room count queries are gone (spec deletion). The function itself is removed in Task 12.

- [ ] **Step 3: Rewrite `LoungeShellSkeleton` in `app/(app)/lounge/_skeletons.tsx`**

Read the current file first and keep any shared helpers other exports rely on. Replace `LoungeShellSkeleton`'s body with a feed-shaped skeleton (stacked header + chip pills + three card blocks), following the existing skeleton conventions in the file (plain divs, `animate-pulse`, `var(--card)` surfaces):

```tsx
export function LoungeShellSkeleton() {
  return (
    <div style={{ minHeight: "100dvh", backgroundColor: "var(--background)" }}>
      {/* Stacked header placeholder: title + chips + secondary rows */}
      <div
        style={{
          position: "fixed", top: 0, left: "var(--app-content-left)", right: 0,
          zIndex: 40, height: 148, backgroundColor: "rgba(26,18,16,0.97)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="px-4 md:max-w-[50%] md:mx-auto">
          <div className="animate-pulse rounded" style={{ width: 120, height: 22, marginTop: 18, backgroundColor: "var(--card)" }} />
          <div className="flex gap-2" style={{ marginTop: 20 }}>
            {[72, 84, 110, 92].map((w, i) => (
              <div key={i} className="animate-pulse rounded-full" style={{ width: w, height: 30, backgroundColor: "var(--card)" }} />
            ))}
          </div>
          <div className="flex gap-5" style={{ marginTop: 14 }}>
            {[36, 30, 60].map((w, i) => (
              <div key={i} className="animate-pulse rounded" style={{ width: w, height: 14, backgroundColor: "var(--card)" }} />
            ))}
          </div>
        </div>
      </div>

      {/* Feed card placeholders */}
      <div className="px-4 flex flex-col gap-3 w-full md:max-w-[50%] md:mx-auto" style={{ paddingTop: 160 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="animate-pulse rounded-2xl" style={{ height: 150, backgroundColor: "var(--card)", border: "1px solid var(--border)" }} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit && npm run build`
Expected: clean build; `/lounge` compiles on the edge runtime.

```bash
git add "app/(app)/lounge/page.tsx" "app/(app)/lounge/_islands.tsx" "app/(app)/lounge/_skeletons.tsx"
git commit -m "feat: unified lounge feed island with URL-seeded chip and view"
```

---

### Task 12: Room redirects + deletions

**Files:**
- Rewrite: `app/(app)/lounge/rooms/[slug]/page.tsx` (redirect only)
- Delete: `app/(app)/lounge/rooms/[slug]/_islands.tsx`, `app/(app)/lounge/rooms/[slug]/_skeletons.tsx`, `app/(app)/lounge/rooms/[slug]/loading.tsx`
- Delete: `components/lounge/CategoryFeed.tsx`, `components/lounge/LoungeForumClient.tsx`
- Modify: `lib/data/forum.ts` (remove `getForumCategoryStats` + `ForumCategoryStat`)
- Modify: `lib/data/lounge-fetchers.ts` (remove the now-unused `fetchCategoryFeedPage`; keep `fetchFeedbackPosts` and `fetchPostComments` — check importers before touching either)

**Interfaces:**
- Consumes: `roomRedirectQuery` (Task 2).
- Produces: `/lounge/rooms/<slug>` permanently redirects to `/lounge?c=<chip>`; old links and notifications keep working.

- [ ] **Step 1: Rewrite the rooms page as a redirect**

```tsx
import { redirect } from "next/navigation";
import { roomRedirectQuery } from "@/lib/lounge/chips";

/*
 * Rooms no longer exist as destinations — the unified feed's chips
 * replaced them (spec 2026-07-05). This route survives purely so old
 * links, shares, and notifications keep resolving.
 */
export const runtime = "edge";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function LoungeRoomRedirect({ params }: Props) {
  const { slug } = await params;
  redirect(`/lounge${roomRedirectQuery(slug)}`);
}
```

- [ ] **Step 2: Delete dead files**

```bash
git rm "app/(app)/lounge/rooms/[slug]/_islands.tsx" "app/(app)/lounge/rooms/[slug]/_skeletons.tsx" "app/(app)/lounge/rooms/[slug]/loading.tsx"
git rm components/lounge/CategoryFeed.tsx components/lounge/LoungeForumClient.tsx
```

- [ ] **Step 3: Remove dead exports**

- `lib/data/forum.ts`: delete `getForumCategoryStats` and the `ForumCategoryStat` interface (the `get_forum_category_stats` DB function stays; dropping it is not required).
- `lib/data/lounge-fetchers.ts`: delete `fetchCategoryFeedPage` and its `FetchArgs` interface. Before deleting, confirm no importers remain:

```bash
grep -rn "fetchCategoryFeedPage\|getForumCategoryStats\|ForumCategoryStat" app/ components/ lib/ --include="*.ts" --include="*.tsx"
```

Expected: no hits outside the files being edited. Also check `fetchFeedbackPosts` / `FeedbackPost` importers before assuming they are dead — if only deleted files imported them, remove them too; if a live surface (e.g. `PostModal.tsx`) imports them, leave them.

- [ ] **Step 4: Full verify + commit**

Run: `npx tsc --noEmit && npx vitest run lib/ && npm run build`
Expected: all clean.

```bash
git add -A "app/(app)/lounge/rooms" lib/data/forum.ts lib/data/lounge-fetchers.ts
git commit -m "feat: rooms become redirects; delete room directory UI and per-room feeds"
```

---

### Task 13: Final verification + PR

- [ ] **Step 1: Full local gate**

```bash
npx tsc --noEmit && npx vitest run lib/ && npm run build && npm run check:pwa
```
Expected: everything green.

- [ ] **Step 2: Manual on-device checklist (from the spec — Dave verifies in browser/PWA)**

- Chips switch the feed; URL updates (`/lounge?c=burn-reports`); back button walks chip history; share/reload restores state.
- Old room links redirect: `/lounge/rooms/welcome` → `/lounge?c=general`, `/lounge/rooms/burn-reports` → `/lounge?c=burn-reports`, `/lounge/rooms/product-feedback` → `/lounge?c=feedback`.
- Rules gate: a user who never agreed can read the feed; tapping New Post opens the rules modal; agreeing opens the composer.
- Feedback chip: Open | Closed | My posts statuses filter correctly; votes render on feedback posts in the All view.
- Burn report card: first photo shows below the stripe (reports with photos only); tapping opens the fullscreen report; comments work inline on the card AND inside the fullscreen view.
- Hot view: before SQL is applied it silently falls back to New (check console for the `lounge-hot-fallback` warn marker); after SQL, ranking follows recent comment count.
- Composer: active chip preselects the category; Burn Reports selection shows the humidor explainer.

- [ ] **Step 3: PR**

Pre-push gate (hard rule): `gh pr list --head feat/lounge-unified-feed --state all` — confirm no closed/merged PR owns this branch.

```bash
git push -u origin feat/lounge-unified-feed
gh pr create --title "feat: lounge unified feed (rooms → chips)" --body "<summary per repo conventions; include the manual SQL block from Task 1 as a copy-paste section + verify queries; flag SQL apply as a pre-deploy gate for Hot ranking and the Welcome fold-in>"
```

---

## Self-Review (completed at planning time)

- **Spec coverage:** goal/decisions 1-6 → Tasks 2, 4, 7, 10; navigation/URL → Tasks 2, 10, 11, 12; header → Task 10; feed behavior (New/Hot/My Posts, tags, inline comments, burn fullscreen, pinned, rules gate) → Tasks 4, 7, 8, 10; data changes → Task 1; composer → Task 9; deletions → Task 12; performance (one feed query, orphaned SWR keys, lazy NewPostSheet) → Tasks 3, 10, 11; testing → Tasks 2, 3, 4 (unit) + Task 13 (manual); rollout → single PR (decision 1).
- **Known judgment calls surfaced to Dave in the PR/summary:** full-body text posts in the feed (mockup-faithful; old preview clamp removed), welcome category row deleted, reading the lounge no longer requires agreeing to rules (gate moved to composer, per spec).
- **Type consistency check:** `PostItem.category_id` optional everywhere; `fetchLoungeFeedPage` arg names match Task 10's call site; `RulesModal.onAgreed` optional; `NewPostSheet` no longer takes `isFeedback`.

