/* ------------------------------------------------------------------
   computeReportNumbers

   For a given set of smoke_log IDs (e.g. those embedded in a feed of
   forum posts), returns a map of smoke_log_id → reportNumber where
   reportNumber is the OWNER's 1-indexed position among their own
   smoke_logs ordered by smoked_at ascending.

   Why this matters: when a user shares burn report #45 to the
   lounge, the editorial preview card needs to show "NO. 45" — that
   number reflects "the 45th burn report this user has filed", not
   any sequential position in the lounge feed.

   Implementation: the get_report_numbers RPC — a single window-
   function query (see supabase/migrations/20260702_report_number_rpc.sql).
   SECURITY INVOKER, so it counts exactly the rows the caller's RLS
   allows, same as the legacy path.

   Legacy fallback: until the migration is applied in prod, the RPC
   errors and we fall back to the old two-query JS counting (resolve
   owners, fetch each owner's full history, count positions). Remove
   the fallback once the migration is confirmed applied.
   ------------------------------------------------------------------ */

import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/log";

export async function computeReportNumbers(
  supabase: SupabaseClient,
  smokeLogIds: string[],
): Promise<Record<string, number>> {
  if (smokeLogIds.length === 0) return {};

  const { data: rpcRows, error: rpcError } = await supabase.rpc("get_report_numbers", {
    p_smoke_log_ids: smokeLogIds,
  });

  if (!rpcError) {
    const result: Record<string, number> = {};
    for (const row of (rpcRows ?? []) as { smoke_log_id: string; report_number: number | string }[]) {
      result[row.smoke_log_id] = Number(row.report_number);
    }
    return result;
  }

  log.warn({
    scope:   "burn-report-number",
    message: "get_report_numbers RPC unavailable; using legacy fallback",
    error:   rpcError,
  });

  const { data: scoped } = await supabase
    .from("smoke_logs")
    .select("id, user_id")
    .in("id", smokeLogIds);

  const ownerIds = [...new Set(((scoped ?? []) as { user_id: string }[]).map((l) => l.user_id))];
  if (ownerIds.length === 0) return {};

  const { data: allLogs } = await supabase
    .from("smoke_logs")
    .select("id, user_id, smoked_at")
    .in("user_id", ownerIds)
    .order("smoked_at", { ascending: true });

  const wanted   = new Set(smokeLogIds);
  const counters: Record<string, number> = {};
  const result:   Record<string, number> = {};
  for (const log of (allLogs ?? []) as { id: string; user_id: string; smoked_at: string }[]) {
    counters[log.user_id] = (counters[log.user_id] ?? 0) + 1;
    if (wanted.has(log.id)) result[log.id] = counters[log.user_id];
  }
  return result;
}
