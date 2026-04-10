import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getMembershipTier } from "@/lib/membership";
import { stripe } from "@/lib/stripe";
import { MembershipClient } from "@/components/membership/MembershipClient";
import type { MembershipTier } from "@/lib/stripe";

export const metadata = {
  title: "Account — Ash & Ember Society",
};

export default async function AccountPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("membership_tier, stripe_customer_id, stripe_subscription_id, display_name, created_at")
    .eq("id", user.id)
    .single();

  const currentTier       = getMembershipTier(profile) as MembershipTier;
  const hasStripeCustomer = !!(profile?.stripe_customer_id);

  /* ── For paid users: fetch next billing date from Stripe ──────── */
  let nextBillingDate: string | null = null;
  let billingInterval: "month" | "year" | null = null;

  if (currentTier !== "free" && profile?.stripe_subscription_id) {
    try {
      const sub = await stripe.subscriptions.retrieve(
        profile.stripe_subscription_id as string
      );
      const periodEnd = sub.items.data[0]?.current_period_end ?? null;
      if (periodEnd) {
        nextBillingDate = new Date(periodEnd * 1000).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      }
      const interval = sub.items.data[0]?.price?.recurring?.interval;
      if (interval === "month" || interval === "year") billingInterval = interval;
    } catch {
      // Non-fatal — subscription may have been manually deleted
    }
  }

  return (
    <MembershipClient
      userId={user.id}
      currentTier={currentTier}
      hasStripeCustomer={hasStripeCustomer}
      displayName={profile?.display_name ?? user.email?.split("@")[0] ?? "Member"}
      memberSince={profile?.created_at ?? null}
      nextBillingDate={nextBillingDate}
      billingInterval={billingInterval}
      priceIds={{
        memberMonthly:  process.env.STRIPE_MEMBER_MONTHLY_PRICE_ID  ?? "",
        memberAnnual:   process.env.STRIPE_MEMBER_ANNUAL_PRICE_ID   ?? "",
        premiumMonthly: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID ?? "",
        premiumAnnual:  process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID  ?? "",
      }}
    />
  );
}
