"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/ui/toast";
import { TIER_DISPLAY, PLAN_PRICING } from "@/lib/membership";
import type { MembershipTier } from "@/lib/stripe";

/* ------------------------------------------------------------------
   Feature table
   ------------------------------------------------------------------ */

type FeatureValue = boolean | string;
interface Feature { label: string; free: FeatureValue; member: FeatureValue; premium: FeatureValue; }

const FEATURES: Feature[] = [
  { label: "Humidor items",           free: "25 max",    member: "Unlimited", premium: "Unlimited" },
  { label: "Cigar catalog & search",  free: true,        member: true,        premium: true        },
  { label: "Community feed (read)",   free: true,        member: true,        premium: true        },
  { label: "Community feed (post)",   free: false,       member: true,        premium: true        },
  { label: "Burn reports",            free: true,        member: true,        premium: true        },
  { label: "Shop discounts",          free: false,       member: "10%",       premium: "15%"       },
  { label: "Event RSVPs",             free: false,       member: true,        premium: true        },
  { label: "Exclusive events",        free: false,       member: false,       premium: true        },
  { label: "Stats & analytics",       free: "Basic",     member: "Full",      premium: "Full"      },
  { label: "Digital membership card", free: false,       member: true,        premium: true        },
];

function FeatureCell({ value, isPremium }: { value: FeatureValue; isPremium?: boolean }) {
  const color = isPremium ? "var(--accent)" : "var(--primary)";
  if (value === true) return (
    <div className="flex justify-center">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-label="Included">
        <circle cx="8" cy="8" r="7" fill={isPremium ? "rgba(212,160,74,0.15)" : "rgba(193,120,23,0.15)"} />
        <path d="M4.5 8L6.5 10L11.5 5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
  if (value === false) return (
    <div className="flex justify-center">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-label="Not included">
        <path d="M5 5L11 11M11 5L5 11" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
      </svg>
    </div>
  );
  return <p className="text-center text-xs font-semibold" style={{ color }}>{value}</p>;
}

/* ------------------------------------------------------------------
   Downgrade confirmation modal
   ------------------------------------------------------------------ */

interface DowngradeModalProps {
  targetTier:    "free" | "member";
  currentTier:   MembershipTier;
  nextBillingDate: string | null;
  onConfirm:     () => void;
  onCancel:      () => void;
  loading:       boolean;
}

function DowngradeModal({ targetTier, currentTier, nextBillingDate, onConfirm, onCancel, loading }: DowngradeModalProps) {
  const targetLabel = targetTier === "free" ? "Free" : "Member";
  const currentLabel = TIER_DISPLAY[currentTier].label;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 animate-fade-in" onClick={onCancel} />
      <div
        className="fixed inset-x-4 bottom-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-sm sm:w-full z-50 rounded-2xl p-6 space-y-5 animate-slide-up"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
      >
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "var(--font-serif)" }}>
            Downgrade to {targetLabel}?
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {targetTier === "free"
              ? `Your ${currentLabel} subscription will cancel on ${nextBillingDate ?? "your next billing date"}. You keep your current benefits until then.`
              : `Your plan will switch to Member. No charge or credit will be applied for the current billing period.`
            }
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 btn btn-ghost text-sm"
            style={{ minHeight: 44, touchAction: "manipulation" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 btn text-sm"
            style={{
              minHeight: 44,
              backgroundColor: "#C44536",
              color: "#fff",
              border: "none",
              touchAction: "manipulation",
            }}
          >
            {loading ? "Processing…" : "Confirm"}
          </button>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------
   Main component
   ------------------------------------------------------------------ */

interface Props {
  userId:          string;
  currentTier:     MembershipTier;
  hasStripeCustomer: boolean;
  nextBillingDate: string | null;
  billingInterval: "month" | "year" | null;
  currentPeriodEnd: number | null;
  priceIds: {
    memberMonthly:  string;
    memberAnnual:   string;
    premiumMonthly: string;
    premiumAnnual:  string;
  };
}

export function MembershipTab({
  currentTier,
  hasStripeCustomer,
  nextBillingDate,
  billingInterval,
  priceIds,
}: Props) {
  const router = useRouter();

  const [billingCycle,    setBillingCycle]    = useState<"month" | "year">(billingInterval ?? "month");
  const [upgrading,       setUpgrading]       = useState(false);
  const [portalLoading,   setPortalLoading]   = useState(false);
  const [downgradeTarget, setDowngradeTarget] = useState<"free" | "member" | null>(null);
  const [downgradeLoading, setDowngradeLoading] = useState(false);
  const [toast,           setToast]           = useState<string | null>(null);

  const isPaid    = currentTier !== "free";
  const tierInfo  = TIER_DISPLAY[currentTier];

  /* ── Upgrade ─────────────────────────────────────────────────── */
  async function handleUpgrade(tier: "member" | "premium") {
    const priceId = tier === "member"
      ? (billingCycle === "year" ? priceIds.memberAnnual  : priceIds.memberMonthly)
      : (billingCycle === "year" ? priceIds.premiumAnnual : priceIds.premiumMonthly);

    if (!priceId) { setToast("Price not configured."); return; }

    setUpgrading(true);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      router.push(data.url);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to start checkout.");
      setUpgrading(false);
    }
  }

  /* ── Billing portal ──────────────────────────────────────────── */
  async function handleBillingPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/create-portal-session", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not open billing portal.");
    } finally {
      setPortalLoading(false);
    }
  }

  /* ── Downgrade ───────────────────────────────────────────────── */
  async function handleDowngradeConfirm() {
    if (!downgradeTarget) return;
    setDowngradeLoading(true);
    try {
      const res = await fetch("/api/stripe/schedule-downgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetTier: downgradeTarget }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const msg = downgradeTarget === "free"
        ? `Subscription will cancel on ${data.effectiveDate}.`
        : "Plan switched to Member.";
      setToast(msg);
      setDowngradeTarget(null);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Downgrade failed.");
    } finally {
      setDowngradeLoading(false);
    }
  }

  /* ── Pricing helper ──────────────────────────────────────────── */
  const pricingLabel = (tier: "member" | "premium") =>
    billingCycle === "year"
      ? PLAN_PRICING[tier].annual.label
      : PLAN_PRICING[tier].monthly.label;

  return (
    <div className="space-y-8 animate-fade-in pb-10">

      {/* ── Current plan card ──────────────────────────────────── */}
      <section
        className="glass rounded-2xl p-5 space-y-3"
        style={isPaid ? { border: "1px solid rgba(212,160,74,0.35)" } : undefined}
      >
        <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
          Current Plan
        </p>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xl font-semibold" style={{ color: tierInfo.color, fontFamily: "var(--font-serif)" }}>
              {tierInfo.label}
            </p>
            {isPaid && (
              <p className="text-sm text-muted-foreground">
                {pricingLabel(currentTier as "member" | "premium")}
                {nextBillingDate && ` · Renews ${nextBillingDate}`}
              </p>
            )}
            {!isPaid && (
              <p className="text-sm text-muted-foreground">Free forever · Up to 25 humidor items</p>
            )}
          </div>
          {isPaid && (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0"
              style={{
                background: currentTier === "premium" ? "rgba(212,160,74,0.12)" : "rgba(193,120,23,0.12)",
                border: `1px solid ${currentTier === "premium" ? "rgba(212,160,74,0.3)" : "rgba(193,120,23,0.3)"}`,
                color: tierInfo.color,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M5 1L6.2 3.8L9.5 3.8L7 5.8L7.9 9L5 7.2L2.1 9L3 5.8L0.5 3.8L3.8 3.8L5 1Z" fill={tierInfo.color}/>
              </svg>
              Active
            </span>
          )}
        </div>

        {/* Manage Billing */}
        {hasStripeCustomer && (
          <button
            type="button"
            onClick={handleBillingPortal}
            disabled={portalLoading}
            className="btn btn-ghost text-sm w-full mt-1"
            style={{ minHeight: 44, touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
          >
            {portalLoading ? "Opening…" : "Manage Billing →"}
          </button>
        )}
      </section>

      {/* ── Billing cycle toggle ───────────────────────────────── */}
      {!isPaid && (
        <section className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setBillingCycle("month")}
            className="px-4 py-2 rounded-full text-sm font-medium transition-colors"
            style={{
              backgroundColor: billingCycle === "month" ? "var(--primary)" : "var(--secondary)",
              color: billingCycle === "month" ? "#fff" : "var(--muted-foreground)",
              border: "none", minHeight: 36, touchAction: "manipulation",
            }}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle("year")}
            className="px-4 py-2 rounded-full text-sm font-medium transition-colors"
            style={{
              backgroundColor: billingCycle === "year" ? "var(--primary)" : "var(--secondary)",
              color: billingCycle === "year" ? "#fff" : "var(--muted-foreground)",
              border: "none", minHeight: 36, touchAction: "manipulation",
            }}
          >
            Annual
            <span className="ml-1.5 text-[10px] font-bold" style={{ color: billingCycle === "year" ? "var(--accent)" : "var(--muted-foreground)" }}>
              SAVE 17%
            </span>
          </button>
        </section>
      )}

      {/* ── Plan cards ─────────────────────────────────────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {(["free", "member", "premium"] as MembershipTier[]).map(tier => {
          const info      = TIER_DISPLAY[tier];
          const isCurrent = tier === currentTier;
          const isPremTier = tier === "premium";
          return (
            <div
              key={tier}
              className="rounded-2xl p-5 space-y-4 flex flex-col"
              style={{
                backgroundColor: isCurrent ? "var(--secondary)" : "var(--card)",
                border: isCurrent
                  ? `2px solid ${info.color}`
                  : "1px solid var(--border)",
              }}
            >
              {/* Tier name + price */}
              <div>
                <p className="font-semibold text-base" style={{ color: info.color, fontFamily: "var(--font-serif)" }}>
                  {info.label}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {tier === "free"
                    ? "Free forever"
                    : pricingLabel(tier as "member" | "premium")}
                </p>
              </div>

              {/* Feature list */}
              <ul className="space-y-2 flex-1">
                {FEATURES.slice(0, 5).map(f => {
                  const val = f[tier];
                  return (
                    <li key={f.label} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FeatureCell value={val} isPremium={isPremTier} />
                      <span>{f.label}</span>
                    </li>
                  );
                })}
              </ul>

              {/* CTA */}
              {isCurrent ? (
                <span className="block text-center text-xs font-semibold py-2.5" style={{ color: info.color }}>
                  Current Plan
                </span>
              ) : tier !== "free" && currentTier === "free" ? (
                <button
                  type="button"
                  onClick={() => handleUpgrade(tier as "member" | "premium")}
                  disabled={upgrading}
                  className="w-full btn btn-primary text-sm"
                  style={{ minHeight: 44, backgroundColor: info.color, borderColor: info.color, touchAction: "manipulation" }}
                >
                  {upgrading ? "…" : `Upgrade to ${info.label}`}
                </button>
              ) : tier === "premium" && currentTier === "member" ? (
                <button
                  type="button"
                  onClick={() => handleUpgrade("premium")}
                  disabled={upgrading}
                  className="w-full btn btn-primary text-sm"
                  style={{ minHeight: 44, backgroundColor: "var(--accent)", borderColor: "var(--accent)", touchAction: "manipulation" }}
                >
                  {upgrading ? "…" : "Upgrade to Premium"}
                </button>
              ) : tier === "member" && currentTier === "premium" ? (
                <button
                  type="button"
                  onClick={() => setDowngradeTarget("member")}
                  className="w-full btn btn-ghost text-sm text-muted-foreground"
                  style={{ minHeight: 44, touchAction: "manipulation" }}
                >
                  Downgrade to Member
                </button>
              ) : tier === "free" && currentTier !== "free" ? (
                <button
                  type="button"
                  onClick={() => setDowngradeTarget("free")}
                  className="w-full btn btn-ghost text-sm text-muted-foreground"
                  style={{ minHeight: 44, touchAction: "manipulation" }}
                >
                  Downgrade to Free
                </button>
              ) : null}
            </div>
          );
        })}
      </section>

      {/* ── Full feature comparison ────────────────────────────── */}
      <section
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
      >
        <div className="grid grid-cols-4 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
          <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground col-span-1">Feature</p>
          {(["free", "member", "premium"] as MembershipTier[]).map(t => (
            <p key={t} className="text-[11px] uppercase tracking-widest font-medium text-center"
              style={{ color: currentTier === t ? TIER_DISPLAY[t].color : "var(--muted-foreground)" }}>
              {TIER_DISPLAY[t].label}
            </p>
          ))}
        </div>
        {FEATURES.map((f, i) => (
          <div
            key={f.label}
            className="grid grid-cols-4 items-center px-4 py-3"
            style={{ borderBottom: i < FEATURES.length - 1 ? "1px solid var(--border)" : "none" }}
          >
            <p className="text-xs text-muted-foreground col-span-1 pr-2">{f.label}</p>
            <FeatureCell value={f.free} />
            <FeatureCell value={f.member} />
            <FeatureCell value={f.premium} isPremium />
          </div>
        ))}
      </section>

      {/* ── Downgrade modal ────────────────────────────────────── */}
      {downgradeTarget && (
        <DowngradeModal
          targetTier={downgradeTarget}
          currentTier={currentTier}
          nextBillingDate={nextBillingDate}
          onConfirm={handleDowngradeConfirm}
          onCancel={() => setDowngradeTarget(null)}
          loading={downgradeLoading}
        />
      )}

      {/* ── Toast ──────────────────────────────────────────────── */}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
