/*
 * Async server island for the Humidor route.
 *
 * The page (`page.tsx`) renders synchronously with no top-level data
 * awaits — the shell HTML streams from the edge before this island
 * resolves. Suspense holds a skeleton in place until the queries
 * below return, then this island streams in.
 *
 * Why split this out: previously `page.tsx` ran both Supabase queries
 * at the route boundary, which blocked the entire HTML response on the
 * slowest query. With this island, the static shell paints first and
 * the data fills in.
 */

import { createClient }  from "@/utils/supabase/server";
import { HumidorClient } from "@/components/humidor/HumidorClient";
import type { HumidorItem } from "@/components/humidor/HumidorClient";

export async function HumidorDataIsland({ userId }: { userId: string }) {
  const supabase = await createClient();

  const [{ data: itemsData }, { count }] = await Promise.all([
    supabase
      .from("humidor_items")
      .select(
        "id, cigar_id, quantity, purchase_date, price_paid_cents, " +
        "aging_start_date, notes, created_at, " +
        "cigar:cigar_catalog(id, brand, series, format, wrapper, " +
        "wrapper_country, ring_gauge, length_inches, image_url)"
      )
      .eq("user_id", userId)
      .eq("is_wishlist", false)
      .order("created_at", { ascending: false }),
    supabase
      .from("humidor_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_wishlist", true),
  ]);

  return (
    <HumidorClient
      initialItems={(itemsData ?? []) as unknown as HumidorItem[]}
      initialHasWishlist={(count ?? 0) > 0}
      userId={userId}
    />
  );
}
