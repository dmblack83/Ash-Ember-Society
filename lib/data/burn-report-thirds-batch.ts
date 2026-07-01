/* ------------------------------------------------------------------
   Batched per-third tag resolution — CLIENT-SAFE module.

   Moved out of lib/data/burn-report-thirds.ts (which imports the
   server Supabase client and therefore next/headers) so client
   components and client fetchers can import the batch helper without
   dragging server-only APIs into the browser bundle. The old module
   re-exports these names, so server call sites are unchanged.

   Used by the read paths (humidor burn-reports list, lounge feed,
   post detail, post modal) that render <VerdictCard /> for SAVED
   reports. Returns, per burn_report id, the index-ordered list of
   resolved flavor tag NAMES — matching the shape VerdictCard's
   `thirdsTaggedRows` prop expects.

   Skips work + returns {} on empty input. Empty third rows (no
   tags) are still represented in the output array so callers can
   render an entry per third.
   ------------------------------------------------------------------ */

export interface BurnReportThirdTaggedRow {
  index:            1 | 2 | 3;
  flavor_tag_names: string[];
}

/* Loose supabase-client shape — works with both the server client
   (from utils/supabase/server) and the browser client (from
   utils/supabase/client). Typing as `unknown` here keeps the helper
   client-agnostic without dragging the full SupabaseClient generics
   into every call site. */
type ThirdsBatchSupabaseClient = {
  from: (table: string) => unknown;
};

export async function getBurnReportThirdsTaggedBatch(
  supabase:       ThirdsBatchSupabaseClient,
  burnReportIds:  string[],
  tagNameMap:     Record<string, string>,
): Promise<Record<string, BurnReportThirdTaggedRow[]>> {
  if (burnReportIds.length === 0) return {};
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const builder = (supabase as any)
    .from("burn_report_thirds")
    .select("burn_report_id, third_index, burn_report_third_flavor_tags ( flavor_tag_id )")
    .in("burn_report_id", burnReportIds);
  const { data, error } = (await builder) as {
    data: Array<{
      burn_report_id: string;
      third_index:    number;
      burn_report_third_flavor_tags?: Array<{ flavor_tag_id: string }> | null;
    }> | null;
    error: unknown;
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (error || !data) return {};

  const map: Record<string, BurnReportThirdTaggedRow[]> = {};
  for (const row of data) {
    const idx = row.third_index as 1 | 2 | 3;
    if (idx !== 1 && idx !== 2 && idx !== 3) continue;
    const names = (row.burn_report_third_flavor_tags ?? [])
      .map((j) => tagNameMap[j.flavor_tag_id])
      .filter(Boolean) as string[];
    const arr = map[row.burn_report_id] ?? [];
    arr.push({ index: idx, flavor_tag_names: names });
    map[row.burn_report_id] = arr;
  }
  // Sort each burn report's thirds by index so consumers can index
  // into a stable order without re-sorting.
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => a.index - b.index);
  }
  return map;
}
