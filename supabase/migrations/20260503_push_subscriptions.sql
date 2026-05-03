-- Migration: 20260503_push_subscriptions
-- Web Push subscription store. Each row corresponds to one
-- (user, browser/device) pair — a single user with the PWA installed
-- on their phone AND a desktop browser tab will have two rows.
--
-- The (endpoint, p256dh, auth) trio is the full PushSubscription
-- payload the browser hands the client when the user opts in. The
-- server (lib/push.ts in PR 4) signs each notification with the VAPID
-- private key and POSTs the encrypted payload to `endpoint`.
--
-- Endpoints can change (browser refreshes the subscription, user
-- reinstalls the PWA, etc.). When a send fails with a 404/410 we
-- delete the row server-side; the next opt-in creates a fresh row.

create table if not exists push_subscriptions (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references profiles(id) on delete cascade,
  endpoint      text        not null,
  p256dh        text        not null,
  auth          text        not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,

  -- Prevent duplicate subscriptions per device. The Push API returns
  -- the same endpoint string for the same browser instance, so this
  -- catches the "user re-toggled notifications without unsubscribing
  -- first" case and lets the client safely upsert.
  unique (user_id, endpoint)
);

comment on table  push_subscriptions  is 'Web Push endpoints registered by users. One row per (user, browser). Used by lib/push.ts to deliver notifications.';
comment on column push_subscriptions.user_agent   is 'Best-effort UA string captured at subscribe time. Helps debug per-device delivery failures and lets the user identify "this is my phone" vs "this is my desktop" in a future device list UI.';
comment on column push_subscriptions.last_used_at is 'Updated by the server after a successful notification delivery. Stale rows (no successful send in N months) can be GC''d.';

-- Per-user lookups dominate ("send notification to user X" → fetch
-- all their endpoints). The unique(user_id, endpoint) constraint
-- already gives us a usable index, but an explicit one on user_id
-- alone is faster for that query because the planner doesn't have
-- to ignore the trailing endpoint column.
create index if not exists push_subscriptions_user_id_idx
  on push_subscriptions (user_id);

-- ── Row-level security ──────────────────────────────────────────────

alter table push_subscriptions enable row level security;

-- Users can read their own subscriptions (e.g. to render a "manage
-- devices" list, or to detect that the current browser is already
-- subscribed before showing the opt-in CTA).
create policy "users can read their own push subscriptions"
  on push_subscriptions for select to authenticated
  using (auth.uid() = user_id);

-- Users can insert their own subscriptions (the opt-in flow in PR 3).
create policy "users can insert their own push subscriptions"
  on push_subscriptions for insert to authenticated
  with check (auth.uid() = user_id);

-- Users can delete their own subscriptions (opt-out, device removal).
create policy "users can delete their own push subscriptions"
  on push_subscriptions for delete to authenticated
  using (auth.uid() = user_id);

-- No update policy — endpoints are immutable per (user, browser).
-- A "subscription refresh" is a delete + insert, not an update.
--
-- The server (service role) bypasses RLS for delivery and bookkeeping
-- (last_used_at updates, GC of dead endpoints).
