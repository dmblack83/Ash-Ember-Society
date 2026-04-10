"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* ------------------------------------------------------------------
   Bottom navigation — visible on all authenticated app pages.
   Page-level tab navs (Humidor | Wishlist | Stats) sit above this.
   ------------------------------------------------------------------ */

const NAV_ITEMS = [
  {
    href:  "/humidor",
    label: "Humidor",
    center: false,
    match: (p: string) => p.startsWith("/humidor"),
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <rect
          x="3" y="6" width="16" height="12" rx="2"
          stroke={active ? "var(--gold, #D4A04A)" : "currentColor"}
          strokeWidth="1.6"
        />
        <path
          d="M3 10h16"
          stroke={active ? "var(--gold, #D4A04A)" : "currentColor"}
          strokeWidth="1.4"
        />
        <path
          d="M7 4v2M15 4v2"
          stroke={active ? "var(--gold, #D4A04A)" : "currentColor"}
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <circle
          cx="11" cy="14" r="1.5"
          fill={active ? "var(--gold, #D4A04A)" : "currentColor"}
          opacity={active ? 1 : 0.5}
        />
      </svg>
    ),
  },
  {
    href:  "/lounge",
    label: "Lounge",
    center: false,
    match: (p: string) => p.startsWith("/lounge"),
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <path
          d="M2 4.5A1.5 1.5 0 013.5 3h15A1.5 1.5 0 0120 4.5v9A1.5 1.5 0 0118.5 15H7l-4 4V4.5z"
          stroke={active ? "var(--gold, #D4A04A)" : "currentColor"}
          strokeWidth="1.5"
          strokeLinejoin="round"
          fill={active ? "rgba(212,160,74,0.12)" : "none"}
        />
        <path
          d="M6 8h10M6 11.5h6"
          stroke={active ? "var(--gold, #D4A04A)" : "currentColor"}
          strokeWidth="1.3"
          strokeLinecap="round"
          opacity={active ? 1 : 0.7}
        />
      </svg>
    ),
  },
  {
    href:  "/",
    label: "Home",
    center: true,
    match: (p: string) => p === "/",
    icon: (active: boolean) => (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
        <path
          d="M3 12L13 3L23 12V22a1 1 0 01-1 1H16v-6h-6v6H4a1 1 0 01-1-1V12z"
          stroke={active ? "var(--gold, #D4A04A)" : "currentColor"}
          strokeWidth="1.6"
          strokeLinejoin="round"
          fill={active ? "rgba(212,160,74,0.12)" : "none"}
        />
      </svg>
    ),
  },
  {
    href:  "/discover/cigars",
    label: "Discover",
    center: false,
    match: (p: string) => p.startsWith("/discover"),
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="8" stroke={active ? "var(--gold, #D4A04A)" : "currentColor"} strokeWidth="1.6"/>
        <path d="M14.5 7.5l-2.8 5.6-5.6 2.8 2.8-5.6 5.6-2.8z" stroke={active ? "var(--gold, #D4A04A)" : "currentColor"} strokeWidth="1.4" strokeLinejoin="round"/>
        <circle cx="11" cy="11" r="1.2" fill={active ? "var(--gold, #D4A04A)" : "currentColor"}/>
      </svg>
    ),
  },
  {
    href:  "/account",
    label: "Account",
    center: false,
    match: (p: string) => p.startsWith("/account"),
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <circle
          cx="11" cy="8" r="3.5"
          stroke={active ? "var(--gold, #D4A04A)" : "currentColor"}
          strokeWidth="1.6"
        />
        <path
          d="M3 19c0-4 3.6-7 8-7s8 3 8 7"
          stroke={active ? "var(--gold, #D4A04A)" : "currentColor"}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch"
      style={{
        backgroundColor: "rgba(26,18,16,0.95)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid var(--border)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      aria-label="Main navigation"
    >
      {NAV_ITEMS.map(({ href, label, match, icon, center }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-opacity active:opacity-70"
            style={center ? { marginTop: -8 } : undefined}
            aria-current={active ? "page" : undefined}
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
                {icon(active)}
              </div>
            ) : (
              icon(active)
            )}
            <span
              className="text-[10px] font-medium leading-none"
              style={{ color: active ? "var(--gold, #D4A04A)" : "var(--muted-foreground)" }}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Page content — bottom padding clears the nav bar */}
      <main className="flex-1" style={{ paddingBottom: "calc(64px + env(safe-area-inset-bottom))" }}>
        {children}
      </main>
      <BottomNav />
    </>
  );
}
