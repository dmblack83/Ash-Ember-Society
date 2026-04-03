"use client";

import { useState } from "react";
import Link from "next/link";
import { MembershipCard } from "@/components/membership/MembershipCard";
import type { MembershipTier } from "@/lib/stripe";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface PriceIds {
  memberMonthly:  string;
  memberAnnual:   string;
  premiumMonthly: string;
  premiumAnnual:  string;
}

export interface MembershipClientProps {
  userId:           string;
  currentTier:      MembershipTier;
  hasStripeCustomer: boolean;
  displayName:      string;
  memberSince:      string | null;
  nextBillingDate:  string | null;
  billingInterval:  "month" | "year" | null;
  priceIds:         PriceIds;
}

/* ------------------------------------------------------------------
   Feature comparison data
   ------------------------------------------------------------------ */

type FeatureValue = boolean | string;

interface Feature {
  label:   string;
  free:    FeatureValue;
  member:  FeatureValue;
  premium: FeatureValue;
}

const FEATURES: Feature[] = [
  { label: "Humidor management",       free: "25 cigars",  member: "Unlimited", premium: "Unlimited" },
  { label: "Cigar database & search",  free: true,         member: true,        premium: true        },
  { label: "Community feed (read)",    free: true,         member: true,        premium: true        },
  { label: "Community feed (post)",    free: false,        member: true,        premium: true        },
  { label: "Shop discounts",           free: false,        member: "10%",       premium: "15%"       },
  { label: "Event RSVPs",              free: false,        member: true,        premium: true        },
  { label: "Exclusive events",         free: false,        member: false,       premium: true        },
  { label: "Stats & analytics",        free: "Basic",      member: "Full",      premium: "Full"      },
  { label: "Digital membership card",  free: false,        member: true,        premium: true        },
];

/* ------------------------------------------------------------------
   Cell renderer
   ------------------------------------------------------------------ */

function Cell({ value, gold }: { value: FeatureValue; gold?: boolean }) {
  if (value === true) {
    return (
      <div className="flex justify-center">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-label="Included">
          <circle cx="9" cy="9" r="8" fill={gold ? "rgba(212,160,74,0.15)" : "rgba(193,120,23,0.15)"} />
          <path
            d="M5.5 9L7.5 11L12.5 6"
            stroke={gold ? "var(--accent)" : "var(--primary)"}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }
  if (value === false) {
    return (
      <div className="flex justify-center">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-label="Not included">
          <path
            d="M6 6L12 12M12 6L6 12"
            stroke="var(--muted-foreground)"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.5"
          />
        </svg>
      </div>
    );
  }
  return (
    <p
      className="text-center text-xs font-semibold"
      style={{ color: gold ? "var(--accent)" : "var(--primary)" }}
    >
      {value}
    </p>
  );
}

/* ------------------------------------------------------------------
   Current-plan badge
   ------------------------------------------------------------------ */

function CurrentBadge() {
  return (
    <span
      className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
      style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}
    >
      Current plan
    </span>
  );
}

/* ------------------------------------------------------------------
   Paid member view
   ------------------------------------------------------------------ */

