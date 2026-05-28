# Home Notifications Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible "Notifications" card to the Home dashboard that consolidates new comment activity per thread (one row per post), hides when empty, and clears a row's count when tapped.

**Architecture:** Per-post last-seen timestamp (`notification_views` table). Unseen counts are computed on demand by a `security invoker` Postgres RPC, fetched inside a Suspense island on Home (never blocks LCP). No triggers, no write amplification on comment insert. The card uses SWR for focus revalidation and optimistic mutate on dismiss.

**Tech Stack:** Next.js 16 App Router (edge runtime), React 19, Supabase (`@supabase/ssr`), SWR 2.4, Postgres RPC + RLS.

**Spec:** `docs/superpowers/specs/2026-05-27-notifications-card-design.md`

---

## Testing approach (read before starting)

This repository has **no unit-test runner** (no vitest/jest). The only automated gate is `tsc --noEmit` (mirrors `.github/workflows/ci.yml`); lint is author-responsibility; the Playwright E2E specs are skipped stubs pending an auth fixture that does not exist yet. **Do NOT introduce a test framework for this feature** — that is out of scope and violates the project's smallest-change principle.

Verification per task therefore uses the project's real gates:
- **Typecheck:** `npx tsc --noEmit` after every code change (the CI gate).
- **Lint (new files only):** `npx eslint <file>` — keep new code lint-clean.
- **RPC correctness:** runnable SQL assertions in the Supabase SQL editor (Task 1) — there is no DB test harness, so these are executed manually and the results checked by eye.
- **Manual browser verification:** required by project rules (Task 8), two accounts, at 320/768/1440.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260527_notification_views.sql` | Create | `notification_views` table + RLS + `get_notification_summary()` RPC |
| `lib/data/keys.ts` | Modify | Add `keyFor.notifications(userId)` |
| `lib/data/notifications.ts` | Create | `NotificationSummaryRow` type + `fetchNotificationSummary()` client fetcher |
| `app/api/notifications/dismiss/route.ts` | Create | POST `{ post_id }` → upsert `last_seen_at = now()` |
| `components/dashboard/Notifications.tsx` | Create | The card (client component: SWR + collapse + row tap) |
| `app/(app)/home/_skeletons.tsx` | Modify | Add `NotificationsSkeleton` |
| `app/(app)/home/_islands.tsx` | Modify | Add `NotificationsIsland` (server RPC fetch) |
| `app/(app)/home/page.tsx` | Modify | Insert Suspense island between Smoking Conditions and Aging Shelf |

Build order is dependency order: DB → key+fetcher → route → component → skeleton → island → page wiring → verify.

---

### Task 1: Migration — `notification_views` table + RPC

**Files:**
- Create: `supabase/migrations/20260527_notification_views.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260527_notification_views.sql`:

```sql
-- Migration: 20260527_notification_views
-- Backs the Home "Notifications" card. Stores a per-(user, post)
-- last-seen timestamp; unseen comment counts are computed on demand
-- by get_notification_summary(). No stored counter, no triggers — the
-- card is read only on Home open, so we never pay a write cost on the
-- hot path (posting a comment stays exactly as fast as today).

