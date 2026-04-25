"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/discover/content",  label: "Content",  match: (p: string) => p.startsWith("/discover/content") },
  { href: "/discover/partners", label: "Partners", match: (p: string) => p.startsWith("/discover/partners") },
  { href: "/discover/shops",    label: "Shops",    match: (p: string) => p.startsWith("/discover/shops") },
];

/* Tab bar height — used to offset the scrollable content area */
const TAB_BAR_H = 45;

export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      {/* Fixed tab bar — stays in place while content scrolls */}
      <div
        style={{
          position:        "fixed",
          top:             0,
          left:            0,
          right:           0,
          zIndex:          30,
          display:         "flex",
          backgroundColor: "var(--background)",
          borderBottom:    "1px solid var(--border)",
        }}
      >
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

      {/* Offset content so it starts below the fixed tab bar */}
      <div style={{ paddingTop: TAB_BAR_H }}>
        {children}
      </div>
    </>
  );
}
