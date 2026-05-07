"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/ui/toast";
import { TIER_DISPLAY, PLAN_PRICING } from "@/lib/membership";
import type { MembershipTier } from "@/lib/stripe";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";

/* ------------------------------------------------------------------
   Feature comparison table
   ------------------------------------------------------------------ */

type FeatureValue = boolean | string;
interface Feature {
  label:  string;
  free:   FeatureValue;
  member: FeatureValue;
}

const FEATURES: Feature[] = [
  { label: "Humidor",                free: "5 Cigars",     member: "Unlimited"   },
  { label: "Cigar Catalog & Search", free: true,           member: true          },
  { label: "Cigar Scanner",          free: false,          member: "25 scans/mo" },
  { label: "Wishlist",               free: "5 Cigars",     member: "Unlimited"   },
  { label: "Smoke Logs",             free: true,           member: true          },
  { label: "Burn Reports",           free: false,          member: "Unlimited"   },
  { label: "Lounge Access",          free: "10 posts/mo",  member: "Unlimited"   },
];

function FeatureCell({ value }: { value: FeatureValue }) {
  if (value === true) return (
    <div className="flex justify-center">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-label="Included">
        <circle cx="8" cy="8" r="7" fill="rgba(193,120,23,0.15)" />
        <path d="M4.5 8L6.5 10L11.5 5" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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
  return <p className="text-center text-xs font-semibold" style={{ color: "var(--primary)" }}>{value}</p>;
}

/* ------------------------------------------------------------------
   Downgrade confirmation — always centered
   ------------------------------------------------------------------ */

interface DowngradeModalProps {
  targetTier:      "free" | "member";
  currentTier:     MembershipTier;
  nextBillingDate: string | null;
  onConfirm:       () => void;
  onCancel:        () => void;
  loading:         boolean;
}

function DowngradeModal({ targetTier, currentTier, nextBillingDate, onConfirm, onCancel, loading }: DowngradeModalProps) {
  /* Mounted only when downgrade is pending — listener attaches for
     the modal's full lifetime. */
  useEscapeKey(true, onCancel);

  const targetLabel  = targetTier === "free" ? "Free" : "Member";
  const currentLabel = TIER_DISPLAY[currentTier].label;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/60 animate-fade-in" onClick={onCancel} />
      <div
        className="fixed z-[60] rounded-2xl p-6 space-y-5 w-[calc(100%-32px)] max-w-sm"
        style={{
          top:             "50%",
          left:            "50%",
          transform:       "translate(-50%, -50%)",
          backgroundColor: "var(--card)",
          border:          "1px solid var(--border)",
        }}
      >
        <div className="space-y-2">
          <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-serif)", color: "var(--foreground)" }}>
            Downgrade to {targetLabel}?
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
            {targetTier === "free"
              ? `Your ${currentLabel} subscription will cancel on ${nextBillingDate ?? "your next billing date"}. You keep your current benefits until then.`
              : "Your plan will switch to Member. No charge or credit will be applied for the current billing period."
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
            style={{ minHeight: 44, backgroundColor: "#C44536", color: "#fff", border: "none", touchAction: "manipulation" }}
          >
            {loading ? "Processing…" : "Confirm"}
          </button>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------
   Shared card action row styles
   Upgrade = filled button. Downgrade / Current Plan = plain text.
   All three use identical font so hierarchy comes from the fill only.
   ------------------------------------------------------------------ */

const ACTION_TEXT_BASE: React.CSSProperties = {
  display:    "block",
  width:      "100%",
  textAlign:  "center",
  fontSize:   13,
  fontWeight: 500,
  padding:    "10px 0",
  marginTop:  "auto",
};

/* ------------------------------------------------------------------
   Main component
   ------------------------------------------------------------------ */

interface Props {
  userId:           string;
  currentTier:      MembershipTier;
  hasStripeCustomer: boolean;
  nextBillingDate:  string | null;
  billingInterval:  "month" | "year" | null;
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

  const [billingCycle,     setBillingCycle]     = useState<"month" | "year">(billingInterval ?? "month");
  const [upgrading,        setUpgrading]        = useState(false);
  const [portalLoading,    setPortalLoading]    = useState(false);
  const [downgradeTarget,  setDowngradeTarget]  = useState<"free" | "member" | null>(null);
  const [downgradeLoading, setDowngradeLoading] = useState(false);
  const [toast,            setToast]            = useState<string | null>(null);
  const [featureTier,      setFeatureTier]      = useState<MembershipTier>(currentTier);

  const isPaid   = currentTier !== "free";
  const tierInfo = TIER_DISPLAY[currentTier];

  /* ── Upgrade ─────────────────────────────────────────────────── */
  async function handleUpgrade(tier: "member" | "premium") {
    const priceId = tier === "member"
      ? (billingCycle === "year" ? priceIds.memberAnnual  : priceIds.memberMonthly)
      : (billingCycle === "year" ? priceIds.premiumAnnual : priceIds.premiumMonthly);

    if (!priceId) { setToast("Price not configured."); return; }

    setUpgrading(true);
    try {
      const res  = await fetch("/api/stripe/create-checkout-session", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ priceId }),
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
      const res  = await fetch("/api/stripe/create-portal-session", { method: "POST" });
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
      const res  = await fetch("/api/stripe/schedule-downgrade", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ targetTier: downgradeTarget }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setToast(downgradeTarget === "free"
        ? `Subscription will cancel on ${data.effectiveDate}.`
        : "Plan switched to Member.");
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

      {/* ── Current plan summary ───────────────────────────────── */}
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
            {isPaid ? (
              <p className="text-sm text-muted-foreground">
                {pricingLabel(currentTier as "member" | "premium")}
                {nextBillingDate && ` · Renews ${nextBillingDate}`}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Free forever</p>
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

      {/* ── Billing cycle toggle (free users only) ─────────────── */}
      {!isPaid && (
        <section className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setBillingCycle("month")}
            className="px-4 py-2 rounded-full text-sm font-medium transition-colors"
            style={{
              backgroundColor: billingCycle === "month" ? "var(--primary)" : "var(--secondary)",
              color:           billingCycle === "month" ? "#fff" : "var(--muted-foreground)",
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
              color:           billingCycle === "year" ? "#fff" : "var(--muted-foreground)",
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

      {/* ── Tier cards ─────────────────────────────────────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Free */}
        {(() => {
          const isCurrent = currentTier === "free";
          const info      = TIER_DISPLAY["free"];
          return (
            <div
              className="rounded-2xl p-5 flex flex-col"
              style={{
                backgroundColor: isCurrent ? "var(--secondary)" : "var(--card)",
                border: isCurrent ? `2px solid ${info.color}` : "1px solid var(--border)",
                minHeight: 120,
              }}
            >
              <div>
                <p className="font-semibold text-base" style={{ color: info.color, fontFamily: "var(--font-serif)" }}>Free</p>
                <p className="text-sm text-muted-foreground mt-0.5">Free forever</p>
              </div>

              {isCurrent ? (
                <span style={{ ...ACTION_TEXT_BASE, color: info.color }}>Current Plan</span>
              ) : (
                /* Downgrade — text only, no button styling */
                <button
                  type="button"
                  onClick={() => setDowngradeTarget("free")}
                  style={{
                    ...ACTION_TEXT_BASE,
                    background:              "none",
                    border:                  "none",
                    cursor:                  "pointer",
                    color:                   "var(--muted-foreground)",
                    touchAction:             "manipulation",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  Downgrade
                </button>
              )}
            </div>
          );
        })()}

        {/* Member */}
        {(() => {
          const isCurrent = currentTier === "member";
          const info      = TIER_DISPLAY["member"];
          return (
            <div
              className="rounded-2xl p-5 flex flex-col"
              style={{
                backgroundColor: isCurrent ? "var(--secondary)" : "var(--card)",
                border: isCurrent ? `2px solid ${info.color}` : "1px solid var(--border)",
                minHeight: 120,
              }}
            >
              <div>
                <p className="font-semibold text-base" style={{ color: info.color, fontFamily: "var(--font-serif)" }}>Member</p>
                <p className="text-sm text-muted-foreground mt-0.5">$4.99/mo</p>
              </div>

              {isCurrent ? (
                <span style={{ ...ACTION_TEXT_BASE, color: info.color }}>Current Plan</span>
              ) : currentTier === "free" ? (
                /* Upgrade — real button */
                <button
                  type="button"
                  onClick={() => handleUpgrade("member")}
                  disabled={upgrading}
                  style={{
                    ...ACTION_TEXT_BASE,
                    backgroundColor:         info.color,
                    color:                   "#fff",
                    borderRadius:            10,
                    border:                  "none",
                    cursor:                  upgrading ? "not-allowed" : "pointer",
                    opacity:                 upgrading ? 0.7 : 1,
                    touchAction:             "manipulation",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  {upgrading ? "…" : "Upgrade"}
                </button>
              ) : (
                /* Downgrade from Premium — text only */
                <button
                  type="button"
                  onClick={() => setDowngradeTarget("member")}
                  style={{
                    ...ACTION_TEXT_BASE,
                    background:              "none",
                    border:                  "none",
                    cursor:                  "pointer",
                    color:                   "var(--muted-foreground)",
                    touchAction:             "manipulation",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  Downgrade
                </button>
              )}
            </div>
          );
        })()}

        {/* Premium */}
        {(() => {
          const isCurrent = currentTier === "premium";
          const info      = TIER_DISPLAY["premium"];
          return (
            <div
              className="rounded-2xl p-5 flex flex-col"
              style={{
                backgroundColor: isCurrent ? "var(--secondary)" : "var(--card)",
                border: isCurrent ? `2px solid ${info.color}` : "1px solid var(--border)",
                opacity: isCurrent ? 1 : 0.65,
                minHeight: 120,
              }}
            >
              <div>
                <p className="font-semibold text-base" style={{ color: info.color, fontFamily: "var(--font-serif)" }}>Premium</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {isCurrent ? pricingLabel("premium") : "Coming soon"}
                </p>
              </div>

              {isCurrent && (
                <span style={{ ...ACTION_TEXT_BASE, color: info.color }}>Current Plan</span>
              )}
              {/* No button when not current — Coming Soon state */}
            </div>
          );
        })()}

      </section>

      {/* ── Feature comparison table ───────────────────────────── */}
      <section
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
      >

        {/* ── Mobile: tab per tier ── */}
        <div className="sm:hidden">
          <div className="px-4 pt-4 pb-0">
            <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
              Features by Tier
            </p>
          </div>

          {/* Tier tab strip */}
          <div className="flex mt-3" style={{ borderBottom: "1px solid var(--border)" }}>
            {(["free", "member", "premium"] as MembershipTier[]).map(t => {
              const active = featureTier === t;
              const color  = TIER_DISPLAY[t].color;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFeatureTier(t)}
                  style={{
                    flex:                    1,
                    padding:                 "10px 4px",
                    fontSize:                12,
                    fontWeight:              600,
                    background:              "none",
                    border:                  "none",
                    borderBottom:            active ? `2px solid ${color}` : "2px solid transparent",
                    color:                   active ? color : "var(--muted-foreground)",
                    cursor:                  "pointer",
                    touchAction:             "manipulation",
                    WebkitTapHighlightColor: "transparent",
                    transition:              "color 0.15s ease",
                    marginBottom:            -1,
                  } as React.CSSProperties}
                >
                  {TIER_DISPLAY[t].label}
                </button>
              );
            })}
          </div>

          {/* Feature rows for selected tier */}
          {FEATURES.map((f, i) => (
            <div
              key={f.label}
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: i < FEATURES.length - 1 ? "1px solid var(--border)" : "none" }}
            >
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{f.label}</p>
              <div style={{ flexShrink: 0, marginLeft: 12 }}>
                {featureTier === "premium"
                  ? <p className="text-xs text-muted-foreground" style={{ opacity: 0.5 }}>N/A</p>
                  : <FeatureCell value={f[featureTier as "free" | "member"]} />
                }
              </div>
            </div>
          ))}
        </div>

        {/* ── Desktop: 4-column comparison table ── */}
        <div className="hidden sm:block">
          <div className="grid grid-cols-4 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">Feature</p>
            {(["free", "member"] as MembershipTier[]).map(t => (
              <p key={t} className="text-[11px] uppercase tracking-widest font-medium text-center"
                style={{ color: currentTier === t ? TIER_DISPLAY[t].color : "var(--muted-foreground)" }}>
                {TIER_DISPLAY[t].label}
              </p>
            ))}
            <p className="text-[11px] uppercase tracking-widest font-medium text-center text-muted-foreground">
              Premium
            </p>
          </div>

          {FEATURES.map((f, i) => (
            <div
              key={f.label}
              className="grid grid-cols-4 items-center px-4 py-3"
              style={{ borderBottom: i < FEATURES.length - 1 ? "1px solid var(--border)" : "none" }}
            >
              <p className="text-xs text-muted-foreground pr-2">{f.label}</p>
              <FeatureCell value={f.free} />
              <FeatureCell value={f.member} />
              <p className="text-center text-xs text-muted-foreground" style={{ opacity: 0.5 }}>N/A</p>
            </div>
          ))}
        </div>

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

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
