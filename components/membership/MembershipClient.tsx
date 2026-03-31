"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { MembershipTier } from "@/lib/stripe";
import { PLAN_PRICING, FREE_TIER_LIMITS } from "@/lib/membership";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface PriceIds {
  memberMonthly:  string;
  memberAnnual:   string;
  premiumMonthly: string;
  premiumAnnual:  string;
}

interface MembershipClientProps {
  currentTier:      MembershipTier;
  hasStripeCustomer: boolean;
  priceIds:         PriceIds;
}

/* ------------------------------------------------------------------
   Feature lists
   ------------------------------------------------------------------ */

const FREE_FEATURES = [
  `Up to ${FREE_TIER_LIMITS.humidor_items} cigars in your humidor`,
  "Wishlist",
  "Cigar database & search",
  "Burn Reports",
  "Personal stats dashboard",
  "Read community feed",
];

const MEMBER_FEATURES = [
  "Everything in Free",
  "Unlimited humidor items",
  "Post to community feed",
  "Share burn reports publicly",
  "Priority support",
];

const PREMIUM_FEATURES = [
  "Everything in Member",
  "Advanced analytics (coming soon)",
  "Early access to new features",
  "Premium badge on profile",
];

/* ------------------------------------------------------------------
   Check icon
   ------------------------------------------------------------------ */

function Check({ gold }: { gold?: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      aria-hidden="true"
      className="flex-shrink-0 mt-0.5"
    >
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
  );
}

/* ------------------------------------------------------------------
   Tier badge (shown on current plan)
   ------------------------------------------------------------------ */

function CurrentBadge() {
  return (
    <span
      className="text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full"
      style={{ backgroundColor: "var(--secondary)", color: "var(--primary)" }}
    >
      Current plan
    </span>
  );
}

/* ------------------------------------------------------------------
   Main component
   ------------------------------------------------------------------ */

