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
- Retains notifications as a feed. Tapping a row jumps to the post and marks that row **read** (the ember dot clears), but the row stays in the list. Rows are not removed on tap; they only drop off when newer threads push them past the cap.
- Per-thread read state: an unread row (new comments since the user last viewed it) shows an ember dot and a "N new comments" count; a read row drops the dot and shows lifetime activity ("N comments").
- The collapsed headline counts **unread** threads.
- Always visible. When there is no unread activity it shows "No new activity." (same wording whether the list is empty or all-read), rather than hiding.
- Surfaces at most the 10 most-recently-active threads; as new activity arrives elsewhere, older threads drop past the cutoff.
- Costs nothing on the hot path (posting a comment must not get slower).

## Non-Goals

- **Push notifications.** This ships the in-app card only. A `comment_activity` push category can be added later as a separate scoped PR. The in-app consolidation logic (per-thread counts) does not map to push (which is per-event), so they are independent surfaces.
- **A "mark all read" control.** Tapping a row is the only mark-read mechanism for v1.
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
- Approach A does the work only on Home open, as a single bounded aggregate that never blocks LCP. Zero impact on the hot path. Optimistic local mutate on tap makes dismissal INP free.

**Client-fetched, not server-rendered.** The RPC scopes by `auth.uid()`, which only resolves for the **browser** Supabase client (it carries the user session). The server-side client under this app's proxy/JWKS auth does not establish that session, so a server-side `rpc()` returns `[]`. The card therefore fetches on the client via SWR (`fetchNotificationSummary`) on mount + focus. The server island just renders `<Notifications userId={…} />` with no data. (Earlier revisions server-fetched and seeded `fallbackData`; that produced an empty card until a focus event, which manifested as "tapping a row clears everything" — tap navigated, the next server render re-seeded `[]`, and `revalidateOnMount: false` suppressed the client refetch.)

## Architecture

| Piece | Location | Notes |
|---|---|---|
| Table `notification_views` | new migration | Per-(user, post) `last_seen_at`. Writes only on dismiss. |
| RPC `get_notification_summary()` | same migration | Single round-trip; returns up to 20 rows. |
| `NotificationsIsland` | `app/(app)/home/_islands.tsx` | Synchronous; renders `<Notifications userId={…} />`. Does NOT call the RPC server-side (auth.uid() is null there). |
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
  total_count  bigint,
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
    count(c.id) filter (
      where c.created_at > coalesce(nv.last_seen_at, 'epoch'::timestamptz)
    )                  as unseen_count,
    count(c.id)        as total_count,
    mt.kind,
    max(c.created_at)  as latest_at
  from my_threads mt
  left join notification_views nv
    on nv.user_id = auth.uid() and nv.post_id = mt.id
  join forum_comments c
    on c.post_id = mt.id
   and c.user_id <> auth.uid()
   and c.created_at > now() - interval '60 days'
  group by mt.id, mt.title, mt.kind, nv.last_seen_at
  having count(c.id) > 0
  order by max(c.created_at) desc
  limit 10;
