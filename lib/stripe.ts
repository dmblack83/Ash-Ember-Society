/**
 * Stripe server-side client
 *
 * Usage (server only — never import in client components):
 *   import { stripe } from "@/lib/stripe";
 *
 * Setup checklist:
 *  1. Create products and prices in the Stripe Dashboard:
 *       https://dashboard.stripe.com/products
 *     — "Member Monthly"  → $9.99/mo  recurring
 *     — "Member Annual"   → $99/yr    recurring
 *     — "Premium Monthly" → $19.99/mo recurring
 *     — "Premium Annual"  → $179/yr   recurring
 *
 *  2. Copy each price ID (price_xxx) into .env.local:
 *       STRIPE_MEMBER_MONTHLY_PRICE_ID=price_xxx
 *       STRIPE_MEMBER_ANNUAL_PRICE_ID=price_xxx
 *       STRIPE_PREMIUM_MONTHLY_PRICE_ID=price_xxx
 *       STRIPE_PREMIUM_ANNUAL_PRICE_ID=price_xxx
 *
 *  3. Set up the webhook endpoint in Stripe Dashboard:
 *       https://dashboard.stripe.com/webhooks
 *     — Endpoint URL: https://<your-domain>/api/stripe/webhook
 *     — Events to send:
 *         checkout.session.completed
 *         customer.subscription.updated
 *         customer.subscription.deleted
 *     — Copy the signing secret (whsec_xxx) into .env.local:
 *         STRIPE_WEBHOOK_SECRET=whsec_xxx
 *
 *  4. For local development use the Stripe CLI to forward webhooks:
 *       stripe listen --forward-to localhost:3000/api/stripe/webhook
 *     This prints a temporary whsec_ secret to use in .env.local.
 */

import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  // Pin the API version so upgrades are explicit, not implicit.
  apiVersion: "2026-03-25.dahlia",
  typescript: true,
});

/* ------------------------------------------------------------------
   Price ID helpers — map tier+interval → Stripe price ID
   ------------------------------------------------------------------ */

export type MembershipTier = "free" | "member" | "premium";
export type BillingInterval = "month" | "year";

/** Returns the Stripe price ID for a given tier + billing interval. */
export function getPriceId(tier: Exclude<MembershipTier, "free">, interval: BillingInterval): string {
  const map: Record<string, string | undefined> = {
    "member:month":  process.env.STRIPE_MEMBER_MONTHLY_PRICE_ID,
    "member:year":   process.env.STRIPE_MEMBER_ANNUAL_PRICE_ID,
    "premium:month": process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID,
    "premium:year":  process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID,
  };
  const id = map[`${tier}:${interval}`];
  if (!id) throw new Error(`Missing price ID for ${tier}/${interval}`);
  return id;
}

/**
 * Derives a membership tier from a Stripe price ID.
 * Falls back to "free" if the price ID doesn't match any known price.
 */
export function tierFromPriceId(priceId: string): MembershipTier {
  const memberIds = [
    process.env.STRIPE_MEMBER_MONTHLY_PRICE_ID,
    process.env.STRIPE_MEMBER_ANNUAL_PRICE_ID,
  ];
  const premiumIds = [
    process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID,
    process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID,
  ];
  if (memberIds.includes(priceId))  return "member";
  if (premiumIds.includes(priceId)) return "premium";
  return "free";
}
