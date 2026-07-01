"use client";

/*
 * Client-side fetcher for the Humidor Stats page. Runs the same two
 * queries + flavor-tags read the server page ran before the
 * static-shell conversion, then assembles StatsClientData with the
 * shared pure builder (lib/stats/build-stats.ts).
 *
 * Pairs with keyFor.humidorStats(userId).
 */

import { createClient } from "@/utils/supabase/client";
import { fetchFlavorTags } from "@/lib/data/flavor-tags-client";
import {
  buildStatsData,
  type StatsSmokeLog,
  type StatsHumidorRow,
} from "@/lib/stats/build-stats";
import type { StatsClientData } from "@/components/humidor/StatsClient";

export async function fetchStatsData(userId: string): Promise<StatsClientData> {
  const supabase = createClient();

  const [logsRes, humidorRes, tags] = await Promise.all([
    supabase
      .from("smoke_logs")
      .select("id, smoked_at, overall_rating, flavor_tag_ids, cigar_id")
      .eq("user_id", userId)
      .order("smoked_at", { ascending: true }),
    supabase
      .from("humidor_items")
      .select("quantity, purchase_quantity, price_paid_cents, cigar:cigar_catalog(id, brand, strength)")
      .eq("user_id", userId)
      .eq("is_wishlist", false),
    fetchFlavorTags(),
  ]);

  if (logsRes.error)    throw new Error(logsRes.error.message);
  if (humidorRes.error) throw new Error(humidorRes.error.message);

  const logs  = (logsRes.data    ?? []) as StatsSmokeLog[];
  const hRows = (humidorRes.data ?? []) as unknown as StatsHumidorRow[];

  return buildStatsData(logs, hRows, tags);
}
