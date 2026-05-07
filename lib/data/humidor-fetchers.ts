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
import type { HumidorItem }  from "@/components/humidor/HumidorClient";
import type { WishlistItem } from "@/components/humidor/WishlistClient";
import type { CatalogResult } from "@/components/cigar-search";

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

export async function fetchWishlistItems(userId: string): Promise<WishlistItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("humidor_items")
    .select(
      "id, cigar_id, created_at, " +
      "cigar:cigar_catalog(id, brand, series, format, ring_gauge, length_inches, wrapper, wrapper_country, shade, usage_count, image_url)"
    )
    .eq("user_id",     userId)
    .eq("is_wishlist", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  // Supabase's generated select() typing for embedded relations is
  // hard to narrow without a generated types.ts. The JSON shape is
  // stable; cast at the boundary and validate fields via runtime
  // checks (cigar may be array OR object depending on schema metadata).
  type Row = {
    id:         string;
    cigar_id:   string;
    created_at: string;
    cigar:      CatalogResult | CatalogResult[] | null;
  };
  return ((data ?? []) as unknown as Row[])
    .map((row): WishlistItem | null => {
      const cigar = Array.isArray(row.cigar) ? row.cigar[0] ?? null : row.cigar ?? null;
      if (!cigar) return null;
      return {
        id:         row.id,
        cigar_id:   row.cigar_id,
        created_at: row.created_at,
        notes:      null,
        cigar,
      };
    })
    .filter((x): x is WishlistItem => x !== null);
}
