import { NextRequest, NextResponse } from "next/server";
import { stripe, tierFromPriceId } from "@/lib/stripe";
import { createServiceClient } from "@/utils/supabase/service";
import type Stripe from "stripe";

/**
 * POST /api/stripe/webhook
 *
 * Receives and verifies Stripe webhook events, then updates the
 * profiles table via the service-role Supabase client (bypasses RLS).
 *
 * Handled events:
 *   checkout.session.completed      — first subscription created
 *   customer.subscription.updated   — plan change or renewal
 *   customer.subscription.deleted   — cancellation / expiry
 *
 * Setup:
 *   1. Stripe Dashboard → Webhooks → Add endpoint
 *      URL: https://<your-domain>/api/stripe/webhook
 *      Events: checkout.session.completed,
 *              customer.subscription.updated,
 *              customer.subscription.deleted
 *   2. Copy the signing secret into .env.local:
 *      STRIPE_WEBHOOK_SECRET=whsec_xxx
 *
 *   For local dev (Stripe CLI):
 *      stripe listen --forward-to localhost:3000/api/stripe/webhook
 *   The CLI prints a temporary whsec_ secret — use that in .env.local.
 */

// Next.js App Router: Stripe needs the raw body for signature verification.
// Disable body parsing by exporting this config.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  /* ── Read raw body ─────────────────────────────────────────── */
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    console.error("[webhook] Missing stripe-signature or STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  /* ── Verify signature ──────────────────────────────────────── */
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("[webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  /* ── Service-role Supabase client (bypasses RLS) ───────────── */
  const supabase = createServiceClient();

  /* ── Idempotency: INSERT-first dedup by Stripe event_id ────────
     Stripe retries failed webhooks aggressively (5 attempts up to
     3 days). Without dedup, a slow handler that times out and
     retries could double-process. INSERT-first prevents that — see
     supabase/migrations/20260506_stripe_processed_events.sql for
     the full failure-mode rationale. Handler branches are all
     idempotent UPDATEs on profiles, so this is defense-in-depth. */
  const { error: dedupError } = await supabase
    .from("stripe_processed_events")
    .insert({ event_id: event.id });

  if (dedupError) {
    /* 23505 = Postgres unique_violation. PostgREST surfaces it on
       the error object's `code` field. */
    if (dedupError.code === "23505") {
      console.log(`[webhook] event ${event.id} already processed, skipping`);
      return NextResponse.json({ received: true, deduplicated: true });
    }
    /* Any other DB error (connection, schema mismatch) — bail
       without processing. Returning 500 makes Stripe retry; we'd
       rather retry than process without claim. */
    console.error("[webhook] dedup INSERT failed:", dedupError);
    return NextResponse.json({ error: "Dedup check failed" }, { status: 500 });
  }

  /* ── Handle events ─────────────────────────────────────────── */
  try {
    switch (event.type) {

      /* ── New subscription created via Checkout ─────────────── */
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // We only care about subscription checkouts
        if (session.mode !== "subscription") break;

        const userId = session.client_reference_id ?? session.metadata?.supabase_user_id;
        if (!userId) {
          console.error("[webhook] checkout.session.completed: no user ID in session");
          break;
        }

        // Retrieve the full subscription to get the price ID
        const subscriptionId = session.subscription as string;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["items.data.price"],
        });

        const priceId = subscription.items.data[0]?.price?.id;
        const tier = priceId ? tierFromPriceId(priceId) : "member";
        const customerId = session.customer as string;

        await supabase
          .from("profiles")
          .update({
            membership_tier:        tier,
            stripe_customer_id:     customerId,
            stripe_subscription_id: subscriptionId,
          })
          .eq("id", userId);

        console.log(`[webhook] checkout.session.completed: user=${userId} tier=${tier}`);
        break;
      }

      /* ── Plan changed or subscription renewed ──────────────── */
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;

        const userId = subscription.metadata?.supabase_user_id;
        if (!userId) {
          // Fall back to looking up by customer ID
          const customerId = subscription.customer as string;
          const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("stripe_customer_id", customerId)
            .single();

          if (!profile) {
            console.error("[webhook] subscription.updated: cannot find user for customer", customerId);
            break;
          }

          const priceId = subscription.items.data[0]?.price?.id;
          const tier    = priceId ? tierFromPriceId(priceId) : "member";

          // If subscription is past_due / unpaid / cancelled, revert to free
          const effectiveTier =
            subscription.status === "active" || subscription.status === "trialing"
              ? tier
              : "free";

          await supabase
            .from("profiles")
            .update({ membership_tier: effectiveTier })
            .eq("id", profile.id);

          console.log(`[webhook] subscription.updated: user=${profile.id} tier=${effectiveTier}`);
          break;
        }

        const priceId = subscription.items.data[0]?.price?.id;
        const tier    = priceId ? tierFromPriceId(priceId) : "member";
        const effectiveTier =
          subscription.status === "active" || subscription.status === "trialing"
            ? tier
            : "free";

        await supabase
          .from("profiles")
          .update({ membership_tier: effectiveTier })
          .eq("id", userId);

        console.log(`[webhook] subscription.updated: user=${userId} tier=${effectiveTier}`);
        break;
      }

      /* ── Subscription cancelled or expired ─────────────────── */
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        const userId = subscription.metadata?.supabase_user_id;
        const customerId = subscription.customer as string;

        if (userId) {
          await supabase
            .from("profiles")
            .update({ membership_tier: "free", stripe_subscription_id: null })
            .eq("id", userId);
          console.log(`[webhook] subscription.deleted: user=${userId} → free`);
        } else {
          // Look up by customer ID
          const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("stripe_customer_id", customerId)
            .single();

          if (profile) {
            await supabase
              .from("profiles")
              .update({ membership_tier: "free", stripe_subscription_id: null })
              .eq("id", profile.id);
            console.log(`[webhook] subscription.deleted: user=${profile.id} → free`);
          }
        }
        break;
      }

      default:
        // Unhandled event type — acknowledge receipt so Stripe doesn't retry
        console.log(`[webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error("[webhook] Handler error:", err);
    /* Don't update processed_at — leaves it NULL so the row is a
       diagnostic signal for "claimed but not finished." Stripe
       retries will still hit the dedup row and skip; for that to
       be safe, every handler branch must be idempotent (currently
       true — all UPDATEs on profiles). */
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  /* Mark processed. Best-effort — if this fails, the row stays
     with processed_at = NULL but the work is done; Stripe retries
     will still skip via the dedup row. */
  await supabase
    .from("stripe_processed_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("event_id", event.id);

  // Always return 200 so Stripe knows we received the event
  return NextResponse.json({ received: true });
}
