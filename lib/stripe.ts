/**
 * Stripe server-side client
 *
 * Usage (server only — never import in client components):
 *   import { stripe } from "@/lib/stripe";
 *
 * Setup checklist:
 *  1. Create products and prices in the Stripe Dashboard:
 *       https://dashboard.stripe.com/products
 *     — "Standard" → $3.99/mo recurring
 *     — "Premium"  → $6.99/mo recurring
 *
 *  2. Copy each price ID (price_xxx) into .env.local:
 *       STRIPE_MEMBER_MONTHLY_PRICE_ID=price_xxx   (Standard tier — internal enum is `member`)
 *       STRIPE_PREMIUM_MONTHLY_PRICE_ID=price_xxx
 *     STRIPE_MEMBER_ANNUAL_PRICE_ID + STRIPE_PREMIUM_ANNUAL_PRICE_ID
 *     were retired 2026-05-19 when annual billing was dropped.
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
   Price ID helpers — map tier → Stripe price ID

   Monthly-only as of 2026-05-19 (annual options dropped along with
   the price update). Internal tier enum stays "free" | "member" |
   "premium"; "member" surfaces as "Standard" in the UI.
   ------------------------------------------------------------------ */

export type MembershipTier = "free" | "member" | "premium";

/** Returns the Stripe price ID for a paid tier. */
export function getPriceId(tier: Exclude<MembershipTier, "free">): string {
  const map: Record<Exclude<MembershipTier, "free">, string | undefined> = {
    member:  process.env.STRIPE_MEMBER_MONTHLY_PRICE_ID,
    premium: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID,
  };
  const id = map[tier];
  if (!id) throw new Error(`Missing price ID for ${tier}`);
  return id;
}

/**
 * Derives a membership tier from a Stripe price ID.
 * Falls back to "free" if the price ID doesn't match any known price.
 */
export function tierFromPriceId(priceId: string): MembershipTier {
  if (priceId === process.env.STRIPE_MEMBER_MONTHLY_PRICE_ID)  return "member";
  if (priceId === process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID) return "premium";
  return "free";
}
