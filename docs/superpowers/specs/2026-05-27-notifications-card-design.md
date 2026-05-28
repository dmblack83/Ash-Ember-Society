# Home Notifications Card — Design Spec

**Date:** 2026-05-27
**Status:** Approved design, pending implementation plan
**Branch:** `feat/notifications-card`

## Problem

Users have no in-app signal when activity happens on content they care about. When someone comments on a user's lounge post or burn report, or replies to a comment the user wrote, the user only finds out by manually re-opening the thread. We want a passive, glanceable surface on the Home dashboard that consolidates new comment activity per thread.

## Goal

Add a "Notifications" card to the Home dashboard that:

- Shows new comment activity on threads the user authored OR participated in (commented on).
- Consolidates by thread: one row per post showing a count (e.g. "10 new comments"), not one row per comment.
- Lets the user tap a row to jump to that post, which also clears that row's unseen count.
- Always visible. When there is no new activity it shows a calm empty state ("You're all caught up.") rather than hiding.
- Surfaces at most the 10 most-recently-active threads; as new activity arrives elsewhere, older threads drop past the cutoff.
- Costs nothing on the hot path (posting a comment must not get slower).

## Non-Goals

- **Push notifications.** This ships the in-app card only. A `comment_activity` push category can be added later as a separate scoped PR. The in-app consolidation logic (per-thread counts) does not map to push (which is per-event), so they are independent surfaces.
- **A "mark all read" control.** Per-row tap-to-clear is the only dismiss mechanism for v1.
- **Notifications for activity in threads the user neither authored nor commented on.**
- **An event/audit log of individual notifications.**
- **Field-guide comments, blog-post comments, or any non-lounge surface.** Scope is `forum_posts` / `forum_comments` only.

## Trigger Scope (approved)

Two kinds of activity produce a notification, both consolidated under the parent post:

