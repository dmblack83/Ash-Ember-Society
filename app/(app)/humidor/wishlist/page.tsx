import { createClient }   from "@/utils/supabase/server";
import { getServerUser }  from "@/lib/auth/server-user";
import { WishlistClient } from "@/components/humidor/WishlistClient";
import type { WishlistItem } from "@/components/humidor/WishlistClient";

// User-specific data -- opt out of static rendering
export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  const supabase = await createClient();
  const user     = await getServerUser();

  // Middleware handles unauthenticated redirects; defensive null guard
  if (!user) return null;

  const { data: rows } = await supabase
    .from("humidor_items")
    .select(
      "id, cigar_id, created_at, notes, cigar:cigar_catalog(id, brand, series, format, ring_gauge, length_inches, wrapper, wrapper_country, shade, usage_count, image_url)"
    )
    .eq("user_id", user.id)
    .eq("is_wishlist", true)
    .order("created_at", { ascending: false });

  // Normalize FK join (Supabase may return array for to-one relations)
  const initialItems: WishlistItem[] = (rows ?? [])
    .map((row) => {
      const cigar = Array.isArray(row.cigar) ? row.cigar[0] ?? null : row.cigar ?? null;
      if (!cigar) return null;
      return {
        id:         row.id,
        cigar_id:   row.cigar_id,
        created_at: row.created_at,
        notes:      (row as any).notes ?? null,
        cigar,
      } as WishlistItem;
    })
    .filter((x): x is WishlistItem => x !== null);

  return <WishlistClient initialItems={initialItems} userId={user.id} />;
}
