import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getMembershipTier } from "@/lib/membership";
import { stripe } from "@/lib/stripe";
import { AccountClient } from "@/components/account/AccountClient";
import type { MembershipTier } from "@/lib/stripe";
import { readFileSync } from "fs";
import { join } from "path";

export const metadata = { title: "Account — Ash & Ember Society" };
export const dynamic  = "force-dynamic";

/* Local row type — the new columns aren't in Supabase's generated types
   until `supabase gen types` is re-run after the migration. */
interface ProfileRow {
  membership_tier:        string | null;
  stripe_customer_id:     string | null;
  stripe_subscription_id: string | null;
  display_name:           string | null;
  first_name:             string | null;
  last_name:              string | null;
  phone:                  string | null;
  city:                   string | null;
  state:                  string | null;
  avatar_url:             string | null;
  created_at:             string;
}

export default async function AccountPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  /* Cast through unknown so TypeScript accepts columns not yet in the
     generated types (added by migration 20260415_profiles_extended_fields). */
  const { data: profile } = (await supabase
    .from("profiles")
    .select(
      "membership_tier, stripe_customer_id, stripe_subscription_id, " +
      "display_name, first_name, last_name, phone, city, state, avatar_url, created_at"
    )
    .eq("id", user.id)
    .single()) as unknown as { data: ProfileRow | null };

  const currentTier       = getMembershipTier(profile) as MembershipTier;
  const hasStripeCustomer = !!(profile?.stripe_customer_id);

  let nextBillingDate: string | null  = null;
  let billingInterval: "month" | "year" | null = null;
  let currentPeriodEnd: number | null = null;

  if (currentTier !== "free" && profile?.stripe_subscription_id) {
    try {
      const sub = await stripe.subscriptions.retrieve(
        profile.stripe_subscription_id as string
      );
      const periodEnd = sub.items.data[0]?.current_period_end ?? null;
      if (periodEnd) {
        currentPeriodEnd = periodEnd;
        nextBillingDate  = new Date(periodEnd * 1000).toLocaleDateString("en-US", {
          year: "numeric", month: "long", day: "numeric",
        });
      }
      const interval = sub.items.data[0]?.price?.recurring?.interval;
      if (interval === "month" || interval === "year") billingInterval = interval;
    } catch {
      // Non-fatal
    }
  }

  /* Read legal markdown at build/request time — never fetched from network */
  const readLegal = (file: string) => {
    try {
      return readFileSync(join(process.cwd(), "content/legal", file), "utf-8");
    } catch {
      return "# Document\n\nContent coming soon.";
    }
  };

  return (
    <AccountClient
      userId={user.id}
      email={user.email ?? ""}
      profile={{
        display_name: profile?.display_name ?? null,
        first_name:   profile?.first_name   ?? null,
        last_name:    profile?.last_name     ?? null,
        phone:        profile?.phone        ?? null,
        city:         profile?.city         ?? null,
        state:        profile?.state        ?? null,
        avatar_url:   profile?.avatar_url   ?? null,
      }}
      membership={{
        currentTier,
        hasStripeCustomer,
        nextBillingDate,
        billingInterval,
        currentPeriodEnd,
        priceIds: {
          memberMonthly:  process.env.STRIPE_MEMBER_MONTHLY_PRICE_ID  ?? "",
          memberAnnual:   process.env.STRIPE_MEMBER_ANNUAL_PRICE_ID   ?? "",
          premiumMonthly: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID ?? "",
          premiumAnnual:  process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID  ?? "",
        },
      }}
      legal={{
        termsContent: readLegal("terms-of-service.md"),
        eulaContent:  readLegal("eula.md"),
      }}
    />
  );
}
