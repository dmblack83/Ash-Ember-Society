import { unstable_cache }       from "next/cache";
import { createClient }          from "@/utils/supabase/server";
import { createServiceClient }   from "@/utils/supabase/service";
import { redirect }              from "next/navigation";
import { getMembershipTier }     from "@/lib/membership";
import { ShopsPageClient }       from "@/components/shops/ShopsPageClient";
import type { MembershipTier }   from "@/lib/stripe";

export const metadata = { title: "Find a Lounge — Ash & Ember Society" };

/* ------------------------------------------------------------------
   Shared shop types (also imported by detail page and client)
   ------------------------------------------------------------------ */

export interface ShopHours {
  open:    string;
  close:   string;
  closed?: boolean;
}

export interface Shop {
  id:                  string;
  slug:                string;
  name:                string;
  address:             string;
  city:                string;
  state:               string;
  zip:                 string | null;
  lat:                 number;
  lng:                 number;
  phone:               string | null;
  website:             string | null;
  description:         string | null;
  is_partner:          boolean;
  is_founding_partner: boolean;
  amenities:           string[];
  hours:               Record<string, ShopHours> | null;
  cover_photo_url:     string | null;
  photo_urls:          string[];
  rating:              number;
  total_ratings:       number;
  member_discount:     string | null;
  premium_discount:    string | null;
  perk_description:    string | null;
  created_at:          string;
}

/* ------------------------------------------------------------------
   Cached data loader — shops list
   Revalidates every hour. Uses service role to bypass RLS.
   ------------------------------------------------------------------ */

const getCachedShops = unstable_cache(
  async (): Promise<Shop[]> => {
    const supabase = createServiceClient();
    const { data: shopsData } = await supabase
      .from("shops")
      .select("*")
      .order("is_founding_partner", { ascending: false })
      .order("is_partner", { ascending: false })
      .order("name");
    return (shopsData ?? []) as Shop[];
  },
  ["shops-data"],
  { revalidate: 3600 }, // 1 hour
);

/* ------------------------------------------------------------------
   Page
   ------------------------------------------------------------------ */

export default async function ShopsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profileData }, shops] = await Promise.all([
    supabase
      .from("profiles")
      .select("membership_tier, display_name, created_at")
      .eq("id", user.id)
      .single(),
    getCachedShops(),
  ]);

  const tier = getMembershipTier(profileData) as MembershipTier;

  return (
    <ShopsPageClient
      shops={shops}
      userTier={tier}
      userId={user.id}
    />
  );
}
