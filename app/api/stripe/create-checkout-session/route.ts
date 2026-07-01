import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/utils/supabase/server";
import { getServerUser } from "@/lib/auth/server-user";

/**
 * POST /api/stripe/create-checkout-session
 *
 * Body: { plan: "member-monthly" }  (preferred)
 *       { priceId: string }         (legacy — must match a known plan)
 *
 * Creates a Stripe Checkout Session for the authenticated user and
 * returns the session URL to redirect to.
 *
 * The caller should redirect to the returned `url`:
 *   const { url } = await res.json();
 *   router.push(url);
 */

/* Plan keys the client may request, resolved to price IDs server-side.
   The client never handles raw price IDs — a request for an arbitrary
   priceId (e.g. some other product in the Stripe account) is rejected. */
function priceIdForPlan(plan: string): string | null {
  const PLANS: Record<string, string | undefined> = {
    "member-monthly": process.env.STRIPE_MEMBER_MONTHLY_PRICE_ID,
  };
  return PLANS[plan] ?? null;
}

export async function POST(req: NextRequest) {
  try {
    /* ── Auth ──────────────────────────────────────────────────── */
    const supabase = await createClient();
    const user     = await getServerUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    /* ── Body ──────────────────────────────────────────────────── */
    const body = await req.json();
    const { plan, priceId: legacyPriceId } =
      body as { plan?: string; priceId?: string };

    let priceId: string | null = null;
    if (plan) {
      priceId = priceIdForPlan(plan);
    } else if (legacyPriceId) {
      /* Legacy body from pre-deploy HTML still in a client's cache.
         Accept it only if it matches a known plan's price ID. */
      priceId =
        legacyPriceId === process.env.STRIPE_MEMBER_MONTHLY_PRICE_ID
          ? legacyPriceId
          : null;
    }

    if (!priceId) {
      return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
    }

    /* ── Look up existing Stripe customer (if any) ─────────────── */
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    const existingCustomerId = profile?.stripe_customer_id as string | null;

    /* ── Build the app's base URL ──────────────────────────────── */
    /* `||` not `??` — an empty-string env var should fall through
       to the request origin, not be treated as a valid URL. */
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      req.headers.get("origin") ||
      "http://localhost:3000";

    /* ── Create Checkout Session ───────────────────────────────── */
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],

      // Pre-fill the customer if they've checked out before
      ...(existingCustomerId
        ? { customer: existingCustomerId }
        : { customer_email: user.email ?? undefined }),

      // Link session back to our Supabase user — used in the webhook
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },

      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },

      success_url: `${origin}/account/membership/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/account`,

      // Enable Stripe promotion code entry on checkout
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Failed to create session URL" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[create-checkout-session]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
