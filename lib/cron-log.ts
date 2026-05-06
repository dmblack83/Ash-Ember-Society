/* ------------------------------------------------------------------
   Cron run log helpers.

   Wrap the existing cron handlers in startCronRun/finishCronRun so
   each invocation gets a row in cron_run_log capturing start time,
   duration, ok/fail, and a summary. See migration
   supabase/migrations/20260506_cron_run_log.sql for schema rationale.

   Usage pattern (inside a route handler, after auth):

     const run = await startCronRun("aging-ready");
     try {
       // ... handler body, computing summary fields ...
       await finishCronRun(run, { ok: true, summary });
       return NextResponse.json({ ok: true, ...summary });
     } catch (err) {
       await finishCronRun(run, { ok: false, error: (err as Error).message });
       throw err;
     }

   Both helpers are best-effort — a logging failure must NEVER take
   down a cron. If the start INSERT fails we return null and the
   finish call no-ops on null; the cron itself runs unaffected and
   the absence of a row in cron_run_log is itself diagnostic
   (log-write infra broken). The handler still does its real work.
   ------------------------------------------------------------------ */

import { createServiceClient } from "@/utils/supabase/service";

export interface CronRunHandle {
  id:        string;
  startedAt: number;
}

export async function startCronRun(name: string): Promise<CronRunHandle | null> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("cron_run_log")
      .insert({ name })
      .select("id")
      .single();

    if (error || !data) {
      console.warn(`[cron-log] start insert failed for "${name}":`, error?.message ?? "no row returned");
      return null;
    }
    return { id: data.id as string, startedAt: Date.now() };
  } catch (err) {
    console.warn(`[cron-log] start threw for "${name}":`, (err as Error).message);
    return null;
  }
}

export async function finishCronRun(
  handle:  CronRunHandle | null,
  outcome: { ok: boolean; summary?: Record<string, unknown>; error?: string | null },
): Promise<void> {
  if (!handle) return;

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
