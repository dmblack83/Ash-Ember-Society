"use client";

/*
 * Client-side aging-window fetch for the home Aging island. Same query as
 * the former server `AgingIsland` (humidor_items joined to cigar_catalog,
 * non-wishlist, aging_target_date within [today-7d, today+31d]), via the
 * browser Supabase client. RLS (`humidor_items` SELECT auth.uid() = user_id)
 * scopes the read.
 */

import { createClient } from "@/utils/supabase/client";
import type { AgingItem } from "@/components/dashboard/AgingAlerts";

export async function fetchAgingItems(userId: string): Promise<AgingItem[]> {
  const supabase = createClient();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 31);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const agingFloor = new Date();
  agingFloor.setDate(agingFloor.getDate() - 7);
  const agingFloorStr = agingFloor.toISOString().split("T")[0];

  const { data } = await supabase
    .from("humidor_items")
    .select(
      "id, aging_start_date, aging_target_date, " +
      "cigar:cigar_catalog(brand, series)"
    )
    .eq("user_id", userId)
    .eq("is_wishlist", false)
    .not("aging_target_date", "is", null)
    .gte("aging_target_date", agingFloorStr)
    .lte("aging_target_date", cutoffStr)
    .order("aging_target_date", { ascending: true });

  return (data ?? []) as unknown as AgingItem[];
}
