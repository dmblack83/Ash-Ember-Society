"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/discover/cigars", label: "Cigars", match: (p: string) => p.startsWith("/discover/cigars") },
  { href: "/discover/shops",  label: "Shops",  match: (p: string) => p.startsWith("/discover/shops") },
];

export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      {/* Tab bar */}
      <div
        className="sticky top-0 z-30 flex gap-0"
        style={{ backgroundColor: "var(--background)", borderBottom: "1px solid var(--border)" }}
      >
        {TABS.map(({ href, label, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 text-center py-3 text-sm font-medium transition-colors duration-150"
              style={{
                color: active ? "var(--primary)" : "var(--muted-foreground)",
                borderBottom: active ? "2px solid var(--primary)" : "2px solid transparent",
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
