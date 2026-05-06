-- Migration: 20260506_cron_run_log
-- Per-run log of cron executions.
--
-- Why: today the cron handlers (aging-ready, news/sync, youtube/sync,
-- push-retry) return summary counts in the HTTP response, but those
-- counts vanish when the request ends. We can't answer:
--   - "Did the aging-ready cron actually run today, and at what time?"
--   - "Is news/sync taking longer than usual?"
--   - "Did push-retry encounter an unhandled error overnight?"
--   - "Are there cron runs that started but never finished?"
--
-- This table captures each run with start time, finish time, ok/fail,
-- duration, and a summary jsonb that matches whatever the cron's
-- response body returned. Rows where finished_at is NULL after a
-- reasonable window indicate hung or crashed runs — diagnostic
-- signal for the (separate) alerting work.
--
-- Granularity: one row per cron-route invocation that passes auth.
-- Rows are NOT created for unauthorized hits (those go to console
-- warnings; their value is in spotting probing attempts, not in the
-- cron observability surface).
--
-- TTL: not implemented here. At 4 cron routes × ~20 invocations/day
-- = ~80 rows/day = ~30K rows/year — trivial. Add a periodic
-- DELETE WHERE started_at < N months ago in a separate migration
-- if size ever matters.
--
-- No RLS policies — service-role only, same posture as moderation_log,
-- stripe_processed_events, push_outbox, push_send_log.

create table if not exists cron_run_log (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  ok           boolean,
  duration_ms  int,
  summary      jsonb,
  error        text,
  created_at   timestamptz not null default now()
);

-- Per-cron history: "show me the last 50 runs of aging-ready"
create index if not exists cron_run_log_name_started_idx
  on cron_run_log (name, started_at desc);

-- Stuck-run detection: rows that started but never finished. Partial
-- index keeps it small even as the table grows.
create index if not exists cron_run_log_unfinished_idx
  on cron_run_log (started_at)
  where finished_at is null;

-- TTL pruning support (future)
create index if not exists cron_run_log_started_at_idx
  on cron_run_log (started_at desc);

comment on table  cron_run_log              is 'Per-run log of cron executions. Service-role only. Producer: lib/cron-log.ts wrapped around each cron route handler.';
comment on column cron_run_log.name         is 'Stable cron identifier, e.g. "aging-ready", "news-sync", "push-retry".';
comment on column cron_run_log.finished_at  is 'NULL means the run started but never wrote a finish row — handler crashed mid-execution or the SW/runtime was killed. Diagnostic for hangs.';
comment on column cron_run_log.duration_ms  is 'Wall-clock duration between start and finish. Useful for spotting regressions.';
comment on column cron_run_log.summary      is 'Per-cron stats blob. Shape varies by cron name; matches whatever the route returned in the response body.';

alter table cron_run_log enable row level security;
-- No policies — service role bypasses RLS; this is the only writer.
