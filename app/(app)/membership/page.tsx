import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getMembershipTier } from "@/lib/membership";
import { MembershipClient } from "@/components/membership/MembershipClient";
import type { MembershipTier } from "@/lib/stripe";

export const metadata = {
  title: "Membership — Ash & Ember Society",
};

export default async function MembershipPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("membership_tier, stripe_customer_id")
    .eq("id", user.id)
    .single();

  const currentTier = getMembershipTier(profile) as MembershipTier;
  const hasStripeCustomer = !!(profile?.stripe_customer_id);

  return (
    <MembershipClient
      currentTier={currentTier}
      hasStripeCustomer={hasStripeCustomer}
      priceIds={{
        memberMonthly:  process.env.STRIPE_MEMBER_MONTHLY_PRICE_ID  ?? "",
        memberAnnual:   process.env.STRIPE_MEMBER_ANNUAL_PRICE_ID   ?? "",
        premiumMonthly: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID ?? "",
        premiumAnnual:  process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID  ?? "",
      }}
    />
  );
}
