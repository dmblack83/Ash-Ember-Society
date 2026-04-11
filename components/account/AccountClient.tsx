"use client";

import { useState } from "react";
import { ProfileTab }    from "@/components/account/ProfileTab";
import { MembershipTab } from "@/components/account/MembershipTab";
import { LegalTab }      from "@/components/account/LegalTab";
import type { MembershipTier } from "@/lib/stripe";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

export interface ProfileData {
  display_name: string | null;
  first_name:   string | null;
  last_name:    string | null;
  phone:        string | null;
  city:         string | null;
  state:        string | null;
  avatar_url:   string | null;
}

export interface MembershipData {
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

export interface LegalData {
  termsContent: string;
  eulaContent:  string;
}

interface Props {
  userId:    string;
  email:     string;
  profile:   ProfileData;
  membership: MembershipData;
  legal:     LegalData;
}

/* ------------------------------------------------------------------
   Tab definitions
   ------------------------------------------------------------------ */

type Tab = "profile" | "membership" | "legal";

const TABS: { id: Tab; label: string }[] = [
  { id: "profile",    label: "Profile"    },
  { id: "membership", label: "Membership" },
  { id: "legal",      label: "Legal"      },
];

/* ------------------------------------------------------------------
   Component
   ------------------------------------------------------------------ */

export function AccountClient({ userId, email, profile, membership, legal }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--background)" }}>

      {/* ── Sticky tab bar ─────────────────────────────────────── */}
      <div
        className="sticky top-0 z-30 flex"
        style={{
          backgroundColor: "rgba(26,18,16,0.97)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {TABS.map(({ id, label }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className="flex-1 text-sm font-medium transition-colors duration-150"
              style={{
                minHeight: 44,
                color: active ? "var(--gold, #D4A04A)" : "var(--muted-foreground)",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                borderBottom: active ? "2px solid var(--gold, #D4A04A)" : "2px solid transparent",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                background: "none",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {activeTab === "profile" && (
          <ProfileTab userId={userId} email={email} initialProfile={profile} />
        )}
        {activeTab === "membership" && (
          <MembershipTab userId={userId} {...membership} />
        )}
        {activeTab === "legal" && (
          <LegalTab termsContent={legal.termsContent} eulaContent={legal.eulaContent} />
        )}
      </div>
    </div>
  );
}