$$;
```

Decisions:

- **Retained feed, not an unseen-only filter.** `HAVING count > 0` is on **all** comments from others in the window, so a thread stays in the list after it's read. `unseen_count` (a `FILTER` on comments newer than `last_seen_at`) drives the unread dot + tally; `total_count` is shown once read. Tapping sets `last_seen_at = now()`, which zeroes `unseen_count` on the next read but leaves the row.
- **`security invoker` + `auth.uid()`** — runs as the caller, so existing RLS on `forum_posts` / `forum_comments` still gates readability. No service-role, no privilege escalation. Aligns with the `20260520_secure_rpc_auth_checks` direction.
- **`kind` drives row copy.** The `union` dedups; `participated` excludes `fp.user_id = auth.uid()`, so a post the user authored appears once as `authored` even if they also commented.
- **`c.user_id <> auth.uid()`** — the user's own comments never count.
- **`nv.last_seen_at` in `GROUP BY`** — required because the `unseen_count` FILTER references it; there is exactly one `notification_views` row per (user, post), so this does not change grouping.
- **Bounded:** the 60-day window filters on **comment activity** (`c.created_at`), not post age — a long-running thread with a recent comment still surfaces; a thread whose only activity is older than 60 days does not. Plus `LIMIT 10` (most-recently-active threads; older ones fall off as new activity arrives).
- **`latest_at`** orders the card (most recent on top); not displayed.
- The original migration adds `forum_comments_post_created_idx (post_id, created_at)` to back the RPC's hot join (no prior index covered this access pattern).

## UI — `components/dashboard/Notifications.tsx`

Mirrors `AgingAlerts` chrome exactly: gold mono eyebrow, italic-serif headline, mono "View/Hide ▾" toggle, collapsible list, same card surface tokens (`--card-bg`, `--card-border`, `--line`, `--gold`). **Collapsed by default**, like the Aging Shelf. Client-fetched via SWR; renders `null` during the brief initial load. When there are rows, the headline is the toggle and the list follows. When there are no rows, the body shows an italic-serif, muted line "No new activity." with no toggle and no list — the same wording the headline uses when rows exist but all are read, so the two states read identically.

- **Eyebrow (mono, gold):** `Notifications`
- **Headline (italic serif), count = number of UNREAD threads:**
  - `0` unread (but list non-empty) → `No new activity.`
  - `1` → `1 thread has new activity.`
  - `{n}` → `{n} threads have new activity.`
  - Parallels the Aging Shelf's `10 cigars ready soon.`
- **Each row** (button, 44px min touch target, like `AgingRow`):
  - **Unread indicator slot** (fixed 8px width, leftmost, keeps titles aligned): an `--ember` dot when `unseen_count > 0`, transparent when read.
  - Line 1 (small, muted, uppercase tracking): post title, truncated.
  - Line 2 — count copy driven by read state and `kind`:
    - unread `authored` → `10 new comments` / `1 new comment` (strong weight, `--foreground`)
    - unread `participated` → `3 new replies to you` / `1 new reply to you`
    - read `authored` → `12 comments` / `1 comment` (muted `--paper-mute`)
    - read `participated` → `12 replies` / `1 reply`
  - Trailing chevron `›`.

### Row tap behavior

1. Optimistic SWR `mutate` — map the tapped row to `unseen_count: 0` (`{ revalidate: false }`); the ember dot clears and the unread tally drops with no flicker, but **the row is retained**. It only leaves the list when newer threads push it past the 10-row cap.
2. `POST /api/notifications/dismiss { post_id }` (fire-and-forget) persists `last_seen_at = now()`. On failure, SWR revalidates on next focus and the unread state is restored — no data lost. Upsert is idempotent.
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
| Brand-new user, no posts/comments | RPC returns `[]` → card shows "No new activity." (no toggle, no list). |
| Active threads, all read | Rows retained, no dots, headline "No new activity."; list still expandable. |
| Tapped (read) thread gets a new comment | `unseen_count` goes back above 0 on next read → row is unread again (dot returns). |
| Authored a post, nobody commented | Not in result (`having count > 0`). |
| User's own comments on own thread | Excluded (`c.user_id <> auth.uid()`). |
| Comment deleted after being counted | Count drops on next read — no stored counter to drift. |
| Post deleted | `notification_views` row cascades away; thread drops from RPC. |
| Authored AND commented on same post | Appears once as `authored` (`participated` excludes own posts). |
| >10 active threads | Capped at 10, ordered by most recent activity; older threads fall off. |
| Dismiss POST fails | Row reappears on next focus revalidation (SWR). Idempotent upsert, no lost state. |
| Activity older than 60 days | Outside candidate window — won't surface. |
| Stale SW serving cached Home HTML | Card data is per-user, client-fetched via SWR (browser session), not part of cached HTML; revalidates on mount + focus. No cross-user leak. |

## Testing & Verification

- **RPC (SQL):** seed a post + another user's comments → assert `unseen_count` and `total_count`; insert a `notification_views` row at `now()` → assert `unseen_count` drops to 0 but the row **still returns** with `total_count` intact; assert own comments don't count; assert `participated` vs `authored` kind selection.
- **Component:** unread vs read copy for both kinds (singular/plural); ember dot only when unread; headline counts unread threads ("No new activity." at 0); no rows renders the "No new activity." line; renders `null` while the first fetch is pending; collapsed by default; tap marks read optimistically (row retained) + fires dismiss POST + navigates.
- **Dismiss route:** rejects unauthenticated; rejects non-UUID `post_id`; upserts only `auth.uid()`'s row; idempotent on repeat.
- **Browser (manual, required per project rules):** two test accounts — B comments on A's burn report; A opens Home, sees the `Notifications` card between Smoking Conditions and Aging Shelf with an ember dot + "N new comments"; taps → lands on the post; returns Home → **row is still listed** but read (no dot, "N comments"), unread tally dropped (the bug this fixes: it must NOT clear all/become empty). B comments again → row goes unread (dot returns). With no active threads at all, confirm "No new activity." renders. Reload several times / background-and-foreground the PWA → the card consistently shows the real data (no need to hard-close). Check 320/768/1440 widths.

## Deployment Note (migration drift)

Migrations on this project are sometimes applied manually in the Supabase SQL editor and have silently missed production before. The `notification_views` table and the current `get_notification_summary()` RPC must be confirmed present in production before the card ships, or the client fetch will error and the card will stay blank. Verify in the Supabase SQL editor after merge.
