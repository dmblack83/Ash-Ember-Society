"use client";

import { useState, useEffect, useRef } from "react";
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
        style={{ background: "#C9A84C", color: "#1a1008" }}
      >
        {text}
      </span>
    );
  }
  if (tier === "member") {
    return (
      <span
        className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold"
        style={{ background: "#C9501A", color: "#ffffff" }}
      >
        {text}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium"
      style={{ background: "rgba(120,110,100,0.25)", color: "var(--muted-foreground)" }}
    >
      {text}
    </span>
  );
}

/* ------------------------------------------------------------------
   Quick action button
   Glass + gold border at rest; gold fill on press. Full width.
   ------------------------------------------------------------------ */

function QuickAction({ label, href }: { label: string; href: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.push(href, { scroll: false })}
      className="flex-1"
      style={{
        display:                 "inline-flex",
        alignItems:              "center",
        justifyContent:          "center",
        minHeight:               44,
        padding:                 "0 12px",
        borderRadius:            "0.75rem",       /* matches .btn calc(--radius + 4px) */
        background:              "#C9A84C",
        color:                   "#1A1210",
        fontWeight:              600,
        fontSize:                "0.75rem",       /* 12px — keeps all labels single-line */
        lineHeight:              1,
        whiteSpace:              "nowrap",
        border:                  "none",
        cursor:                  "pointer",
        touchAction:             "manipulation",
        WebkitTapHighlightColor: "transparent",
        transition:              "filter 150ms ease",
      } as React.CSSProperties}
      onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.1)")}
      onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
      onPointerDown={(e)  => (e.currentTarget.style.filter = "brightness(0.92)")}
      onPointerUp={(e)    => (e.currentTarget.style.filter = "none")}
      onPointerLeave={(e) => (e.currentTarget.style.filter = "none")}
      aria-label={label}
    >
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------
   Header content — greeting + tier pill only (no actions)
   ------------------------------------------------------------------ */

function WelcomeContent({ data }: { data: WelcomeData }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p
        className="leading-tight text-foreground"
        style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700 }}
      >
        {getGreeting()}, {data.displayName}
      </p>
      <TierPill tier={data.tier} memberYear={data.memberYear} />
    </div>
  );
}

/* ------------------------------------------------------------------
   QuickActions — single horizontal row, lives in the scrollable page
   ------------------------------------------------------------------ */

export function QuickActions() {
  return (
    <div className="flex gap-2">
      <QuickAction label="+ Burn Report" href="/humidor"          />
      <QuickAction label="+ Cigar"      href="/humidor?add=true" />
      <QuickAction label="Local Shops"  href="/discover/shops"   />
    </div>
  );
}

/* ------------------------------------------------------------------
   WelcomeSection
   ─────────────────────────────────────────────────────────────────
   Renders two siblings:
   1. A position:fixed header that covers the viewport top.
   2. A spacer <div> whose height tracks the header via ResizeObserver.
      This sits in the normal document flow and pushes dashboard
      content below the header without any page-level changes.
   ------------------------------------------------------------------ */

export function WelcomeSection() {
  const [data,         setData]         = useState<WelcomeData | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [scrolled,     setScrolled]     = useState(false);

  const headerRef = useRef<HTMLElement>(null);

  /* ── Data fetch ──────────────────────────────────────────────── */
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

  /* ── Track header height with ResizeObserver ─────────────────── */
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    // Measure immediately
    setHeaderHeight(el.offsetHeight);

    const ro = new ResizeObserver(() => {
      setHeaderHeight(el.offsetHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── Scroll detection for backdrop blur ──────────────────────── */
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 4);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/* ── Fixed header ─────────────────────────────────────────── */}
      <header
        ref={headerRef}
        className="animate-fade-in"
        style={{
          position:             "fixed",
          top:                  0,
          left:                 0,
          right:                0,
          zIndex:               30,
          paddingTop:           "env(safe-area-inset-top)",
          // Transition background/blur as user scrolls
          backgroundColor:      scrolled
            ? "rgba(26,18,16,0.88)"
            : "#1A1210",
          backdropFilter:       scrolled ? "blur(12px)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(12px)" : "none",
          borderBottom:         scrolled
            ? "1px solid rgba(255,255,255,0.08)"
            : "1px solid rgba(255,255,255,0.04)",
          transition:           "background-color 0.2s ease, backdrop-filter 0.2s ease, border-color 0.2s ease",
          willChange:           "backdrop-filter",
        } as React.CSSProperties}
        aria-label="Welcome header"
      >
        {/* Inner width mirrors the page container */}
        <div
          className="mx-auto px-4 sm:px-6 py-3"
          style={{ maxWidth: "42rem" }}   /* ~max-w-2xl = 672px */
        >
          {data ? (
            <WelcomeContent data={data} />
          ) : (
            <DashboardSkeleton height={56} />
          )}
        </div>
      </header>

      {/* ── Flow spacer — keeps downstream content from hiding behind header */}
      <div
        aria-hidden="true"
        style={{
          height:     headerHeight,
          flexShrink: 0,
          // Instant update on resize — no transition so there's no lag
        }}
      />
    </>
  );
}
