-- Migration: 20260506_push_send_log
-- Push notification analytics — one row per send-attempt at the
-- per-user level (not per-subscription).
--
-- Why: lib/push.ts and the retry cron both return counts in their
-- response, but those counts vanish when the request ends. We can't
-- answer "did user X actually receive their aging-ready notification
-- yesterday?" or "what's our delivery success rate this week?"
-- without persisting attempts.
--
-- Granularity: per-user-per-attempt. Each call to sendPushToUser
-- produces one row. Each retry attempt in the push-retry cron also
-- produces one row (source='retry'). Per-subscription detail isn't
-- captured here — out of scope until we have a click-tracking pingback
-- to correlate with.
--
-- Privacy: title and url are stored for diagnostic value (admin
-- support: "what notification fired"). payload.body is intentionally
-- NOT logged — it can carry user-specific text (cigar names from a
-- user's humidor) and the diagnostic value of body is low.
--
-- Result enum:
--   sent    — at least one subscription succeeded
--   failed  — tried, all subscriptions failed transiently
--   skipped — user opted out of category (didn't try)
--   no_subs — user has no active push_subscriptions (didn't try)
--   dead    — retry-cron only: row hit MAX_ATTEMPTS or all subs gone
--
-- TTL: not implemented in this migration. At indie scale (~hundreds
-- per day), the table stays trivial through 2027. Add a periodic
-- DELETE WHERE sent_at < N months ago in a separate migration if it
-- ever grows large enough to matter.
--
-- No RLS policies — service-role only, same posture as
-- moderation_log, stripe_processed_events, push_outbox.

create table if not exists push_send_log (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references profiles(id) on delete cascade,
  category      text        not null,
  result        text        not null
                            check (result in ('sent', 'failed', 'skipped', 'no_subs', 'dead')),
  sent_count    int         not null default 0,
  failed_count  int         not null default 0,
  pruned_count  int         not null default 0,
  title         text,
  url           text,
  source        text        not null default 'direct'
                            check (source in ('direct', 'retry')),
  error         text,
  sent_at       timestamptz not null default now()
);

-- Per-user history (admin support, "did user X receive their notification?")
create index if not exists push_send_log_user_idx
  on push_send_log (user_id, sent_at desc);

-- Per-category aggregates ("aging-ready success rate this week")
create index if not exists push_send_log_category_idx
  on push_send_log (category, sent_at desc);

-- TTL pruning support
create index if not exists push_send_log_sent_at_idx
  on push_send_log (sent_at desc);

comment on table  push_send_log         is 'Per-user-per-attempt push notification log. Service-role only. Producer: lib/push.ts (source=direct) and /api/cron/push-retry (source=retry).';
comment on column push_send_log.title   is 'Notification title; truncated to 200 chars. Diagnostic value only.';
comment on column push_send_log.url     is 'Notification target URL; truncated to 500 chars.';
comment on column push_send_log.source  is 'Which path produced this row: direct (sendPushToUser) or retry (cron worker).';

alter table push_send_log enable row level security;
-- No policies — service role bypasses RLS; this is the only writer.
