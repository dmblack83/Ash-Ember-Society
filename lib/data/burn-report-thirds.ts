/* ------------------------------------------------------------------
   burn-report-thirds — server-side data fetcher

   Joins burn_report_thirds + burn_report_third_flavor_tags for a
   given burn_report_id. Used by the edit page to hydrate the
   per-third form state.

   Returns rows ordered by third_index ascending (1, 2, 3).
   ------------------------------------------------------------------ */

import { createClient } from "@/utils/supabase/server";

export interface BurnReportThirdRow {
  id:                  string;
  third_index:         1 | 2 | 3;
  notes:               string;
  draw_rating:         number;
  burn_rating:         number;
  construction_rating: number;
  flavor_rating:       number;
  photo_url:           string | null;
  flavor_tag_ids:      string[];
}

export async function getBurnReportThirds(burnReportId: string): Promise<BurnReportThirdRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("burn_report_thirds")
    .select(`
      id,
      third_index,
      notes,
      draw_rating,
      burn_rating,
      construction_rating,
      flavor_rating,
      photo_url,
      burn_report_third_flavor_tags ( flavor_tag_id )
    `)
    .eq("burn_report_id", burnReportId)
    .order("third_index", { ascending: true });

  if (error || !data) return [];

  return data.map((row): BurnReportThirdRow => ({
    id:                  row.id,
    third_index:         row.third_index as 1 | 2 | 3,
    notes:               row.notes,
    draw_rating:         Number(row.draw_rating),
    burn_rating:         Number(row.burn_rating),
    construction_rating: Number(row.construction_rating),
    flavor_rating:       Number(row.flavor_rating),
    photo_url:           row.photo_url,
    flavor_tag_ids:      (row.burn_report_third_flavor_tags ?? []).map(
      (j: { flavor_tag_id: string }) => j.flavor_tag_id,
    ),
  }));
}

/* ------------------------------------------------------------------
   Batched per-third tag resolution

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