function PaidView({
  userId,
  currentTier,
  displayName,
  memberSince,
  nextBillingDate,
  billingInterval,
}: {
  userId:          string;
  currentTier:     MembershipTier;
  displayName:     string;
  memberSince:     string | null;
  nextBillingDate: string | null;
  billingInterval: "month" | "year" | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const isPremium = currentTier === "premium";

  async function handleManage() {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/stripe/create-portal-session", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to open portal");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 space-y-8 animate-fade-in">

      {/* Header */}
      <div className="text-center space-y-2">
        <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
          Membership
        </p>
        <h1 style={{ fontFamily: "var(--font-serif)" }}>
          {isPremium ? (
            <span className="text-gradient-gold">Premium Member</span>
          ) : (
            <span style={{ color: "var(--primary)" }}>Member</span>
          )}
        </h1>
      </div>

      {/* Plan summary card */}
      <div className={`card ${isPremium ? "card-premium" : ""} space-y-5`}>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
              Active Plan
            </p>
            <p className="text-lg font-semibold text-foreground" style={{ fontFamily: "var(--font-serif)" }}>
              {isPremium ? "Premium" : "Member"}
              {" · "}
              <span className="text-sm font-normal text-muted-foreground">
                {billingInterval === "year" ? "Annual" : "Monthly"}
              </span>
            </p>
          </div>
          <span
            className="flex-shrink-0 text-xs font-semibold px-3 py-1 rounded-full"
            style={{
              backgroundColor: isPremium ? "rgba(212,160,74,0.12)" : "rgba(193,120,23,0.12)",
              color: isPremium ? "var(--accent)" : "var(--primary)",
              border: `1px solid ${isPremium ? "rgba(212,160,74,0.3)" : "rgba(193,120,23,0.3)"}`,
            }}
          >
            Active
          </span>
        </div>

        {nextBillingDate && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M1 5.5h12M4.5 1v2M9.5 1v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Next billing date: <span className="text-foreground font-medium">{nextBillingDate}</span>
          </div>
        )}

        {memberSince && (
          <p className="text-xs text-muted-foreground">
            Member since{" "}
            {new Date(memberSince).toLocaleDateString("en-US", { year: "numeric", month: "long" })}
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <button
            type="button"
            onClick={handleManage}
            disabled={loading}
            className="btn btn-primary flex-1"
          >
            {loading ? "Loading…" : "Manage Subscription"}
          </button>
          {!isPremium && (
            <Link
              href="#pricing"
              className="btn btn-gold flex-1 text-center"
            >
              Upgrade to Premium
            </Link>
          )}
        </div>
      </div>

      {/* Digital membership card */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Your Membership Card</h2>
        <MembershipCard
          userId={userId}
          displayName={displayName}
          tier={currentTier}
          memberSince={memberSince}
        />
      </div>

      {/* Show pricing anchor for upgrades */}
      {!isPremium && (
        <div id="pricing">
          <PricingTable currentTier={currentTier} priceIds={{ memberMonthly: "", memberAnnual: "", premiumMonthly: "", premiumAnnual: "" }} isExistingUser />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Pricing table (used for free users and premium upgrade from member)
   ------------------------------------------------------------------ */

function PricingTable({
  currentTier,
  priceIds,
  isExistingUser = false,
}: {
  currentTier:    MembershipTier;
  priceIds:       PriceIds;
  isExistingUser?: boolean;
}) {
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [loading, setLoading]   = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);

  async function handleUpgrade(priceId: string) {
    if (!priceId) return;
    setLoading(priceId);
    setError(null);
    try {
      const res  = await fetch("/api/stripe/create-checkout-session", {
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

  const memberPriceId  = interval === "month" ? priceIds.memberMonthly  : priceIds.memberAnnual;
  const premiumPriceId = interval === "month" ? priceIds.premiumMonthly : priceIds.premiumAnnual;

  const memberMonthlyEquiv  = interval === "year" ? "$8.25" : "$9.99";
  const premiumMonthlyEquiv = interval === "year" ? "$14.92" : "$19.99";
  const memberSavingsPct    = 17;
  const premiumSavingsPct   = 25;

  const memberCtaLabel = isExistingUser
    ? "Upgrade to Member"
    : currentTier === "free"
    ? "Start 14-Day Free Trial"
    : "Upgrade to Member";

  return (
    <div className="space-y-8">
      {/* Toggle */}
      <div className="flex items-center justify-center gap-3">
        {(["month", "year"] as const).map((iv) => (
          <button
            key={iv}
            type="button"
            onClick={() => setInterval(iv)}
            className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2"
            style={
              interval === iv
                ? { backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }
                : { backgroundColor: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }
            }
          >
            {iv === "month" ? "Monthly" : "Annual"}
            {iv === "year" && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: interval === "year" ? "rgba(255,255,255,0.2)" : "rgba(193,120,23,0.15)",
                  color: interval === "year" ? "var(--primary-foreground)" : "var(--primary)",
                }}
              >
                Save up to {premiumSavingsPct}%
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive text-center">{error}</p>}

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 items-stretch">

        {/* ── Free ──────────────────────────────────────────────── */}
        <div
          className="card flex flex-col gap-5"
          style={currentTier === "free" ? { borderColor: "rgba(193,120,23,0.4)" } : {}}
        >
          <div className="space-y-1">
            <div className="flex items-center justify-between min-h-[22px]">
              <p className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground">
                Free
              </p>
              {currentTier === "free" && <CurrentBadge />}
            </div>
            <p className="text-4xl font-bold text-foreground" style={{ fontFamily: "var(--font-serif)" }}>
              $0
            </p>
            <p className="text-xs text-muted-foreground">forever</p>
          </div>

          <ul className="space-y-2 flex-1">
            {FEATURES.map((f) => (
              <li key={f.label} className="flex items-center gap-2.5 text-sm">
                <Cell value={typeof f.free === "boolean" ? f.free : true} />
                <span className={typeof f.free === "boolean" && !f.free ? "text-muted-foreground line-through opacity-60" : "text-foreground"}>
                  {typeof f.free === "string" ? `${f.label} (${f.free})` : f.label}
                </span>
              </li>
            ))}
          </ul>

          <div
            className="btn w-full text-center text-sm cursor-default mt-auto"
            style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}
          >
            {currentTier === "free" ? "Current Plan" : "Free Tier"}
          </div>
        </div>

        {/* ── Member ────────────────────────────────────────────── */}
        <div
          className="card glow-ember flex flex-col gap-5 relative"
          style={{
            borderColor: currentTier === "member" ? "var(--primary)" : "rgba(193,120,23,0.5)",
            borderWidth: "2px",
          }}
        >
          {/* Most popular pill */}
          {currentTier !== "member" && (
            <div className="absolute -top-3.5 inset-x-0 flex justify-center">
              <span
                className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full"
                style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
              >
                Most Popular
              </span>
            </div>
          )}

          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between min-h-[22px]">
              <p className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: "var(--primary)" }}>
                Member
              </p>
              {currentTier === "member" && <CurrentBadge />}
            </div>
            <div className="flex items-end gap-2">
              <p className="text-4xl font-bold text-foreground" style={{ fontFamily: "var(--font-serif)" }}>
                {memberMonthlyEquiv}
              </p>
              <p className="text-xs text-muted-foreground pb-1.5">/month</p>
            </div>
            {interval === "year" ? (
              <p className="text-xs" style={{ color: "var(--primary)" }}>
                Billed $99/year · Save {memberSavingsPct}%
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">billed monthly</p>
            )}
          </div>

          <ul className="space-y-2 flex-1">
            {FEATURES.map((f) => (
              <li key={f.label} className="flex items-center gap-2.5 text-sm">
                <Cell value={typeof f.member === "boolean" ? f.member : true} />
                <span className={typeof f.member === "boolean" && !f.member ? "text-muted-foreground line-through opacity-60" : "text-foreground"}>
                  {typeof f.member === "string" ? `${f.label} (${f.member})` : f.label}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-auto pt-1">
            {currentTier === "member" ? (
              <div
                className="btn w-full text-center text-sm cursor-default"
                style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}
              >
                Current Plan
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleUpgrade(memberPriceId)}
                disabled={!!loading || currentTier === "premium"}
                className="btn btn-primary w-full"
              >
                {loading === memberPriceId ? "Loading…" : memberCtaLabel}
              </button>
            )}
          </div>
        </div>

        {/* ── Premium ───────────────────────────────────────────── */}
        <div
          className="card card-premium flex flex-col gap-5"
          style={
            currentTier === "premium"
              ? { borderColor: "var(--accent)", borderWidth: "2px" }
              : {}
          }
        >
          <div className="space-y-1">
            <div className="flex items-center justify-between min-h-[22px]">
              <p className="text-[11px] uppercase tracking-widest font-semibold text-gradient-gold">
                Premium
              </p>
              {currentTier === "premium" && <CurrentBadge />}
            </div>
            <div className="flex items-end gap-2">
              <p className="text-4xl font-bold text-foreground" style={{ fontFamily: "var(--font-serif)" }}>
                {premiumMonthlyEquiv}
              </p>
              <p className="text-xs text-muted-foreground pb-1.5">/month</p>
            </div>
            {interval === "year" ? (
              <p className="text-xs" style={{ color: "var(--accent)" }}>
                Billed $179/year · Save {premiumSavingsPct}%
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">billed monthly</p>
            )}
          </div>

          <ul className="space-y-2 flex-1">
            {FEATURES.map((f) => (
              <li key={f.label} className="flex items-center gap-2.5 text-sm">
                <Cell value={typeof f.premium === "boolean" ? f.premium : true} gold />
                <span className={typeof f.premium === "boolean" && !f.premium ? "text-muted-foreground line-through opacity-60" : "text-foreground"}>
                  {typeof f.premium === "string" ? `${f.label} (${f.premium})` : f.label}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-auto pt-1">
            {currentTier === "premium" ? (
              <div
                className="btn w-full text-center text-sm cursor-default"
                style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}
              >
                Current Plan
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleUpgrade(premiumPriceId)}
                disabled={!!loading}
                className="btn btn-gold w-full glow-gold"
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

      {/* Footer note */}
      <p className="text-center text-xs text-muted-foreground pb-2">
        All paid plans include a 14-day free trial. Cancel anytime via the customer portal.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------
   Main export
   ------------------------------------------------------------------ */

export function MembershipClient({
  userId,
  currentTier,
  hasStripeCustomer,
  displayName,
  memberSince,
  nextBillingDate,
  billingInterval,
  priceIds,
}: MembershipClientProps) {
  /* Paid users see their plan details + optional upgrade path */
  if (currentTier !== "free") {
    return (
      <PaidView
        userId={userId}
        currentTier={currentTier}
        displayName={displayName}
        memberSince={memberSince}
        nextBillingDate={nextBillingDate}
        billingInterval={billingInterval}
      />
    );
  }

  /* Free users see the full pricing comparison */
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-10 animate-fade-in">
      <div className="text-center space-y-3 max-w-xl mx-auto">
        <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
          Membership
        </p>
        <h1 style={{ fontFamily: "var(--font-serif)" }}>Choose Your Membership</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Unlock unlimited tracking, a digital membership card, community access, and exclusive event perks.
        </p>
      </div>
      <PricingTable currentTier={currentTier} priceIds={priceIds} />
    </div>
  );
}
