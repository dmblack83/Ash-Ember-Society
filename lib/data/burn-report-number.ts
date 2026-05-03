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

   Implementation: two batched queries.
     1. Resolve the IDs we care about → their owner user_ids.
     2. For the union of those users, fetch every smoke_log
        (id + smoked_at) to count positions per user.

   For typical lounge pages (a few dozen logs from a handful of
   users) this is cheap. If we ever shard or scale beyond that, swap
   in a single SQL window-function query instead.
   ------------------------------------------------------------------ */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function computeReportNumbers(
  supabase: SupabaseClient,
  smokeLogIds: string[],
): Promise<Record<string, number>> {
  if (smokeLogIds.length === 0) return {};

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
