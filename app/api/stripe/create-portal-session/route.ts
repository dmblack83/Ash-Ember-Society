import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/utils/supabase/server";

/**
 * POST /api/stripe/create-portal-session
 *
 * Creates a Stripe Customer Portal session for the authenticated user,
 * returning a URL to redirect them to.
 *
 * The portal lets users:
 *   - Cancel their subscription
 *   - Switch between monthly / annual billing
 *   - Update payment method
 *   - View invoice history
 *
 * Prerequisites:
 *   - Configure the portal in the Stripe Dashboard:
 *       https://dashboard.stripe.com/settings/billing/portal
 *   - The user must already have a stripe_customer_id in their profile
 *     (set during checkout.session.completed webhook).
 */
export async function POST(req: NextRequest) {
  try {
    /* ── Auth ──────────────────────────────────────────────────── */
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    /* ── Get Stripe customer ID from profile ───────────────────── */
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    const customerId = profile?.stripe_customer_id as string | null;

    if (!customerId) {
      return NextResponse.json(
        { error: "No active subscription found. Please subscribe first." },
        { status: 400 }
      );
    }

    /* ── Build return URL ──────────────────────────────────────── */
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ??
      (req.headers.get("origin") || "http://localhost:3000");

    /* ── Create portal session ─────────────────────────────────── */
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/account`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[create-portal-session]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
