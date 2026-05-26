"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/ui/toast";
import { TIER_DISPLAY, PLAN_PRICING, TIER_DESCRIPTION } from "@/lib/membership";
import type { MembershipTier } from "@/lib/stripe";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";

/* ------------------------------------------------------------------
   Downgrade confirmation — member→free only
   ------------------------------------------------------------------ */

interface DowngradeModalProps {
  nextBillingDate: string | null;
  onConfirm:       () => void;
  onCancel:        () => void;
  loading:         boolean;
}

function DowngradeModal({ nextBillingDate, onConfirm, onCancel, loading }: DowngradeModalProps) {
  useEscapeKey(true, onCancel);
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
            Downgrade to Free?
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
            Your Member subscription will cancel on {nextBillingDate ?? "your next billing date"}. You keep your current benefits until then.
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
   Shared card action row style
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
  userId:            string;
  currentTier:       MembershipTier;
  hasStripeCustomer: boolean;
  nextBillingDate:   string | null;
  currentPeriodEnd:  number | null;
  priceIds: {
    memberMonthly: string;
  };
}

export function MembershipTab({
  currentTier,
  hasStripeCustomer,
  nextBillingDate: nextBillingDateProp,
  priceIds,
}: Props) {
  const router = useRouter();

  const [upgrading,        setUpgrading]        = useState(false);
  const [portalLoading,    setPortalLoading]    = useState(false);
  const [showDowngrade,    setShowDowngrade]    = useState(false);
  const [downgradeLoading, setDowngradeLoading] = useState(false);
  const [toast,            setToast]            = useState<string | null>(null);
  const [nextBillingDate,  setNextBillingDate]  = useState<string | null>(nextBillingDateProp);

  useEffect(() => {
    if (currentTier === "free") return;
    fetch("/api/stripe/subscription-status")
      .then(r => r.json())
      .then((d: { nextBillingDate: string | null }) => {
        if (d.nextBillingDate) setNextBillingDate(d.nextBillingDate);
      })
      .catch(() => {});
  }, [currentTier]);

  const isPaid   = currentTier !== "free";
  const tierInfo = TIER_DISPLAY[isPaid ? "member" : "free"];

  /* ── Upgrade ─────────────────────────────────────────────────── */
  async function handleUpgrade() {
    if (!priceIds.memberMonthly) { setToast("Price not configured."); return; }
    setUpgrading(true);
    try {
      const res  = await fetch("/api/stripe/create-checkout-session", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ priceId: priceIds.memberMonthly }),
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
    setDowngradeLoading(true);
    try {
      const res  = await fetch("/api/stripe/schedule-downgrade", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ targetTier: "free" }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setToast(`Subscription will cancel on ${data.effectiveDate}.`);
      setShowDowngrade(false);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Downgrade failed.");
    } finally {
      setDowngradeLoading(false);
    }
  }

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
                {PLAN_PRICING.member.monthly.label}
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
                background: "rgba(193,120,23,0.12)",
                border:     "1px solid rgba(193,120,23,0.3)",
                color:      tierInfo.color,
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

      {/* ── Tier cards ─────────────────────────────────────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Free */}
        {(() => {
          const isCurrent = !isPaid;
          const info      = TIER_DISPLAY["free"];
          return (
            <div
              className="rounded-2xl p-5 flex flex-col"
              style={{
                backgroundColor: isCurrent ? "var(--secondary)" : "var(--card)",
                border:          isCurrent ? `2px solid ${info.color}` : "1px solid var(--border)",
                minHeight:       120,
              }}
            >
              <div>
                <p className="font-semibold text-base" style={{ color: info.color, fontFamily: "var(--font-serif)" }}>{info.label}</p>
                <p className="text-sm text-muted-foreground mt-0.5">Free forever</p>
                <p className="text-xs text-muted-foreground mt-1.5 leading-snug">{TIER_DESCRIPTION.free}</p>
              </div>
              {isCurrent ? (
                <span style={{ ...ACTION_TEXT_BASE, color: info.color }}>Current Plan</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDowngrade(true)}
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
          const isCurrent = isPaid;
          const info      = TIER_DISPLAY["member"];
          return (
            <div
              className="rounded-2xl p-5 flex flex-col"
              style={{
                backgroundColor: isCurrent ? "var(--secondary)" : "var(--card)",
                border:          isCurrent ? `2px solid ${info.color}` : "1px solid var(--border)",
                minHeight:       120,
              }}
            >
              <div>
                <p className="font-semibold text-base" style={{ color: info.color, fontFamily: "var(--font-serif)" }}>{info.label}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{PLAN_PRICING.member.monthly.label}</p>
                <p className="text-xs text-muted-foreground mt-1.5 leading-snug">{TIER_DESCRIPTION.member}</p>
              </div>
              {isCurrent ? (
                <span style={{ ...ACTION_TEXT_BASE, color: info.color }}>Current Plan</span>
              ) : (
                <button
                  type="button"
                  onClick={handleUpgrade}
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
              )}
            </div>
          );
        })()}

      </section>

      {/* ── Downgrade modal ────────────────────────────────────── */}
      {showDowngrade && (
        <DowngradeModal
          nextBillingDate={nextBillingDate}
          onConfirm={handleDowngradeConfirm}
          onCancel={() => setShowDowngrade(false)}
          loading={downgradeLoading}
        />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
