"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ResumeHandler } from "@/components/system/ResumeHandler";
import { ConnectionProbe } from "@/components/system/ConnectionProbe";
import { OfflineBanner } from "@/components/system/OfflineBanner";
import { PushSubscriptionHealthCheck } from "@/components/system/PushSubscriptionHealthCheck";
import { OutboxManager } from "@/components/system/OutboxManager";
import { PersistentStorageRequest } from "@/components/system/PersistentStorageRequest";
import { A2HSBanner } from "@/components/system/A2HSBanner";
import { ServiceWorkerUpdateNotice } from "@/components/system/ServiceWorkerUpdateNotice";
import { StaleBuildNotice } from "@/components/system/StaleBuildNotice";
import { AppSessionProvider } from "@/components/system/app-session";

/* ------------------------------------------------------------------
   Bottom navigation — visible on all authenticated app pages.
   Page-level tab navs (Humidor | Wishlist | Stats) sit above this.
   ------------------------------------------------------------------ */

/* Icons use stroke="currentColor"; the parent <Link> sets `color`
   based on active state. For active-only fill accents (lounge bubble,
   home roof) we render with `fill="currentFill"`-equivalent classes
   driven by a `data-active` attribute on the icon's <svg>. */
const HUMIDOR_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="5" y="3" width="14" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <line x1="12" y1="3.5" x2="12" y2="20.5" stroke="currentColor" strokeWidth="1.7" />
    <line x1="9.6" y1="10.6" x2="9.6" y2="13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <line x1="14.4" y1="10.6" x2="14.4" y2="13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <line x1="6.5" y1="21" x2="6.5" y2="22.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <line x1="17.5" y1="21" x2="17.5" y2="22.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const LOUNGE_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20 9V6.5A2.5 2.5 0 0 0 17.5 4h-11A2.5 2.5 0 0 0 4 6.5V9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2.5 11A1.5 1.5 0 0 1 4 12.5V15h16v-2.5A1.5 1.5 0 0 1 21.5 11 1.5 1.5 0 0 1 23 12.5V17a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-4.5A1.5 1.5 0 0 1 2.5 11Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 18v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M19 18v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const HOME_ICON = (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true" className="bottom-nav-fill-on-active">
    <path
      d="M3 12L13 3L23 12V22a1 1 0 01-1 1H16v-6h-6v6H4a1 1 0 01-1-1V12z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

const DISCOVER_ICON = (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.6" />
    <path d="M14.5 7.5l-2.8 5.6-5.6 2.8 2.8-5.6 5.6-2.8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <circle cx="11" cy="11" r="1.2" fill="currentColor" />
  </svg>
);

const ACCOUNT_ICON = (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <circle cx="11" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M3 19c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const NAV_ITEMS = [
  { href: "/humidor",           label: "Humidor",  center: false, match: (p: string) => p.startsWith("/humidor"),  icon: HUMIDOR_ICON },
  { href: "/lounge",            label: "Lounge",   center: false, match: (p: string) => p.startsWith("/lounge"),   icon: LOUNGE_ICON },
  { href: "/home",              label: "Home",     center: true,  match: (p: string) => p === "/home",             icon: HOME_ICON },
  { href: "/discover/cigar-news", label: "Discover", center: false, match: (p: string) => p.startsWith("/discover"), icon: DISCOVER_ICON },
  { href: "/account",           label: "Account",  center: false, match: (p: string) => p.startsWith("/account"),  icon: ACCOUNT_ICON },
];

function BottomNav() {
  const pathname = usePathname();
  const wrapperRef = useRef<HTMLDivElement>(null);

  /* iOS PWA repaint fix. The nav is position:fixed and lives in the
     persistent App Router layout, so it is never re-mounted. After a long
     background, iOS restores the page without repainting the fixed
     compositor layer, so the bar appears glued to the scrolled content
     ("floats up with the page") until something forces a reflow. On resume
     we toggle a sub-pixel transform to force the compositor to re-sync the
     layer to the viewport. translateZ(0) below keeps it on its own layer so
     this nudge is cheap and non-visual. */
  useEffect(() => {
    function repaint() {
      const el = wrapperRef.current;
      if (!el) return;
      el.style.transform = "translateZ(0) translateY(0.01px)";
      // Force layout, then settle back. rAF lets the bumped frame commit.
      void el.offsetHeight;
      requestAnimationFrame(() => {
        if (wrapperRef.current) wrapperRef.current.style.transform = "translateZ(0)";
      });
    }
    function onVisible() {
      if (document.visibilityState === "visible") repaint();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", repaint);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", repaint);
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden"
      style={{
        paddingLeft: 12,
        paddingRight: 12,
        paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)",
        pointerEvents: "none", // transparent margin shouldn't block taps on content
        transform: "translateZ(0)", // own compositor layer → pins to viewport, not scroll layer
        WebkitBackfaceVisibility: "hidden",
      }}
    >
      <nav
        aria-label="Main navigation"
        className="flex items-stretch"
        style={{
          pointerEvents: "auto",
          padding: 8,
          borderRadius: 26,
          background: "rgba(36,28,23,0.55)", // see-through; blur keeps it non-distracting
          backdropFilter: "blur(20px) saturate(120%)",
          WebkitBackdropFilter: "blur(20px) saturate(120%)",
          border: "1px solid rgba(212,160,74,0.16)",
          boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
        }}
      >
        {NAV_ITEMS.map(({ href, label, match, icon }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              scroll={false}
              prefetch={true}
              data-active={active || undefined}
              className="flex flex-1 flex-col items-center justify-center gap-[3px] py-1.5 min-h-[44px] active:opacity-70"
              style={{
                color: active ? "var(--gold, #D4A04A)" : "var(--muted-foreground)",
                borderRadius: 18,
                background: active ? "rgba(212,160,74,0.15)" : "transparent",
                boxShadow: active
                  ? "inset 0 0 0 1px rgba(212,160,74,0.4), 0 0 16px rgba(212,160,74,0.22)"
                  : "none",
                transition:
                  "color .22s cubic-bezier(.16,1,.3,1), background .22s cubic-bezier(.16,1,.3,1), box-shadow .22s cubic-bezier(.16,1,.3,1)",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                textDecoration: "none",
              }}
              aria-current={active ? "page" : undefined}
              aria-label={label}
            >
              {icon}
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/* ------------------------------------------------------------------
   Side rail navigation — visible on desktop (lg+) only.
   Mobile + tablet keep the existing bottom nav.

   Width comes from `--side-rail-width` in globals.css; full-width
   fixed elements elsewhere in the app respect `--app-content-left`
   (zero below lg, rail-width above) so they sit to the right of the
   rail rather than underneath it.

   Reuses NAV_ITEMS for source-of-truth parity. Reorders Home to the
   top because a vertical list reads naturally from primary
   destination down; the bottom nav puts Home in the visual centre
   for thumb reach, which doesn't apply on a side rail.
   ------------------------------------------------------------------ */

function SideRailNav() {
  const pathname = usePathname();

  /* Inline reorder rather than a second const array — one
     source of truth for nav items. */
  const railItems = [
    NAV_ITEMS.find((i) => i.href === "/home")!,
    ...NAV_ITEMS.filter((i) => i.href !== "/home"),
  ];

  return (
    <nav
      className="hidden lg:flex flex-col fixed top-0 bottom-0 left-0 z-40 py-7"
      style={{
        width:                "var(--side-rail-width)",
        backgroundColor:      "rgba(26,18,16,0.95)",
        backdropFilter:       "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderRight:          "1px solid var(--border)",
      }}
      aria-label="Main navigation"
    >
      {/* Wordmark */}
      <Link
        href="/home"
        className="px-6 mb-9 transition-opacity hover:opacity-80"
        style={{
          fontFamily:    "var(--font-serif)",
          fontSize:      20,
          fontWeight:    600,
          letterSpacing: "0.04em",
          color:         "var(--foreground)",
          textDecoration: "none",
        }}
      >
        Ash &amp; Ember
      </Link>

      <div className="flex flex-col gap-1 px-3">
        {railItems.map(({ href, label, match, icon }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              prefetch={true}
              data-active={active || undefined}
              className="flex items-center gap-3 px-3 py-3 rounded-lg transition-colors"
              style={{
                color:           active ? "var(--gold, #D4A04A)" : "var(--muted-foreground)",
                backgroundColor: active ? "rgba(212,160,74,0.08)" : "transparent",
                textDecoration:  "none",
              }}
              aria-current={active ? "page" : undefined}
            >
              {icon}
              <span className="text-sm font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function ScrollReset() {
  const pathname = usePathname();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  /* Hide both navs on /onboarding — the route lives inside the (app)
     group so the layout wraps it, but a user mid-onboarding shouldn't
     see destination chrome they can't yet use. */
  const pathname = usePathname();
  const hideNav = pathname.startsWith("/onboarding");

  return (
    <AppSessionProvider>
      {/* Page content — bottom padding clears the nav bar.
          app-container enables dvh tracking on Android so the layout
          shrinks correctly when the software keyboard opens. */}
      <ScrollReset />
      <ResumeHandler />
      <ConnectionProbe />
      <OfflineBanner />
      <PushSubscriptionHealthCheck />
      <OutboxManager />
      <PersistentStorageRequest />
      <ServiceWorkerUpdateNotice />
      <StaleBuildNotice />
      <main
        id="main-content"
        className={
          hideNav
            ? "flex-1 app-container"
            : "flex-1 app-container pb-[calc(88px+env(safe-area-inset-bottom))] lg:pb-0"
        }
        style={{
          touchAction: "pan-y",
          marginLeft: hideNav ? 0 : "var(--app-content-left)",
        }}
      >
        {children}
      </main>
      {!hideNav && <A2HSBanner />}
      {!hideNav && <BottomNav />}
      {!hideNav && <SideRailNav />}
    </AppSessionProvider>
  );
}
