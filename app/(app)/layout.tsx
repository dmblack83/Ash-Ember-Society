"use client";

import { useEffect, ViewTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ResumeHandler } from "@/components/system/ResumeHandler";
import { OfflineBanner } from "@/components/system/OfflineBanner";
import { PushSubscriptionHealthCheck } from "@/components/system/PushSubscriptionHealthCheck";
import { OutboxManager } from "@/components/system/OutboxManager";
import { PersistentStorageRequest } from "@/components/system/PersistentStorageRequest";

/* ------------------------------------------------------------------
   Bottom navigation — visible on all authenticated app pages.
   Page-level tab navs (Humidor | Wishlist | Stats) sit above this.
   ------------------------------------------------------------------ */

/* Icons use stroke="currentColor"; the parent <Link> sets `color`
   based on active state. For active-only fill accents (lounge bubble,
   home roof) we render with `fill="currentFill"`-equivalent classes
   driven by a `data-active` attribute on the icon's <svg>. */
const HUMIDOR_ICON = (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <rect x="3" y="6" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M3 10h16" stroke="currentColor" strokeWidth="1.4" />
    <path d="M7 4v2M15 4v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="11" cy="14" r="1.5" fill="currentColor" />
  </svg>
);

const LOUNGE_ICON = (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" className="bottom-nav-fill-on-active">
    <path
      d="M2 4.5A1.5 1.5 0 013.5 3h15A1.5 1.5 0 0120 4.5v9A1.5 1.5 0 0118.5 15H7l-4 4V4.5z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path d="M6 8h10M6 11.5h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
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

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch lg:hidden"
      style={{
        backgroundColor: "rgba(26,18,16,0.95)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid var(--border)",
        paddingBottom: "env(safe-area-inset-bottom)",
        willChange: "transform",
      }}
      aria-label="Main navigation"
    >
      {NAV_ITEMS.map(({ href, label, match, icon, center }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            scroll={false}
            prefetch={true}
            data-active={active || undefined}
            className="flex flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-opacity active:opacity-70 min-h-[44px]"
            style={{
              ...(center ? { marginTop: -8 } : {}),
              color: active ? "var(--gold, #D4A04A)" : "var(--muted-foreground)",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
              textDecoration: "none",
            }}
            aria-current={active ? "page" : undefined}
            aria-label={label}
          >
            {center ? (
              <div
                className="rounded-full flex items-center justify-center"
                style={{
                  width: 46,
                  height: 46,
                  background: active
                    ? "linear-gradient(135deg, rgba(212,160,74,0.25), rgba(193,120,23,0.25))"
                    : "rgba(255,255,255,0.06)",
                  border: `1.5px solid ${active ? "var(--gold, #D4A04A)" : "var(--border)"}`,
                }}
              >
                {icon}
              </div>
            ) : (
              icon
            )}
            <span className="text-[10px] font-medium leading-none">
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
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
  return (
    <>
      {/* Page content — bottom padding clears the nav bar.
          app-container enables dvh tracking on Android so the layout
          shrinks correctly when the software keyboard opens. */}
      <ScrollReset />
      <ResumeHandler />
      <OfflineBanner />
      <PushSubscriptionHealthCheck />
      <OutboxManager />
      <PersistentStorageRequest />
      <main
        id="main-content"
        className="flex-1 app-container pb-[calc(72px+env(safe-area-inset-bottom))] lg:pb-0"
        style={{
          touchAction: "pan-y",
          marginLeft:  "var(--app-content-left)",
        }}
      >
        {/* View Transition wrapper — animates the main content swap
            between routes. Bottom nav + side rail sit OUTSIDE this
            wrapper so they don't fade with the content. Browsers
            without View Transitions API support render this as a
            passthrough; no animation, no error. Reduced-motion
            preference disables all animation via the CSS in
            globals.css. See node_modules/next/dist/docs/01-app/
            02-guides/view-transitions.md for the full guide. */}
        <ViewTransition>
          {children}
        </ViewTransition>
      </main>
      <BottomNav />
      <SideRailNav />
    </>
  );
}
