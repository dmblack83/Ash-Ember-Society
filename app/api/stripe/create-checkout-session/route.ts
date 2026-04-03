import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/utils/supabase/server";

/**
 * POST /api/stripe/create-checkout-session
 *
 * Body: { priceId: string }
 *
 * Creates a Stripe Checkout Session for the authenticated user and
 * returns the session URL to redirect to.
 *
 * The caller should redirect to the returned `url`:
 *   const { url } = await res.json();
 *   router.push(url);
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

    /* ── Body ──────────────────────────────────────────────────── */
    const body = await req.json();
    const { priceId } = body as { priceId: string };

    if (!priceId) {
      return NextResponse.json({ error: "Missing priceId" }, { status: 400 });
    }

    /* ── Look up existing Stripe customer (if any) ─────────────── */
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    const existingCustomerId = profile?.stripe_customer_id as string | null;

    /* ── Build the app's base URL ──────────────────────────────── */
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ??
      (req.headers.get("origin") || "http://localhost:3000");

    /* ── Create Checkout Session ───────────────────────────────── */
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],

      // Pre-fill the customer if they've checked out before
      ...(existingCustomerId
        ? { customer: existingCustomerId }
        : { customer_email: user.email }),

      // Link session back to our Supabase user — used in the webhook
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },

      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },

      success_url: `${origin}/membership/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/membership`,

      // Allow switching between monthly and annual before confirming
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Failed to create session URL" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[create-checkout-session]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
