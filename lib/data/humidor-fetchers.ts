"use client";

/*
 * Client-side Supabase fetchers for humidor data.
 *
 * Used as the SWR fetcher in `HumidorClient` and friends. Always
 * paired with the matching key from `lib/data/keys.ts` so all
 * subscribers share one cache entry. Returns plain values (not
 * { data, error }) — errors throw so SWR's error handling kicks in.
 */

import { createClient } from "@/utils/supabase/client";
import type { HumidorItem } from "@/components/humidor/HumidorClient";

export async function fetchHumidorItems(userId: string): Promise<HumidorItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("humidor_items")
    .select("*, cigar:cigar_catalog(*)")
    .eq("user_id",     userId)
    .eq("is_wishlist", false)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as HumidorItem[];
}

export async function fetchHasWishlistItems(userId: string): Promise<boolean> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("humidor_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id",     userId)
    .eq("is_wishlist", true);

  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}
