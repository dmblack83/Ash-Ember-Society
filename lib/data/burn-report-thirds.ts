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