export function MembershipClient({
  currentTier,
  hasStripeCustomer,
  priceIds,
}: MembershipClientProps) {
  const router = useRouter();
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [loading, setLoading] = useState<string | null>(null); // priceId being loaded
  const [error, setError] = useState<string | null>(null);

  /* ── Checkout ─────────────────────────────────────────────────── */

  async function handleUpgrade(priceId: string) {
    setLoading(priceId);
    setError(null);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start checkout");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(null);
    }
  }

  /* ── Manage (customer portal) ─────────────────────────────────── */

  async function handleManage() {
    setLoading("portal");
    setError(null);
    try {
      const res = await fetch("/api/stripe/create-portal-session", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to open portal");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(null);
    }
  }

  /* ── Price helpers ────────────────────────────────────────────── */

  const memberPrice  = interval === "month" ? PLAN_PRICING.member.monthly  : PLAN_PRICING.member.annual;
  const premiumPrice = interval === "month" ? PLAN_PRICING.premium.monthly : PLAN_PRICING.premium.annual;

  const memberPriceId  = interval === "month" ? priceIds.memberMonthly  : priceIds.memberAnnual;
  const premiumPriceId = interval === "month" ? priceIds.premiumMonthly : priceIds.premiumAnnual;

  // Annual savings vs monthly
  const memberSavings  = Math.round((1 - (99 / (9.99 * 12))) * 100);   // ~17%
  const premiumSavings = Math.round((1 - (179 / (19.99 * 12))) * 100); // ~25%

  /* ── Render ───────────────────────────────────────────────────── */

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-10 animate-fade-in">

      {/* Header */}
      <div className="text-center space-y-3 max-w-xl mx-auto">
        <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
          Membership
        </p>
        <h1 style={{ fontFamily: "var(--font-serif)" }}>
          Choose Your Membership
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Unlock unlimited tracking, community features, and deeper insights
          into your collection.
        </p>
      </div>

      {/* Billing interval toggle */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setInterval("month")}
          className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-200"
          style={
            interval === "month"
              ? { backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }
              : { backgroundColor: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }
          }
        >
          Monthly
        </button>

        <button
          type="button"
          onClick={() => setInterval("year")}
          className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2"
          style={
            interval === "year"
              ? { backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }
              : { backgroundColor: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }
          }
        >
          Annual
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{
              backgroundColor: interval === "year" ? "rgba(255,255,255,0.2)" : "rgba(212,160,74,0.2)",
              color: interval === "year" ? "var(--primary-foreground)" : "var(--accent)",
            }}
          >
            Save up to {premiumSavings}%
          </span>
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">

        {/* ── Free ─────────────────────────────────────────────── */}
        <div
          className="rounded-2xl p-6 flex flex-col gap-5"
          style={{
            backgroundColor: "var(--card)",
            border: currentTier === "free"
              ? "2px solid var(--primary)"
              : "1px solid var(--border)",
          }}
        >
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground">
                Free
              </p>
              {currentTier === "free" && <CurrentBadge />}
            </div>
            <p
              className="text-4xl font-bold text-foreground"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              $0
            </p>
            <p className="text-xs text-muted-foreground">forever</p>
          </div>

          <ul className="space-y-2.5 flex-1">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                <Check />
                {f}
              </li>
            ))}
          </ul>

          <div className="mt-auto pt-2">
            {currentTier === "free" ? (
              <div
                className="btn w-full text-center cursor-default opacity-60"
                style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}
              >
                Current Plan
              </div>
            ) : (
              <button
                type="button"
                onClick={handleManage}
                disabled={loading === "portal"}
                className="btn btn-ghost w-full text-sm border"
                style={{ borderColor: "var(--border)" }}
              >
                {loading === "portal" ? "Loading…" : "Downgrade to Free"}
              </button>
            )}
          </div>
        </div>

        {/* ── Member ───────────────────────────────────────────── */}
        <div
          className="rounded-2xl p-6 flex flex-col gap-5 relative"
          style={{
            backgroundColor: "var(--card)",
            border: currentTier === "member"
              ? "2px solid var(--primary)"
              : "1px solid var(--border)",
          }}
        >
          {/* Most popular badge */}
          {currentTier !== "member" && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span
                className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full whitespace-nowrap"
                style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
              >
                Most Popular
              </span>
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: "var(--primary)" }}>
                Member
              </p>
              {currentTier === "member" && <CurrentBadge />}
            </div>
            <div className="flex items-end gap-2">
              <p
                className="text-4xl font-bold text-foreground"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {interval === "month" ? "$9.99" : "$99"}
              </p>
              <p className="text-xs text-muted-foreground pb-1">
                {interval === "month" ? "/month" : "/year"}
              </p>
            </div>
            {interval === "year" && (
              <p className="text-xs" style={{ color: "var(--primary)" }}>
                Save {memberSavings}% vs monthly · $8.25/mo
              </p>
            )}
          </div>

          <ul className="space-y-2.5 flex-1">
            {MEMBER_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                <Check />
                {f}
              </li>
            ))}
          </ul>

          <div className="mt-auto pt-2 space-y-2">
            {currentTier === "member" ? (
              <>
                <div
                  className="btn w-full text-center cursor-default opacity-60"
                  style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}
                >
                  Current Plan
                </div>
                {hasStripeCustomer && (
                  <button
                    type="button"
                    onClick={handleManage}
                    disabled={loading === "portal"}
                    className="btn btn-ghost w-full text-sm text-muted-foreground"
                  >
                    {loading === "portal" ? "Loading…" : "Manage subscription"}
                  </button>
                )}
              </>
            ) : currentTier === "premium" ? (
              <button
                type="button"
                onClick={handleManage}
                disabled={loading === "portal"}
                className="btn btn-ghost w-full text-sm border"
                style={{ borderColor: "var(--border)" }}
              >
                {loading === "portal" ? "Loading…" : "Downgrade to Member"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleUpgrade(memberPriceId)}
                disabled={!!loading}
                className="btn btn-primary w-full"
              >
                {loading === memberPriceId ? "Loading…" : "Upgrade to Member"}
              </button>
            )}
          </div>
        </div>

        {/* ── Premium ──────────────────────────────────────────── */}
        <div
          className="rounded-2xl p-6 flex flex-col gap-5"
          style={{
            backgroundColor: "var(--card)",
            border: currentTier === "premium"
              ? `2px solid var(--accent)`
              : "1px solid var(--border)",
            boxShadow: currentTier !== "premium"
              ? "0 0 0 1px rgba(212,160,74,0.15), inset 0 0 40px rgba(212,160,74,0.03)"
              : undefined,
          }}
        >
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: "var(--accent)" }}>
                Premium
              </p>
              {currentTier === "premium" && <CurrentBadge />}
            </div>
            <div className="flex items-end gap-2">
              <p
                className="text-4xl font-bold text-foreground"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {interval === "month" ? "$19.99" : "$179"}
              </p>
              <p className="text-xs text-muted-foreground pb-1">
                {interval === "month" ? "/month" : "/year"}
              </p>
            </div>
            {interval === "year" && (
              <p className="text-xs" style={{ color: "var(--accent)" }}>
                Save {premiumSavings}% vs monthly · $14.92/mo
              </p>
            )}
          </div>

          <ul className="space-y-2.5 flex-1">
            {PREMIUM_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                <Check gold />
                {f}
              </li>
            ))}
          </ul>

          <div className="mt-auto pt-2 space-y-2">
            {currentTier === "premium" ? (
              <>
                <div
                  className="btn w-full text-center cursor-default opacity-60"
                  style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}
                >
                  Current Plan
                </div>
                {hasStripeCustomer && (
                  <button
                    type="button"
                    onClick={handleManage}
                    disabled={loading === "portal"}
                    className="btn btn-ghost w-full text-sm text-muted-foreground"
                  >
                    {loading === "portal" ? "Loading…" : "Manage subscription"}
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleUpgrade(premiumPriceId)}
                disabled={!!loading}
                className="btn w-full font-semibold transition-all duration-200"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-foreground)",
                }}
              >
                {loading === premiumPriceId
                  ? "Loading…"
                  : currentTier === "member"
                  ? "Upgrade to Premium"
                  : "Get Premium"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Feature comparison table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: "1px solid var(--border)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "var(--muted)" }}>
              <th className="text-left px-5 py-3 text-xs uppercase tracking-widest font-semibold text-muted-foreground w-1/2">
                Feature
              </th>
              <th className="px-4 py-3 text-center text-xs uppercase tracking-widest font-semibold text-muted-foreground">
                Free
              </th>
              <th className="px-4 py-3 text-center text-xs uppercase tracking-widest font-semibold" style={{ color: "var(--primary)" }}>
                Member
              </th>
              <th className="px-4 py-3 text-center text-xs uppercase tracking-widest font-semibold" style={{ color: "var(--accent)" }}>
                Premium
              </th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Humidor items",       free: "25 max",  member: "Unlimited", premium: "Unlimited" },
              { label: "Burn Reports",        free: true,      member: true,        premium: true },
              { label: "Wishlist",            free: true,      member: true,        premium: true },
              { label: "Personal stats",      free: true,      member: true,        premium: true },
              { label: "Read community feed", free: true,      member: true,        premium: true },
              { label: "Post to feed",        free: false,     member: true,        premium: true },
              { label: "Share burn reports",  free: false,     member: true,        premium: true },
              { label: "Advanced analytics",  free: false,     member: false,       premium: "Soon" },
              { label: "Premium badge",       free: false,     member: false,       premium: true },
            ].map((row, i) => (
              <tr
                key={row.label}
                style={{
                  backgroundColor: i % 2 === 0 ? "var(--card)" : "var(--muted)",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <td className="px-5 py-3 text-foreground">{row.label}</td>
                {[row.free, row.member, row.premium].map((val, j) => (
                  <td key={j} className="px-4 py-3 text-center">
                    {val === true ? (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="inline-block">
                        <path d="M3 8L6.5 11.5L13 4.5" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : val === false ? (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="inline-block opacity-30">
                        <path d="M4 4L12 12M12 4L4 12" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    ) : (
                      <span
                        className="text-xs font-medium"
                        style={{ color: j === 2 ? "var(--accent)" : "var(--primary)" }}
                      >
                        {val}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <p className="text-center text-xs text-muted-foreground pb-4">
        All plans include a 7-day free trial. Cancel anytime.{" "}
        <Link href="/humidor" className="underline underline-offset-2 hover:text-foreground transition-colors">
          Back to humidor
        </Link>
      </p>
    </div>
  );
}
