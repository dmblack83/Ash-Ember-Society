-- Migration: 20260506_push_outbox
-- Push notification retry queue (DLQ).
--
-- Why: when sendPushToUser hits a transient failure (push provider
-- 5xx, network blip during cron), the notification is currently
-- LOST — only counted as `failed` in the function's return value.
-- For date-specific events like aging-ready (fires once at the
-- target date and never tries again on its own), this means a
-- 5-minute provider outage during the daily cron silently drops
-- those notifications.
--
-- This table stores enqueued sends. lib/push.ts auto-inserts on
-- transient failure; /api/cron/push-retry processes pending rows
-- on a schedule (every hour per vercel.json).
--
-- Status flow:
--   pending → sent  (delivery succeeded on a retry)
--   pending → dead  (3 retries failed; we give up)
--
-- 404/410 failures (browser revoked the subscription) are NOT
-- queued — the row in push_subscriptions is already pruned and
-- there's no point retrying. Only 5xx / network / unknown.
--
-- Backoff schedule, applied via next_attempt_at:
--   after enqueue: now() (cron picks up next run)
--   after 1st retry fails: +1h
--   after 2nd retry fails: +4h
--   after 3rd retry fails: status='dead' (no further attempts)
--
-- Total retry window: ~17 hours. For aging-ready that's well
-- within the same-day envelope; tomorrow's cron run produces
-- entirely fresh notifications anyway.
--
-- No RLS policies — service-role only, same posture as
-- moderation_log and stripe_processed_events.

create table if not exists push_outbox (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references profiles(id) on delete cascade,
  category        text        not null,
  payload         jsonb       not null,
  attempts        int         not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  last_error      text,
  status          text        not null default 'pending'
                              check (status in ('pending', 'sent', 'dead')),
  created_at      timestamptz not null default now()
);

-- Index supporting the worker query: due, pending rows.
create index if not exists push_outbox_due_idx
  on push_outbox (next_attempt_at)
  where status = 'pending';

-- Diagnostic index: most-recent-first per user.
create index if not exists push_outbox_user_idx
  on push_outbox (user_id, created_at desc);

comment on table  push_outbox  is 'Push notification retry queue. Service-role only. Producer: lib/push.ts on transient failure. Consumer: /api/cron/push-retry. See migration file for backoff schedule.';
comment on column push_outbox.attempts        is 'Count of retry attempts made (does NOT include the original sendPushToUser call that enqueued).';
comment on column push_outbox.next_attempt_at is 'Earliest time the worker should attempt this row. Set to now() on enqueue; bumped on each retry per the backoff table.';
comment on column push_outbox.last_error      is 'Truncated error string from the most recent failure. Diagnostic only.';

alter table push_outbox enable row level security;
-- No policies — service role bypasses RLS; this is the only writer.
