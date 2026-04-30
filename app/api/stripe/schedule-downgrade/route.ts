import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/utils/supabase/server";
import { getServerUser } from "@/lib/auth/server-user";

/**
 * POST /api/stripe/schedule-downgrade
 *
 * Body: { targetTier: "free" | "member" }
 *
 * Downgrades the authenticated user's subscription:
 *   - "free"   → sets cancel_at_period_end: true; the webhook handles
 *               the tier change to "free" when the period ends.
 *   - "member" → switches the subscription price to the matching
 *               member price (same billing interval, proration_behavior:
 *               "none" so no charge/credit is applied mid-cycle).
 *               The webhook fires subscription.updated and sets the tier.
 *
 * Returns: { effectiveDate: string } on success.
 */
export async function POST(req: NextRequest) {
  try {
    /* ── Auth ──────────────────────────────────────────────────── */
    const supabase = await createClient();
    const user     = await getServerUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    /* ── Body ──────────────────────────────────────────────────── */
    const { targetTier } = (await req.json()) as { targetTier: "free" | "member" };
    if (targetTier !== "free" && targetTier !== "member") {
      return NextResponse.json({ error: "Invalid targetTier" }, { status: 400 });
    }

    /* ── Fetch profile ─────────────────────────────────────────── */
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_subscription_id, membership_tier")
      .eq("id", user.id)
      .single();

    if (!profile?.stripe_subscription_id) {
      return NextResponse.json({ error: "No active subscription found." }, { status: 400 });
    }

    /* ── Retrieve current subscription ────────────────────────── */
    const subscription = await stripe.subscriptions.retrieve(
      profile.stripe_subscription_id as string,
      { expand: ["items.data.price"] }
    );

    const periodEnd = subscription.items.data[0]?.current_period_end ?? 0;
    const effectiveDate = new Date(periodEnd * 1000).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });

    /* ── Apply downgrade ───────────────────────────────────────── */
    if (targetTier === "free") {
      /* Cancel at end of billing period — webhook fires subscription.deleted */
      await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: true,
      });
    } else {
      /* Switch to member price at same billing interval, no proration */
      const currentInterval = subscription.items.data[0]?.price?.recurring?.interval;
      const memberPriceId = currentInterval === "year"
        ? process.env.STRIPE_MEMBER_ANNUAL_PRICE_ID
        : process.env.STRIPE_MEMBER_MONTHLY_PRICE_ID;

      if (!memberPriceId) {
        return NextResponse.json({ error: "Member price ID not configured." }, { status: 500 });
      }

      await stripe.subscriptions.update(subscription.id, {
        items: [{ id: subscription.items.data[0]!.id, price: memberPriceId }],
        proration_behavior: "none",
      });
    }

    return NextResponse.json({ effectiveDate });
  } catch (err) {
    console.error("[schedule-downgrade]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
