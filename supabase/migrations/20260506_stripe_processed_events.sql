-- Migration: 20260506_stripe_processed_events
-- Stripe webhook idempotency dedup table.
--
-- Stripe retries failed webhooks aggressively (5 attempts at
-- exponential intervals up to 3 days). Without dedup, a slow handler
-- that times out and retries could double-bill a user, double-upgrade
-- a tier, or apply state changes twice. The webhook handler in
-- app/api/stripe/webhook/route.ts INSERTs the event_id BEFORE
-- processing. If the INSERT raises a unique-violation, the event has
-- already been seen — return 200 immediately, no reprocessing.
--
-- Failure-mode reasoning for INSERT-first vs process-first:
--
-- INSERT-first (this design):
--   ✓ No window for double-processing under concurrent retries.
--   ✗ If INSERT succeeds but handler crashes, Stripe's retry sees
--     the row and skips. Acceptable here because every handler
--     branch is an idempotent UPDATE on profiles — even if the
--     work is "skipped" on retry, the desired end state was already
--     reached (or it wasn't reachable for a permanent reason).
--
-- Process-first would invert the trade-off: guaranteed retry
-- recovery, but a window for double-application. Worse for billing.
--
-- created_at vs processed_at:
--   created_at is when we received the event (set on INSERT).
--   processed_at is when the handler completed successfully (NULL
--   if it crashed mid-process). The gap between the two, and the
--   presence of NULL processed_at on rows with a recent created_at,
--   is the diagnostic signal for "is the webhook hanging?"
--
-- No RLS policies — service-role only, same posture as moderation_log.
-- Authenticated clients never read/write this table.
--
-- No TTL pruning here. Stripe events accumulate at hundreds per month
-- for a small SaaS; even at 100K events/year, the table stays <50MB.
-- Add a periodic DELETE WHERE created_at < N months in a separate
-- migration if size ever matters.

create table if not exists stripe_processed_events (
  event_id     text        primary key,
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);

comment on table  stripe_processed_events  is 'Stripe webhook event_id dedup. Service-role only. INSERT-first idempotency in app/api/stripe/webhook/route.ts.';
comment on column stripe_processed_events.event_id     is 'Stripe Event.id (e.g. evt_1ABCdefXYZ). Primary key — INSERT raises 23505 on retry of the same event.';
comment on column stripe_processed_events.created_at   is 'When this row was inserted (event first received and dedup-claimed).';
comment on column stripe_processed_events.processed_at is 'When the handler finished. NULL means the handler crashed mid-process; future retries skip the work but a NULL here is the diagnostic for it.';

-- Index on created_at supports a future TTL-pruning query.
create index if not exists stripe_processed_events_created_at_idx
  on stripe_processed_events (created_at desc);

alter table stripe_processed_events enable row level security;
-- No policies. Service role bypasses RLS; this is the only writer.
