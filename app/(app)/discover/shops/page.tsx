import { createClient }      from "@/utils/supabase/server";
import { redirect }          from "next/navigation";
import { getMembershipTier } from "@/lib/membership";
import { ShopsPageClient }   from "@/components/shops/ShopsPageClient";
import type { MembershipTier } from "@/lib/stripe";

export const metadata = { title: "Find a Lounge — Ash & Ember Society" };

/* ------------------------------------------------------------------
   Types — exported so ShopsPageClient and detail page can import them
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
   Page — auth only. All data fetching lives in ShopsPageClient.
   ------------------------------------------------------------------ */

export default async function ShopsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("membership_tier, display_name, created_at")
    .eq("id", user.id)
    .single();

  const tier = getMembershipTier(profileData) as MembershipTier;

  return (
    <ShopsPageClient
      userTier={tier}
      userId={user.id}
    />
  );
}