1. **`authored`** — a top-level comment (or any comment) on a post the user authored. Copy: "N new comments".
2. **`participated`** — a comment on a post the user commented on but did not author (captures replies to the user's comments). Copy: "N new replies to you".

A reply to the user's comment is just a `forum_comments` row on a post the user participated in, so it is captured by the `participated` branch with no `parent_comment_id` special-casing. Counting is at the post level (the consolidation requirement).

The user's own comments never count as activity (`c.user_id <> auth.uid()`).

## Approach (approved: Approach A — per-post last-seen timestamp)

Store a per-(user, post) `last_seen_at` timestamp. Compute unseen counts on demand at read time. No stored counter, no triggers, no write amplification on comment insert.

### Why this approach (PWA performance rationale)

The card is read only when Home is opened. Comments are posted constantly by anyone in any thread the user touches. That asymmetry is decisive:

- A materialized counter (rejected Approach B) makes the card read trivial but fans out a counter update to every thread participant on every comment insert — slowing the most frequent interaction in the app (posting a comment) and hurting INP, the PWA's most-watched interaction metric.
- An event log (rejected Approach C) has the same write fan-out plus a new table, and overshoots a card-only feature.
- Approach A does the work only on Home open, as a single bounded aggregate inside a Suspense island that never blocks LCP. Zero impact on the hot path. Optimistic local mutate on tap makes dismissal INP free.

## Architecture

| Piece | Location | Notes |
|---|---|---|
| Table `notification_views` | new migration | Per-(user, post) `last_seen_at`. Writes only on dismiss. |
| RPC `get_notification_summary()` | same migration | Single round-trip; returns up to 20 rows. |
| `NotificationsIsland` | `app/(app)/home/_islands.tsx` | Calls the RPC. Streamed via Suspense, mirrors `AgingIsland`. |
| `NotificationsSkeleton` | `app/(app)/home/_skeletons.tsx` | Mirrors `AgingSkeleton`. |
| `Notifications` card | `components/dashboard/Notifications.tsx` | Mirrors `AgingAlerts` chrome. |
| SWR key `keyFor.notifications(userId)` | `lib/data/keys.ts` | Focus revalidation + optimistic mutate on dismiss. |
| Dismiss route | `app/api/notifications/dismiss/route.ts` | POST `{ post_id }` → upsert `last_seen_at = now()`. |
| Home wiring | `app/(app)/home/page.tsx` | New Suspense island between Smoking Conditions and Aging Shelf. |

Two new component-layer files, one migration, one route handler. No changes to lounge code, no triggers, no edits to existing comment paths.

### Home dashboard order (after change)

Masthead → Tonight's Pairing → Smoking Conditions → **Notifications** → Aging Shelf → The Wire → Field Guide → Local Shops.

## Data Model

```sql
create table if not exists notification_views (
  user_id      uuid        not null references profiles(id) on delete cascade,
  post_id      uuid        not null references forum_posts(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table notification_views enable row level security;

create policy "users read their own notification views"
  on notification_views for select to authenticated
  using (auth.uid() = user_id);

create policy "users upsert their own notification views"
  on notification_views for insert to authenticated
  with check (auth.uid() = user_id);

create policy "users update their own notification views"
  on notification_views for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- Composite PK `(user_id, post_id)` is both the upsert conflict target and the read index. No separate index needed.
- Both FKs cascade on delete; no orphan rows when a post or user is deleted.
- No `unseen_count` column — counts are computed at read time (the point of Approach A).
- A missing row means "never viewed" → all comments count as unseen (`coalesce(last_seen_at, 'epoch')` in the RPC).
- No delete policy: cascade handles cleanup; users never delete a view row.

## Read Path — `get_notification_summary()`

```sql
create or replace function get_notification_summary()
returns table (
  post_id      uuid,
  title        text,
  unseen_count bigint,
  kind         text,        -- 'authored' | 'participated'
  latest_at    timestamptz
)
language sql
security invoker          -- runs as the caller; RLS on forum_* still applies
stable
as $$
  with my_threads as (
    select fp.id, fp.title, 'authored'::text as kind
    from forum_posts fp
    where fp.user_id = auth.uid()
    union
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
   and c.created_at > now() - interval '60 days'
  group by mt.id, mt.title, mt.kind
  having count(c.id) > 0
  order by max(c.created_at) desc
  limit 10;
$$;
```

Decisions:

- **`security invoker` + `auth.uid()`** — runs as the caller, so existing RLS on `forum_posts` / `forum_comments` still gates readability. No service-role, no privilege escalation. Aligns with the `20260520_secure_rpc_auth_checks` direction.
- **`kind` drives row copy.** The `union` dedups; `participated` excludes `fp.user_id = auth.uid()`, so a post the user authored appears once as `authored` even if they also commented.
- **`c.user_id <> auth.uid()`** — the user's own comments never count.
- **Bounded:** the 60-day window filters on **comment activity** (`c.created_at`), not post age — a long-running thread with a recent comment still surfaces; a thread whose only unseen comments are older than 60 days does not. Plus `LIMIT 10` (most-recently-active threads; older ones fall off as new activity arrives).
- **`latest_at`** orders the card (most recent on top); not displayed.
- The migration adds `forum_comments_post_created_idx (post_id, created_at)` to back the RPC's hot join (no prior index covered this access pattern).

## UI — `components/dashboard/Notifications.tsx`

Mirrors `AgingAlerts` chrome exactly: gold mono eyebrow, italic-serif headline, mono "View/Hide ▾" toggle, collapsible list, same card surface tokens (`--card-bg`, `--card-border`, `--line`, `--gold`). **Collapsed by default**, like the Aging Shelf. **Always visible** — when there is no new activity the eyebrow stays and the body shows an italic-serif, muted empty-state line "You're all caught up." with no toggle and no list.

- **Eyebrow (mono, gold):** `Notifications`
- **Headline (italic serif), count = number of threads/rows:**
  - `1 thread has new activity.`
  - `{n} threads have new activity.`
  - Parallels the Aging Shelf's `10 cigars ready soon.`
- **Each row** (button, 44px min touch target, like `AgingRow`):
  - Line 1 (small, muted, uppercase tracking): post title, truncated.
  - Line 2 (semibold): count copy driven by `kind`:
    - `authored` → `10 new comments` / `1 new comment`
    - `participated` → `3 new replies to you` / `1 new reply to you`
  - Trailing chevron `›`.

### Row tap behavior

1. Optimistic SWR `mutate` — drop the row from the cached list immediately (`{ revalidate: false }`); count and row vanish with no flicker. If it was the last row, the card shows the empty state.
2. `POST /api/notifications/dismiss { post_id }` (fire-and-forget). On failure, SWR revalidates on next focus and the row reappears — no data lost. Upsert is idempotent.
3. `router.push('/lounge/' + post_id, { scroll: false })`. Burn reports shared to the lounge are `forum_posts`, so the same `/lounge/[postId]` route handles them — one navigation target.

### Copy rules

No em dashes in any user-facing string. All count copy is singular/plural aware.

## Dismiss Route — `app/api/notifications/dismiss/route.ts`

- POST `{ post_id: string }`.
- Rejects unauthenticated requests.
- Upserts `notification_views (user_id = auth.uid(), post_id, last_seen_at = now())` on conflict `(user_id, post_id)` do update.
- Idempotent on repeat calls.

## Edge Cases

| Case | Behavior |
|---|---|
| Brand-new user, no posts/comments | RPC returns `[]` → card shows empty state ("You're all caught up."). |
| Authored a post, nobody commented | Not in result (`having count > 0`). |
| User's own comments on own thread | Excluded (`c.user_id <> auth.uid()`). |
| Comment deleted after being counted | Count drops on next read — no stored counter to drift. |
| Post deleted | `notification_views` row cascades away; thread drops from RPC. |
| Authored AND commented on same post | Appears once as `authored` (`participated` excludes own posts). |
| >10 active threads | Capped at 10, ordered by most recent activity; older threads fall off. |
| Dismiss POST fails | Row reappears on next focus revalidation (SWR). Idempotent upsert, no lost state. |
| Activity older than 60 days | Outside candidate window — won't surface. |
| Stale SW serving cached Home HTML | Card data is per-user, fetched in the island, not a cached public asset; SWR revalidates on focus. No cross-user leak. |

## Testing & Verification

- **RPC (SQL):** seed a post + another user's comments → assert `unseen_count`; insert a `notification_views` row at `now()` → assert count drops to 0; assert own comments don't count; assert `participated` vs `authored` kind selection.
- **Component:** singular/plural copy for both kinds; `initialItems=[]` renders `null`; collapsed by default; tap fires optimistic mutate + dismiss POST + navigation.
- **Dismiss route:** rejects unauthenticated; upserts only `auth.uid()`'s row; idempotent on repeat.
- **Browser (manual, required per project rules):** two test accounts — B comments on A's burn report; A opens Home, sees the `Notifications` card between Smoking Conditions and Aging Shelf, expands, sees "N new comments", taps → lands on the post; returns Home → row gone, empty state shown if it was the last. With no activity at all, confirm the empty-state line renders. Check 320/768/1440 widths; confirm Home LCP is unaffected (card streams in like Aging).

## Deployment Note (migration drift)

Migrations on this project are sometimes applied manually in the Supabase SQL editor and have silently missed production before. The `notification_views` table and `get_notification_summary()` RPC must be confirmed present in production before the card ships, or the RPC call will error and the island will fail to render. Verify in the Supabase SQL editor after merge.
