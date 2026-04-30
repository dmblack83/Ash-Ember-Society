import { createClient }  from "@/utils/supabase/server";
import { getServerUser } from "@/lib/auth/server-user";
import { HumidorClient } from "@/components/humidor/HumidorClient";
import type { HumidorItem } from "@/components/humidor/HumidorClient";

// User-specific data — opt out of static rendering
export const dynamic = "force-dynamic";

export default async function HumidorPage() {
  const supabase = await createClient();
  const user     = await getServerUser();

  // Middleware handles unauthenticated redirects; defensive null guard
  if (!user) return null;

  // Run both queries in parallel
  const [{ data: itemsData }, { count }] = await Promise.all([
    supabase
      .from("humidor_items")
      .select("*, cigar:cigar_catalog(*)")
      .eq("user_id", user.id)
      .eq("is_wishlist", false)
      .order("created_at", { ascending: false }),
    supabase
      .from("humidor_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_wishlist", true),
  ]);

  return (
    <HumidorClient
      initialItems={(itemsData ?? []) as unknown as HumidorItem[]}
      initialHasWishlist={(count ?? 0) > 0}
      userId={user.id}
    />
  );
}
