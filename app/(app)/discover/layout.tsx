"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/discover/content",  label: "Content",  match: (p: string) => p.startsWith("/discover/content") },
  { href: "/discover/partners", label: "Partners", match: (p: string) => p.startsWith("/discover/partners") },
  { href: "/discover/shops",    label: "Shops",    match: (p: string) => p.startsWith("/discover/shops") },
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
          left:            0,
          right:           0,
          zIndex:          30,
          backgroundColor: "var(--background)",
          borderBottom:    "1px solid var(--border)",
        }}
      >
        <div className="flex max-w-2xl mx-auto">
          {TABS.map(({ href, label, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                className="flex-1 text-center py-3 text-sm font-medium transition-colors duration-150"
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
