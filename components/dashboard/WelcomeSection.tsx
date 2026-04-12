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
  const [pressed, setPressed] = useState(false);

  return (
    <button
      type="button"
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => { setPressed(false); router.push(href, { scroll: false }); }}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      className="w-full flex items-center justify-center rounded-xl font-medium text-sm transition-colors duration-100"
      style={{
        minHeight:               44,
        padding:                 "11px 16px",
        touchAction:             "manipulation",
        WebkitTapHighlightColor: "transparent",
        background:              pressed
          ? "#C9A84C"
          : "rgba(255,255,255,0.05)",
        backdropFilter:          pressed ? "none" : "blur(8px)",
        WebkitBackdropFilter:    pressed ? "none" : "blur(8px)",
        border:                  pressed
          ? "1px solid #C9A84C"
          : "1px solid var(--gold)",
        color:                   pressed ? "#1a1008" : "#F5EDD6",
        cursor:                  "pointer",
      } as React.CSSProperties}
      aria-label={label}
    >
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------
   Inner content (greeting + pill + actions)
   ------------------------------------------------------------------ */

function WelcomeContent({ data }: { data: WelcomeData }) {
  return (
    <div className="flex flex-col gap-3">

      {/* Greeting + tier pill */}
      <div className="flex flex-col gap-1.5">
        <p
          className="leading-tight text-foreground"
          style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700 }}
        >
          {getGreeting()}, {data.displayName}
        </p>
        <TierPill tier={data.tier} memberYear={data.memberYear} />
      </div>

      {/* Quick actions — full-width, stacked */}
      <div className="flex flex-col gap-2">
        <QuickAction label="Start a Burn Report" href="/humidor"          />
        <QuickAction label="Add a Cigar"         href="/humidor?add=true" />
        <QuickAction label="Find a Lounge"       href="/discover/shops"   />
      </div>

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
            <DashboardSkeleton height={148} />
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
