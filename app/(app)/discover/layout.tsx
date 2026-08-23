"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/discover/channels",   label: "Channels",   match: (p: string) => p.startsWith("/discover/channels") },
  { href: "/discover/cigar-news", label: "Industry News", match: (p: string) => p.startsWith("/discover/cigar-news") },
  { href: "/discover/vendors",    label: "Vendors",    match: (p: string) => p.startsWith("/discover/vendors") },
];

/* ------------------------------------------------------------------
   TAB_BAR_H — py-3 (12×2) + text-sm line-height (~21px) = 45px.
   Content gets matching paddingTop so nothing hides behind the bar.
   ------------------------------------------------------------------ */
const TAB_BAR_H = 45;

export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      {/* ── Fixed sub-nav ─────────────────────────────────────────── */}
      {/* Outer div spans full width for the background/border.       */}
      {/* Inner div constrains tabs to match app content width.       */}
      <div
        style={{
          position:        "fixed",
          top:             0,
          left:            "var(--app-content-left)",
          right:           0,
          zIndex:          30,
          backgroundColor: "var(--background)",
          borderBottom:    "1px solid var(--border)",
        }}
      >
        {/* lg clusters the tabs (shrink-to-fit, centered) instead of
            stretching each across a third of the column — desktop UX
            spec item 07. Below lg the flex-1 spread is unchanged. */}
        <div className="flex max-w-2xl mx-auto lg:justify-center">
          {TABS.map(({ href, label, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                className="flex-1 lg:flex-none lg:px-8 text-center py-3 text-sm font-medium transition-colors duration-150"
                style={{
                  color:        active ? "var(--primary)" : "var(--muted-foreground)",
                  borderBottom: active ? "2px solid var(--primary)" : "2px solid transparent",
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Content — offset clears the fixed header ──────────────── */}
      <div style={{ paddingTop: TAB_BAR_H }}>
        {children}
      </div>
    </>
  );
}
