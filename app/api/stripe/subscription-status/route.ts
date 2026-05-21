import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/utils/supabase/server";
import { getServerUser } from "@/lib/auth/server-user";
import { getMembershipTier } from "@/lib/membership";

/**
 * GET /api/stripe/subscription-status
 *
 * Returns billing date for the authenticated user's active subscription.
 * Used by MembershipTab to load billing info without blocking page render.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const user     = await getServerUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("membership_tier, stripe_subscription_id")
      .eq("id", user.id)
      .single();

    const tier = getMembershipTier(profile);

    if (tier === "free" || !profile?.stripe_subscription_id) {
      return NextResponse.json({ nextBillingDate: null, currentPeriodEnd: null });
    }

    const sub = await stripe.subscriptions.retrieve(
      profile.stripe_subscription_id as string
    );

    const periodEnd = sub.items.data[0]?.current_period_end ?? null;
    const nextBillingDate = periodEnd
      ? new Date(periodEnd * 1000).toLocaleDateString("en-US", {
          year: "numeric", month: "long", day: "numeric",
        })
      : null;

    return NextResponse.json({ nextBillingDate, currentPeriodEnd: periodEnd });
  } catch (err) {
    console.error("[subscription-status]", err);
    return NextResponse.json({ nextBillingDate: null, currentPeriodEnd: null });
  }
}
