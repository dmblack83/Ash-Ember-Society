"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

export interface BurnReportRow {
  id:             string;
  smoked_at:      string;
  overall_rating: number | null;
  review_text:    string | null;
  cigar: {
    id:     string;
    brand:  string;
    name:   string | null;
    format: string | null;
  } | null;
}

interface BurnReportsClientProps {
  reports: BurnReportRow[];
}

/* ------------------------------------------------------------------
   BurnReportsClient
   ------------------------------------------------------------------ */

export function BurnReportsClient({ reports }: BurnReportsClientProps) {
  const headerRef                   = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  /* Measure fixed header */
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setHeaderHeight(el.offsetHeight));
    obs.observe(el);
    setHeaderHeight(el.offsetHeight);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>

      {/* ── Fixed header ───────────────────────────────────────────── */}
      <div
        ref={headerRef}
        className="fixed top-0 left-0 right-0 z-30"
        style={{
          background:   "var(--background)",
          borderBottom: "1px solid var(--border)",
          paddingTop:   "env(safe-area-inset-top)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">

          {/* Row 1: Tab navigation */}
          <div className="flex border-b border-border/50">
            <Link
              href="/humidor"
              className="px-1 pb-3 pt-4 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors duration-150 mr-6"
            >
              Humidor
            </Link>
            <Link
              href="/humidor/wishlist"
              className="px-1 pb-3 pt-4 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors duration-150 mr-6"
            >
              Wishlist
            </Link>
            <span
              className="px-1 pb-3 pt-4 text-sm font-medium border-b-2 mr-6"
              style={{ borderColor: "var(--ember, #E8642C)", color: "var(--foreground)" }}
            >
              Burn Reports
            </span>
            <Link
              href="/humidor/stats"
              className="px-1 pb-3 pt-4 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors duration-150"
            >
              Stats
            </Link>
          </div>

          {/* Row 2: Title */}
          <div className="flex items-center gap-4 pt-4 pb-3">
            <h1 style={{ fontFamily: "var(--font-serif)" }}>My Burn Reports</h1>
          </div>

        </div>
      </div>

      {/* Spacer */}
      <div style={{ height: headerHeight }} aria-hidden="true" />

      {/* ── Content placeholder ─────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div
              className="rounded-full flex items-center justify-center"
              style={{ width: 64, height: 64, background: "rgba(193,120,23,0.12)" }}
            >
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <path
                  d="M14 3C14 3 8 9 8 15a6 6 0 0012 0c0-6-6-12-6-12z"
                  stroke="var(--primary)"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  fill="none"
                />
                <circle cx="14" cy="15" r="2.5" fill="var(--primary)" opacity="0.6" />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="font-semibold" style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}>
                No burn reports yet
              </p>
              <p className="text-sm text-muted-foreground max-w-[260px]">
                Log a smoke from any cigar in your humidor to see your reports here.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {reports.length} {reports.length === 1 ? "report" : "reports"} — detail view coming soon.
          </p>
        )}
      </div>

    </div>
  );
}
