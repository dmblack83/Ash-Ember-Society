/* ------------------------------------------------------------------
   Cron run log + Sentry check-in helpers.

   Two layers of cron observability stacked behind one API:

     1. cron_run_log table — own-DB record of every run with timing,
        ok/fail, and a summary (sent / failed / pruned counts, etc.).
        Source of truth for "what did the cron actually do".

     2. Sentry cron monitors — per-cron check-in stream that alerts
        when a scheduled run is missed entirely (no row in
        cron_run_log to inspect). Catches "Vercel Cron stopped
        firing" failures that own-table logging can't see.

   Usage pattern (inside a route handler, after auth):

     const run = await startCronRun("aging-ready", "0 13 * * *");
     try {
       // ... handler body, computing summary fields ...
       await finishCronRun(run, { ok: true, summary });
       return NextResponse.json({ ok: true, ...summary });
     } catch (err) {
       await finishCronRun(run, { ok: false, error: (err as Error).message });
       throw err;
     }

   Both helpers are best-effort — a logging or Sentry failure must
   NEVER take down a cron. If the start INSERT fails we return null
   and the finish call no-ops on null; the cron itself runs
   unaffected and the absence of a row in cron_run_log is itself
   diagnostic (log-write infra broken). The handler still does its
   real work.
   ------------------------------------------------------------------ */

import * as Sentry from "@sentry/nextjs";
import { createServiceClient } from "@/utils/supabase/service";

export interface CronRunHandle {
  id:           string;
  startedAt:    number;
  monitorSlug:  string;
  checkInId:    string | null;
}

/**
 * Begin a cron run.
 *
 * @param name      Slug used both as cron_run_log.name and the Sentry
 *                  monitor slug. Must be stable across deploys —
 *                  Sentry uses it to match check-ins to the schedule.
 * @param schedule  Crontab string from vercel.json (e.g. `"0 13 * * *"`).
 *                  Sentry uses this to know when the next run is due
 *                  and surface "missed" alerts. Optional only because
 *                  some local/manual triggers may not have a known
 *                  cadence; production crons should always pass it.
 */
export async function startCronRun(
  name:      string,
  schedule?: string,
): Promise<CronRunHandle | null> {
  /* Send the in-progress Sentry check-in first — it's cheap, doesn't
     hit our DB, and wraps the rest. If only this succeeds, we still
     get the "did it start" signal in Sentry. */
  let checkInId: string | null = null;
  try {
    checkInId = Sentry.captureCheckIn(
      { monitorSlug: name, status: "in_progress" },
      schedule
        ? {
            schedule:       { type: "crontab", value: schedule },
            /* Grace period before Sentry calls a missed check-in.
               5 min covers normal Vercel Cron jitter. */
            checkinMargin:  5,
            /* Alert if a single run takes longer than 10 min. */
            maxRuntime:     10,
            timezone:       "UTC",
          }
        : undefined,
    );
  } catch (err) {
    console.warn(`[cron-log] sentry check-in start failed for "${name}":`, (err as Error).message);
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("cron_run_log")
      .insert({ name })
      .select("id")
      .single();

    if (error || !data) {
      console.warn(`[cron-log] start insert failed for "${name}":`, error?.message ?? "no row returned");
      /* DB log failed — still return a handle so finishCronRun can
         close the Sentry check-in. Use a synthetic id; finishCronRun
         skips the DB update when it sees no DB row was inserted. */
      return { id: "", startedAt: Date.now(), monitorSlug: name, checkInId };
    }
    return { id: data.id as string, startedAt: Date.now(), monitorSlug: name, checkInId };
  } catch (err) {
    console.warn(`[cron-log] start threw for "${name}":`, (err as Error).message);
    return { id: "", startedAt: Date.now(), monitorSlug: name, checkInId };
  }
}

export async function finishCronRun(
  handle:  CronRunHandle | null,
  outcome: { ok: boolean; summary?: Record<string, unknown>; error?: string | null },
): Promise<void> {
  if (!handle) return;

  /* Close the Sentry check-in. Done first because it's the alert
     signal — a failed DB log shouldn't prevent the alert from
     resolving. */
  if (handle.checkInId) {
    try {
      Sentry.captureCheckIn({
        checkInId:   handle.checkInId,
        monitorSlug: handle.monitorSlug,
        status:      outcome.ok ? "ok" : "error",
      });
    } catch (err) {
      console.warn(`[cron-log] sentry check-in finish failed:`, (err as Error).message);
    }
  }

  /* Skip the DB update if the start INSERT had failed — synthetic
     handles carry an empty id. The Sentry check-in above still went
     out, so the alerting layer isn't affected. */
  if (!handle.id) return;

  try {
    const supabase = createServiceClient();
    await supabase
      .from("cron_run_log")
      .update({
        finished_at: new Date().toISOString(),
        ok:          outcome.ok,
        duration_ms: Date.now() - handle.startedAt,
        summary:     outcome.summary ?? null,
        error:       outcome.error  ?? null,
      })
      .eq("id", handle.id);
  } catch (err) {
    console.warn(`[cron-log] finish threw:`, (err as Error).message);
  }
}