create table if not exists notification_views (
  user_id      uuid        not null references profiles(id)    on delete cascade,
  post_id      uuid        not null references forum_posts(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

comment on table notification_views is
  'Per-(user, post) last-seen timestamp for the Home notifications
   card. A row is written/updated when the user taps a notification
   row (dismiss). Missing row = never viewed (all comments unseen).
   Composite PK doubles as the upsert conflict target and read index.';

alter table notification_views enable row level security;

-- Supports the hot join in get_notification_summary() below
-- (forum_comments filtered by post_id + created_at). The RPC introduces
-- this access pattern; no prior index covers it.
create index if not exists forum_comments_post_created_idx
  on forum_comments (post_id, created_at);

create policy "users read their own notification views"
  on notification_views for select to authenticated
  using (auth.uid() = user_id);

create policy "users insert their own notification views"
  on notification_views for insert to authenticated
  with check (auth.uid() = user_id);

create policy "users update their own notification views"
  on notification_views for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Read path. security invoker => runs as the caller, so existing RLS
-- on forum_posts / forum_comments still gates readability. auth.uid()
-- scopes every branch to the current user.
create or replace function get_notification_summary()
returns table (
  post_id      uuid,
  title        text,
  unseen_count bigint,
  kind         text,          -- 'authored' | 'participated'
  latest_at    timestamptz
)
language sql
security invoker
stable
as $$
  with my_threads as (
    -- posts I authored
    select fp.id, fp.title, 'authored'::text as kind
    from forum_posts fp
    where fp.user_id = auth.uid()
    union
    -- posts I commented on but did not author (captures replies to me)
    select fp.id, fp.title, 'participated'::text as kind
    from forum_posts fp
    join forum_comments fc on fc.post_id = fp.id
    where fc.user_id = auth.uid()
      and fp.user_id <> auth.uid()
  )
  select
    mt.id,
    mt.title,
    count(c.id)        as unseen_count,
    mt.kind,
    max(c.created_at)  as latest_at
  from my_threads mt
  left join notification_views nv
    on nv.user_id = auth.uid() and nv.post_id = mt.id
  join forum_comments c
    on c.post_id = mt.id
   and c.user_id <> auth.uid()
   and c.created_at > coalesce(nv.last_seen_at, 'epoch'::timestamptz)
   -- Window applies to comment activity, not post age: a long-running
   -- thread with a recent comment still surfaces; a thread whose only
   -- new comments are older than 60 days does not.
   and c.created_at > now() - interval '60 days'
  group by mt.id, mt.title, mt.kind
  having count(c.id) > 0
  order by max(c.created_at) desc
  limit 20;
$$;
```

- [ ] **Step 2: Apply the migration in the Supabase SQL editor**

Open the Supabase SQL editor for project `qagaiuibtwuhihukghyx` and run the full file contents. Expected: "Success. No rows returned." Confirm under Database → Tables that `notification_views` exists with RLS enabled, and under Database → Functions that `get_notification_summary` exists.

> Migration drift is a known recurring issue on this project (migrations are sometimes applied manually and have silently missed prod before). This manual apply step is mandatory — the card's island will throw if the RPC is absent.

- [ ] **Step 3: Verify RPC correctness with SQL assertions**

In the SQL editor, run these assertions one block at a time. Substitute two real `profiles.id` values: `:me` (the viewer) and `:other` (a commenter). Pick a `forum_posts.id` authored by `:me` as `:my_post`.

```sql
-- A. Another user's comment on my post counts as unseen.
insert into forum_comments (user_id, post_id, content, parent_comment_id)
values ('OTHER_UUID', 'MY_POST_UUID', 'test comment 1', null);

-- Expect: one row, kind='authored', unseen_count >= 1.
select * from get_notification_summary();  -- run AS :me (set role / use the SQL editor "run as" if available, else test via the app)

-- B. My own comment does NOT count.
insert into forum_comments (user_id, post_id, content, parent_comment_id)
values ('ME_UUID', 'MY_POST_UUID', 'my own reply', null);
-- Expect: unseen_count unchanged from step A.
select * from get_notification_summary();

-- C. Dismissing clears the count.
insert into notification_views (user_id, post_id, last_seen_at)
values ('ME_UUID', 'MY_POST_UUID', now())
on conflict (user_id, post_id) do update set last_seen_at = now();
-- Expect: zero rows (count drops below the HAVING threshold).
select * from get_notification_summary();

-- Cleanup test data.
delete from forum_comments where content in ('test comment 1', 'my own reply');
delete from notification_views where user_id = 'ME_UUID' and post_id = 'MY_POST_UUID';
```

Note: the SQL editor runs as the service role, where `auth.uid()` is null. To exercise `auth.uid()` properly, the reliable check is the manual browser test in Task 8. These SQL blocks verify the data shape and the dismiss/cleanup mechanics; treat a clean run plus the Task 8 browser test as the combined acceptance for the RPC.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260527_notification_views.sql
git commit -m "feat(db): notification_views table + get_notification_summary RPC"
```

---

### Task 2: SWR key + client fetcher + types

**Files:**
- Modify: `lib/data/keys.ts`
- Create: `lib/data/notifications.ts`

- [ ] **Step 1: Add the SWR key**

In `lib/data/keys.ts`, inside the `keyFor` object, add this entry directly after the `shop:` line (last entry before the closing `} as const;`):

```ts
  /* ── Home notifications card (per-user). Keyed by userId so
   *   switching account on the same browser produces a fresh cache,
   *   not another user's unseen counts. */
  notifications: (userId: string) => ["notifications", userId] as const,
```

- [ ] **Step 2: Create the fetcher + type**

Create `lib/data/notifications.ts`:

```ts
/*
 * Client-side fetcher for the Home notifications card.
 *
 * Calls the get_notification_summary() RPC, which is security-invoker
 * and scoped by auth.uid() — the browser client carries the user's
 * session, so RLS on forum_posts / forum_comments still applies.
 *
 * One row per thread with unseen activity (capped at 20 server-side).
 */

import { createClient } from "@/utils/supabase/client";

export interface NotificationSummaryRow {
  post_id:      string;
  title:        string;
  unseen_count: number;             // bigint from PG; counts are tiny
  kind:         "authored" | "participated";
  latest_at:    string;
}

export async function fetchNotificationSummary(): Promise<NotificationSummaryRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_notification_summary");
  if (error) throw new Error(error.message);
  return (data ?? []) as NotificationSummaryRow[];
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). The new key tuple and the fetcher are fully typed.

- [ ] **Step 4: Commit**

```bash
git add lib/data/keys.ts lib/data/notifications.ts
git commit -m "feat(data): notifications SWR key + get_notification_summary fetcher"
```

---

### Task 3: Dismiss route handler

**Files:**
- Create: `app/api/notifications/dismiss/route.ts`

- [ ] **Step 1: Create the route**

Create `app/api/notifications/dismiss/route.ts`:

```ts
/*
 * POST /api/notifications/dismiss  { post_id: string }
 *
 * Marks a thread's activity as seen for the current user by upserting
 * notification_views.last_seen_at = now(). Idempotent. Called fire-
 * and-forget by the Home notifications card when a row is tapped; the
 * card has already navigated away by the time this resolves.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/utils/supabase/server";
import { getServerUser }             from "@/lib/auth/server-user";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let postId: unknown;
  try {
    ({ post_id: postId } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof postId !== "string" || postId.length === 0) {
    return NextResponse.json({ error: "post_id is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_views")
    .upsert(
      { user_id: user.id, post_id: postId, last_seen_at: new Date().toISOString() },
      { onConflict: "user_id,post_id" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/api/notifications/dismiss/route.ts
git commit -m "feat(api): notifications dismiss route (upsert last_seen_at)"
```

---

### Task 4: Notifications card component

**Files:**
- Create: `components/dashboard/Notifications.tsx`

The chrome mirrors `components/dashboard/AgingAlerts.tsx` exactly (gold mono eyebrow, italic-serif headline, mono View/Hide toggle, collapsible list, same surface tokens). Collapsed by default.

- [ ] **Step 1: Create the component**

Create `components/dashboard/Notifications.tsx`:

```tsx
"use client";

import { useState }   from "react";
import { useRouter }  from "next/navigation";
import useSWR         from "swr";
import { keyFor }     from "@/lib/data/keys";
import { fetchNotificationSummary } from "@/lib/data/notifications";
import type { NotificationSummaryRow } from "@/lib/data/notifications";

/* ------------------------------------------------------------------
   Row copy — singular/plural aware. No em dashes (user-facing).
   ------------------------------------------------------------------ */
function rowCopy(row: NotificationSummaryRow): string {
  const n = Number(row.unseen_count);
  if (row.kind === "participated") {
    return `${n} new repl${n === 1 ? "y" : "ies"} to you`;
  }
  return `${n} new comment${n === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------------------
   Single notification row (expanded only). Tapping clears + navigates.
   ------------------------------------------------------------------ */
function NotificationRow({
  row,
  onTap,
}: {
  row:   NotificationSummaryRow;
  onTap: (postId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onTap(row.post_id)}
      className="w-full flex items-center justify-between gap-3 text-left transition-opacity active:opacity-70"
      style={{
        minHeight:               44,
        touchAction:             "manipulation",
        WebkitTapHighlightColor: "transparent",
        background:              "none",
        border:                  "none",
        padding:                 "10px 0",
        cursor:                  "pointer",
      } as React.CSSProperties}
      aria-label={`${row.title}: ${rowCopy(row)}`}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground truncate">
          {row.title}
        </p>
        <p className="text-sm font-semibold text-foreground truncate leading-snug">
          {rowCopy(row)}
        </p>
      </div>
      <svg
        width="8"
        height="14"
        viewBox="0 0 8 14"
        fill="none"
        aria-hidden="true"
        style={{ flexShrink: 0, color: "var(--gold)" }}
      >
        <path d="M1 1l6 6-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/* ------------------------------------------------------------------
   Notifications — main export.

   Receives initial rows from the server island as fallbackData; SWR
   revalidates on focus and supplies optimistic mutate for dismiss.
   Chrome matches the Aging Shelf; collapsed by default.
   ------------------------------------------------------------------ */
export function Notifications({
  userId,
  initialItems,
}: {
  userId:       string;
  initialItems: NotificationSummaryRow[];
}) {
  const router               = useRouter();
  const [expanded, setExpanded] = useState(false);

  const { data: items = initialItems, mutate } = useSWR(
    keyFor.notifications(userId),
    () => fetchNotificationSummary(),
    { fallbackData: initialItems, revalidateOnMount: false },
  );

  function handleTap(postId: string) {
    // Optimistically drop the tapped row so the count/row vanish with
    // no flicker. On dismiss failure, focus revalidation restores it.
    mutate(
      (current) => (current ?? []).filter((r) => r.post_id !== postId),
      { revalidate: false },
    );
    fetch("/api/notifications/dismiss", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ post_id: postId }),
    }).catch(() => {});
    router.push(`/lounge/${postId}`, { scroll: false });
  }

  // No new activity — hide the section entirely (matches Aging Shelf).
  if (items.length === 0) return null;

  const count = items.length;

  return (
    <section
      className="animate-fade-in"
      style={{
        animationDelay: "140ms",
        position:       "relative",
        border:         "1px solid var(--card-border)",
        borderRadius:   6,
        background:     "var(--card-bg)",
        boxShadow:      "var(--card-edge)",
        padding:        "18px 20px 16px",
        overflow:       "hidden",
      }}
      aria-label="Notifications"
    >
      {/* Radial highlight in top-right */}
      <div
        aria-hidden="true"
        style={{
          position:      "absolute",
          top:           0,
          right:         0,
          width:         140,
          height:        140,
          background:    "radial-gradient(ellipse at top right, rgba(212,160,74,0.16), transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Eyebrow with trailing rule */}
      <div
        style={{
          fontFamily:    "var(--font-mono)",
          fontSize:      10,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          color:         "var(--gold)",
          display:       "flex",
          alignItems:    "center",
          gap:           10,
          marginBottom:  10,
          position:      "relative",
          zIndex:        1,
        }}
      >
        Notifications
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>

      {/* Header row — italic title + view/hide toggle */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-baseline justify-between"
        style={{
          minHeight:               44,
          padding:                 "0",
          touchAction:             "manipulation",
          WebkitTapHighlightColor: "transparent",
          background:              "none",
          border:                  "none",
          cursor:                  "pointer",
          textAlign:               "left",
          position:                "relative",
          zIndex:                  1,
        } as React.CSSProperties}
        aria-expanded={expanded}
        aria-controls="notifications-list"
      >
        <h2
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle:  "italic",
            fontWeight: 500,
            fontSize:   "clamp(20px, 5vw, 24px)",
            lineHeight: 1.1,
            color:      "var(--foreground)",
            margin:     0,
          }}
        >
          {count === 1 ? "1 thread has new activity." : `${count} threads have new activity.`}
        </h2>

        <span
          style={{
            display:       "inline-flex",
            alignItems:    "center",
            gap:           6,
            fontFamily:    "var(--font-mono)",
            fontSize:      9,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color:         "var(--paper-mute)",
            flexShrink:    0,
          }}
        >
          {expanded ? "Hide" : "View"}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            aria-hidden="true"
            style={{
              transition: "transform 0.25s ease",
              transform:  expanded ? "rotate(0deg)" : "rotate(-90deg)",
              color:      "var(--gold)",
            }}
          >
            <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {/* Expandable list */}
      <div
        id="notifications-list"
        style={{
          maxHeight:  expanded ? 1000 : 0,
          opacity:    expanded ? 1 : 0,
          overflow:   "hidden",
          transition: "max-height 320ms ease, opacity 220ms ease, margin-top 200ms ease, padding-top 200ms ease",
          borderTop:  expanded ? "1px solid var(--line)" : "1px solid transparent",
          marginTop:  expanded ? 12 : 0,
          paddingTop: expanded ? 4 : 0,
          position:   "relative",
          zIndex:     1,
        }}
      >
        <div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
          {items.map((row) => (
            <NotificationRow key={row.post_id} row={row} onTap={handleTap} />
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Lint the new file**

Run: `npx eslint components/dashboard/Notifications.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/Notifications.tsx
git commit -m "feat(home): Notifications card component"
```

---

### Task 5: Skeleton

**Files:**
- Modify: `app/(app)/home/_skeletons.tsx`

- [ ] **Step 1: Add the skeleton**

In `app/(app)/home/_skeletons.tsx`, add this export after `AgingSkeleton` (before `NewsSkeleton`). It mirrors `AgingSkeleton` (2-row preview) so the swap to the real card causes no layout shift:

```tsx
/* ── Notifications skeleton — 2-row preview ──────────────────────── */
export function NotificationsSkeleton() {
  return (
    <div className="card animate-pulse" aria-hidden="true">
      <div className="h-3 bg-muted rounded w-1/4 mb-4" />
      <div className="space-y-3">
        <div className="h-10 bg-muted rounded" />
        <div className="h-10 bg-muted rounded w-5/6" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/home/_skeletons.tsx"
git commit -m "feat(home): NotificationsSkeleton"
```

---

### Task 6: Server island

**Files:**
- Modify: `app/(app)/home/_islands.tsx`

- [ ] **Step 1: Add the import**

In `app/(app)/home/_islands.tsx`, add to the component import block (after the `AgingAlerts` import):

```ts
import { Notifications }       from "@/components/dashboard/Notifications";
```

And add to the type import block (after the `AgingItem` type import):

```ts
import type { NotificationSummaryRow } from "@/lib/data/notifications";
```

- [ ] **Step 2: Add the island**

In the same file, add this async island after `AgingIsland`:

```tsx
/* ── Notifications card (consolidated comment activity) ──────────────
 *
 * Calls the get_notification_summary() RPC (security invoker; scoped
 * by auth.uid()). Returns up to 20 threads with unseen activity,
 * already ordered by most-recent. Renders nothing when empty — the
 * card hides itself. The server result seeds SWR's fallbackData so the
 * client mounts without a refetch. */
export async function NotificationsIsland({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_notification_summary");

  return (
    <Notifications
      userId={userId}
      initialItems={(data ?? []) as unknown as NotificationSummaryRow[]}
    />
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/home/_islands.tsx"
git commit -m "feat(home): NotificationsIsland (server RPC fetch)"
```

---

### Task 7: Wire into the Home page

**Files:**
- Modify: `app/(app)/home/page.tsx`

- [ ] **Step 1: Add imports**

In `app/(app)/home/page.tsx`, add `NotificationsIsland` to the `./_islands` import block and `NotificationsSkeleton` to the `./_skeletons` import block:

```ts
import {
  MastheadIsland,
  SmokingConditionsIsland,
  NotificationsIsland,
  AgingIsland,
  NewsIsland,
  LocalShopsIsland,
} from "./_islands";

import {
  MastheadSkeleton,
  SmokingConditionsSkeleton,
  NotificationsSkeleton,
  AgingSkeleton,
  NewsSkeleton,
} from "./_skeletons";
```

- [ ] **Step 2: Insert the Suspense island between Smoking Conditions and Aging Shelf**

Between the Smoking Conditions `</Suspense>` and the Aging Shelf `<Suspense>` blocks, insert:

```tsx
        {/* ── 2.5 Notifications (consolidated comment activity) ─────── */}
        <Suspense fallback={<NotificationsSkeleton />}>
          <NotificationsIsland userId={user.id} />
        </Suspense>

```

The resulting island order is: Masthead → Tonight's Pairing → Smoking Conditions → **Notifications** → Aging Shelf → The Wire → Field Guide → Local Shops.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Build (optional local sanity check)**

Run: `npm run build`
Expected: build succeeds. (Vercel preview also builds on PR; skip locally if env vars are unavailable.)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/home/page.tsx"
git commit -m "feat(home): wire Notifications card between Smoking Conditions and Aging Shelf"
```

---

### Task 8: Manual browser verification

No code changes. Required by project rules (UI feature must be exercised in a browser). The migration (Task 1) must be applied in production/preview Supabase before this works.

- [ ] **Step 1: Two-account setup**

Use two accounts, A (viewer) and B (commenter). With A, ensure there is at least one lounge post or burn report authored by A.

- [ ] **Step 2: Generate activity**

As B, comment on A's post. Add several comments (e.g. 3) to confirm consolidation. Optionally: as A, comment on a post authored by B, then as B reply to A's comment (to exercise the `participated`/"replies to you" branch).

- [ ] **Step 3: Verify the card**

As A, open `/home`. Confirm:
- The `Notifications` card appears between Smoking Conditions and the Aging Shelf.
- Collapsed by default; headline reads "1 thread has new activity." / "N threads have new activity."
- Tap to expand: row shows the post title + "3 new comments" (authored) or "N new replies to you" (participated). Singular forms correct for count of 1.
- Tapping a row navigates to `/lounge/<postId>` and lands on the correct post.
- Return to `/home`: the tapped row is gone. If it was the only row, the card is hidden entirely.

- [ ] **Step 4: Responsive + perf check**

- Check 320, 768, 1440 widths: no overflow, title truncates, touch targets >= 44px.
- Confirm Home's static shell still paints immediately and the card streams in (the skeleton shows briefly), i.e. LCP is not blocked by the RPC.

- [ ] **Step 5: (Optional) Add a skipped E2E stub**

Matching the existing convention in `tests/e2e/authenticated.spec.ts` (skipped stubs documenting intended coverage until an auth fixture exists), optionally add:

```ts
  test.skip("home: notifications card consolidates comment activity", async () => {
    /* TODO (needs auth fixture + a second seeded account): as the
       viewer, open /home, expect the Notifications card between
       Smoking Conditions and the Aging Shelf, expand it, expect a row
       reading "N new comments", tap it, expect navigation to
       /lounge/<postId>, return to /home, expect the row gone. */
  });
```

Commit if added:

```bash
git add tests/e2e/authenticated.spec.ts
git commit -m "test(e2e): skipped stub for notifications card coverage"
```

---

## Self-review notes (completed by plan author)

- **Spec coverage:** table+RLS (Task 1), RPC read path (Task 1), SWR key (Task 2), client fetcher/type (Task 2), dismiss route (Task 3), card chrome + copy + tap behavior + hide-when-empty + collapsed-default (Task 4), skeleton (Task 5), island (Task 6), placement between Smoking Conditions and Aging (Task 7), edge cases exercised in Task 8, migration-drift deployment note (Task 1 Step 2). All spec sections map to a task.
- **Type consistency:** `NotificationSummaryRow` (fields `post_id`, `title`, `unseen_count`, `kind`, `latest_at`) defined in Task 2 and consumed unchanged in Tasks 4 and 6. `fetchNotificationSummary()` and `keyFor.notifications(userId)` names are consistent across Tasks 2 and 4. RPC name `get_notification_summary` consistent across Tasks 1, 2, 6.
- **No placeholders:** every code step contains complete code; SQL, route, component, skeleton, island, and page edits are all concrete.
- **Testing honesty:** no unit runner is introduced; gates are `tsc --noEmit` + eslint + SQL assertions + manual browser, matching the repo's actual CI and conventions.
