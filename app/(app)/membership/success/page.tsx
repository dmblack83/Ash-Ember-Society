import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getMembershipTier, TIER_DISPLAY } from "@/lib/membership";

export const metadata = {
  title: "Welcome to Membership — Ash & Ember Society",
};

/**
 * /membership/success
 *
 * Shown after a successful Stripe Checkout. The webhook at
 * /api/stripe/webhook handles the actual database update; this page
 * just shows a confirmation. There may be a brief delay (~seconds)
 * before the webhook fires, so we re-fetch the profile here and show
 * the most current tier.
 */
export default async function MembershipSuccessPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Re-fetch fresh profile — the webhook may have already updated it
  const { data: profile } = await supabase
    .from("profiles")
    .select("membership_tier")
    .eq("id", user.id)
    .single();

  const tier = getMembershipTier(profile);
  const tierInfo = TIER_DISPLAY[tier];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center space-y-8 animate-fade-in">

        {/* Emblem */}
        <div className="flex justify-center">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(212,160,74,0.12)", border: "1px solid rgba(212,160,74,0.3)" }}
          >
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <path
                d="M7 18L14.5 25.5L29 10"
                stroke="var(--accent)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Heading */}
        <div className="space-y-3">
          <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
            Subscription Active
          </p>
          <h1 style={{ fontFamily: "var(--font-serif)", color: "var(--accent)" }}>
            Welcome to the Society.
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your{" "}
            <span className="font-semibold" style={{ color: tierInfo.color }}>
              {tierInfo.label}
            </span>{" "}
            membership is now active. Enjoy full access to everything the Ash &amp; Ember Society has to offer.
          </p>
        </div>

        {/* Tier badge */}
        {tier !== "free" && (
          <div
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full"
            style={{
              backgroundColor: tier === "premium"
                ? "rgba(212,160,74,0.12)"
                : "rgba(193,120,23,0.12)",
              border: `1px solid ${tierInfo.color}40`,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M7 1L8.8 5.1L13.3 5.5L10 8.4L11 12.8L7 10.4L3 12.8L4 8.4L0.7 5.5L5.2 5.1L7 1Z"
                fill={tierInfo.color}
              />
            </svg>
            <span className="text-sm font-semibold" style={{ color: tierInfo.color }}>
              {tierInfo.label} Member
            </span>
          </div>
        )}

        {/* What's unlocked */}
        {tier !== "free" && (
          <div
            className="rounded-2xl p-5 text-left space-y-3"
            style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
          >
            <p className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground">
              Now unlocked
            </p>
            <ul className="space-y-2">
              {tier === "premium" ? (
                <>
                  <FeatureRow label="Unlimited humidor items" />
                  <FeatureRow label="Post to the community feed" />
                  <FeatureRow label="Share burn reports publicly" />
                  <FeatureRow label="Premium badge on profile" gold />
                  <FeatureRow label="Advanced analytics (coming soon)" gold />
                </>
              ) : (
                <>
                  <FeatureRow label="Unlimited humidor items" />
                  <FeatureRow label="Post to the community feed" />
                  <FeatureRow label="Share burn reports publicly" />
                  <FeatureRow label="Priority support" />
                </>
              )}
            </ul>
          </div>
        )}

        {/* If webhook hasn't fired yet, show a note */}
        {tier === "free" && (
          <div
            className="rounded-xl p-4 text-sm text-muted-foreground"
            style={{ backgroundColor: "var(--muted)", border: "1px solid var(--border)" }}
          >
            Your membership is processing — it should activate within a few seconds.
            Refresh the page if it doesn&apos;t appear shortly.
          </div>
        )}

        {/* CTAs */}
        <div className="space-y-3 pt-2">
          <Link href="/humidor" className="btn btn-primary w-full block text-center">
            Go to My Humidor
          </Link>
          <Link
            href="/membership"
            className="btn btn-ghost w-full block text-center text-sm text-muted-foreground"
          >
            View membership details
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Feature row
   ------------------------------------------------------------------ */

function FeatureRow({ label, gold }: { label: string; gold?: boolean }) {
  return (
    <li className="flex items-center gap-2.5 text-sm text-foreground">
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" className="flex-shrink-0">
        <circle
          cx="7.5"
          cy="7.5"
          r="7"
          fill={gold ? "rgba(212,160,74,0.15)" : "rgba(193,120,23,0.15)"}
        />
        <path
          d="M4.5 7.5L6.5 9.5L10.5 5.5"
          stroke={gold ? "var(--accent)" : "var(--primary)"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </li>
  );
}
