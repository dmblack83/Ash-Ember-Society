"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { DashboardSection, DashboardSkeleton } from "@/components/dashboard/dashboard-section";
import { getMembershipTier } from "@/lib/membership";
import type { MembershipTier } from "@/lib/stripe";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface WelcomeData {
  displayName: string;
  tier: MembershipTier;
  humidorCount: number;
  burnCount: number;
  memberYear: string;
}

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

function getGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12)  return "Good morning";
  if (h >= 12 && h < 18) return "Good afternoon";
  return "Good evening";
}

/* ------------------------------------------------------------------
   Membership tier badge
   ------------------------------------------------------------------ */

function TierBadge({ tier }: { tier: MembershipTier }) {
  if (tier === "premium") {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
        style={{
          background:  "linear-gradient(135deg, rgba(212,160,74,0.25), rgba(193,120,23,0.2))",
          color:        "var(--gold)",
          border:       "1px solid rgba(212,160,74,0.35)",
        }}
      >
        <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor" aria-hidden="true">
          <path d="M4.5 0L5.6 3.2H9L6.2 5.1L7.3 8.3L4.5 6.4L1.7 8.3L2.8 5.1L0 3.2H3.4L4.5 0Z" />
        </svg>
        Premium
      </span>
    );
  }
  if (tier === "member") {
    return (
      <span
        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
        style={{
          backgroundColor: "rgba(232,100,44,0.2)",
          color:            "var(--ember)",
          border:           "1px solid rgba(232,100,44,0.3)",
        }}
      >
        Member
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
      style={{
        backgroundColor: "rgba(166,144,128,0.15)",
        color:            "var(--muted-foreground)",
        border:           "1px solid rgba(166,144,128,0.2)",
      }}
    >
      Free
    </span>
  );
}

/* ------------------------------------------------------------------
   Stat chip
   ------------------------------------------------------------------ */

function StatChip({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
}) {
  return (
    <div
      className="glass flex-1 flex flex-col items-center justify-center gap-1 rounded-xl py-3 px-2 min-w-0"
      style={{ minHeight: 72 }}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span
        className="text-base font-bold text-foreground leading-none"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {value}
      </span>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------
   Quick action button
   ------------------------------------------------------------------ */

function QuickAction({
  emoji,
  label,
  href,
}: {
  emoji: string;
  label: string;
  href: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(href, { scroll: false })}
      className="flex-1 flex items-center justify-center gap-2 rounded-xl font-medium text-sm transition-all duration-150 active:scale-95"
      style={{
        backgroundColor: "rgba(232,100,44,0.15)",
        color:            "var(--ember)",
        border:           "1px solid rgba(232,100,44,0.25)",
        minHeight:        44,
        padding:          "10px 12px",
        touchAction:      "manipulation",
        WebkitTapHighlightColor: "transparent",
      } as React.CSSProperties}
    >
      <span role="img" aria-hidden="true" style={{ fontSize: 16 }}>{emoji}</span>
      <span>{label}</span>
    </button>
  );
}

/* ------------------------------------------------------------------
   Content — rendered once data is loaded
   ------------------------------------------------------------------ */

function WelcomeContent({ data }: { data: WelcomeData }) {
  return (
    <div className="flex flex-col gap-4">

      {/* ── Greeting + tier ───────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <p
          className="leading-tight text-foreground"
          style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700 }}
        >
          {getGreeting()}, {data.displayName}
        </p>
        <TierBadge tier={data.tier} />
      </div>

      {/* ── Stat chips ────────────────────────────────────────────── */}
      <div className="flex gap-2">
        <StatChip
          icon={
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <rect x="1" y="4" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M1 7h12" stroke="currentColor" strokeWidth="1.2" />
              <path d="M4 2.5v1.5M10 2.5v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="7" cy="10" r="1" fill="currentColor" opacity="0.5" />
            </svg>
          }
          value={data.humidorCount}
          label="In Humidor"
        />
        <StatChip
          icon={
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 1.5C4.5 1.5 2.5 3.5 2.5 6c0 1.8 1 3.3 2.5 4.1V12h4v-1.9C10.5 9.3 11.5 7.8 11.5 6c0-2.5-2-4.5-4.5-4.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M5 12h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          }
          value={data.burnCount}
          label="Burn Reports"
        />
        <StatChip
          icon={
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <rect x="1.5" y="2" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M5 1v2M9 1v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M1.5 5.5h11" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          }
          value={data.memberYear}
          label="Member Since"
        />
      </div>

      {/* ── Quick actions ─────────────────────────────────────────── */}
      <div className="flex gap-2">
        <QuickAction emoji="🔥" label="Burn Report"   href="/humidor" />
        <QuickAction emoji="📦" label="Add Cigar"     href="/humidor" />
        <QuickAction emoji="📍" label="Find a Lounge" href="/discover/shops" />
      </div>

    </div>
  );
}

/* ------------------------------------------------------------------
   WelcomeSection — exported, drops into app/(app)/page.tsx
   ------------------------------------------------------------------ */

export function WelcomeSection() {
  const [data, setData] = useState<WelcomeData | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Run all three queries in parallel
      const [profileRes, humidorRes, burnRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, membership_tier, created_at")
          .eq("id", user.id)
          .single(),

        supabase
          .from("humidor_items")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("is_wishlist", false),

        supabase
          .from("smoke_logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
      ]);

      const profile   = profileRes.data;
      const tier      = getMembershipTier(
        profile as { membership_tier: import("@/lib/stripe").MembershipTier | null } | null
      );

      setData({
        displayName:  profile?.display_name ?? "there",
        tier,
        humidorCount: humidorRes.count ?? 0,
        burnCount:    burnRes.count    ?? 0,
        memberYear:   profile?.created_at
          ? new Date(profile.created_at).getFullYear().toString()
          : "—",
      });
    }

    load();
  }, []);

  return (
    <DashboardSection title="Welcome" sectionIndex={0}>
      {data ? (
        <WelcomeContent data={data} />
      ) : (
        <DashboardSkeleton height={200} />
      )}
    </DashboardSection>
  );
}
