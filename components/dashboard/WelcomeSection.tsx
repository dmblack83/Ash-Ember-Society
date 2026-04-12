"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-section";
import { getMembershipTier } from "@/lib/membership";
import type { MembershipTier } from "@/lib/stripe";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface WelcomeData {
  displayName: string;
  tier: MembershipTier;
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
   Membership tier pill
   Shows "Member since [year]" with solid background keyed to tier.
   ------------------------------------------------------------------ */

function TierPill({
  tier,
  memberYear,
}: {
  tier: MembershipTier;
  memberYear: string;
}) {
  const text = `Member since ${memberYear}`;

  if (tier === "premium") {
    return (
      <span
        className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold"
        style={{
          background: "#C9A84C",
          color:      "#1a1008",
        }}
      >
        {text}
      </span>
    );
  }

  if (tier === "member") {
    return (
      <span
        className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold"
        style={{
          background: "#C9501A",
          color:      "#ffffff",
        }}
      >
        {text}
      </span>
    );
  }

  // Free
  return (
    <span
      className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium"
      style={{
        background: "rgba(120,110,100,0.25)",
        color:      "var(--muted-foreground)",
      }}
    >
      {text}
    </span>
  );
}

/* ------------------------------------------------------------------
   Quick action button — no icon, explicit copy
   ------------------------------------------------------------------ */

function QuickAction({
  label,
  href,
}: {
  label: string;
  href: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(href, { scroll: false })}
      className="flex-1 flex items-center justify-center rounded-xl font-medium text-sm transition-all duration-150 active:scale-95"
      style={{
        backgroundColor:          "rgba(201,80,26,0.15)",
        color:                    "var(--ember)",
        border:                   "1px solid rgba(201,80,26,0.28)",
        minHeight:                44,
        padding:                  "10px 8px",
        touchAction:              "manipulation",
        WebkitTapHighlightColor:  "transparent",
      } as React.CSSProperties}
    >
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------
   Content — rendered once data is loaded
   ------------------------------------------------------------------ */

function WelcomeContent({ data }: { data: WelcomeData }) {
  return (
    <div className="flex flex-col gap-4">

      {/* ── Greeting + tier pill ──────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <p
          className="leading-tight text-foreground"
          style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700 }}
        >
          {getGreeting()}, {data.displayName}
        </p>
        <TierPill tier={data.tier} memberYear={data.memberYear} />
      </div>

      {/* ── Quick actions ─────────────────────────────────────────── */}
      <div className="flex gap-2">
        <QuickAction label="Start a Burn Report" href="/humidor"            />
        <QuickAction label="Add a Cigar"         href="/humidor?add=true"   />
        <QuickAction label="Find a Lounge"        href="/discover/shops"    />
      </div>

    </div>
  );
}

/* ------------------------------------------------------------------
   WelcomeSection — no section heading, just greeting + actions.
   ------------------------------------------------------------------ */

export function WelcomeSection() {
  const [data, setData] = useState<WelcomeData | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, membership_tier, created_at")
        .eq("id", user.id)
        .single();

      const tier = getMembershipTier(
        profile as { membership_tier: import("@/lib/stripe").MembershipTier | null } | null
      );

      setData({
        displayName: profile?.display_name ?? "there",
        tier,
        memberYear:  profile?.created_at
          ? new Date(profile.created_at).getFullYear().toString()
          : "—",
      });
    }

    load();
  }, []);

  return (
    /* Match DashboardSection animation cadence — index 0 = no delay */
    <section className="flex flex-col gap-3 animate-fade-in" style={{ animationDelay: "0ms" }}>
      {data ? (
        <WelcomeContent data={data} />
      ) : (
        <DashboardSkeleton height={130} />
      )}
    </section>
  );
}
