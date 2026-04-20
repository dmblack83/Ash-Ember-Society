"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { getCigarImage } from "@/lib/cigar-default-image";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

export interface BurnReportRow {
  id:                      string;
  smoked_at:               string;
  overall_rating:          number | null;
  draw_rating:             number | null;
  burn_rating:             number | null;
  construction_rating:     number | null;
  flavor_rating:           number | null;
  smoke_duration_minutes:  number | null;
  pairing_drink:           string | null;
  review_text:             string | null;
  cigar: {
    id:        string;
    brand:     string;
    name:      string | null;
    series:    string | null;
    format:    string | null;
    wrapper:   string | null;
    image_url: string | null;
  } | null;
}

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

function ratingColor(v: number): string {
  if (v <= 40) return "#C44536";
  if (v <= 60) return "#8B6020";
  if (v <= 80) return "#3A6B45";
  return "#D4A04A";
}

function ratingLabel(v: number): string {
  if (v <= 20) return "Poor";
  if (v <= 40) return "Below Average";
  if (v <= 60) return "Average";
  if (v <= 80) return "Good";
  return "Outstanding";
}

const STAR_LABELS: Record<number, string> = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Very Good",
  5: "Excellent",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day:   "numeric",
    year:  "numeric",
  });
}

/* ------------------------------------------------------------------
   StarsSummary
   ------------------------------------------------------------------ */

function StarsSummary({ val }: { val: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            fill={s <= val ? "var(--primary)" : "none"}
            stroke={s <= val ? "var(--primary)" : "var(--border)"}
            strokeWidth="1.5"
          />
        </svg>
      ))}
      <span className="text-xs text-muted-foreground ml-1">{STAR_LABELS[val] ?? ""}</span>
    </span>
  );
}

/* ------------------------------------------------------------------
   Row helper for the expanded summary
   ------------------------------------------------------------------ */

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between gap-4 py-2.5 border-b last:border-0"
      style={{ borderColor: "var(--border)" }}
    >
      <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium flex-shrink-0">
        {label}
      </span>
      <span className="text-sm text-foreground text-right">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------
   Burn Report Card
   ------------------------------------------------------------------ */

function BurnReportCard({ report }: { report: BurnReportRow }) {
  const [open, setOpen] = useState(false);
  const c               = report.cigar;
  const rating          = report.overall_rating ?? 0;
  const color           = ratingColor(rating);
  const label           = ratingLabel(rating);

  const hasDetails =
    report.smoke_duration_minutes ||
    report.pairing_drink ||
    (report.draw_rating ?? 0) > 0 ||
    (report.burn_rating ?? 0) > 0 ||
    (report.construction_rating ?? 0) > 0 ||
    (report.flavor_rating ?? 0) > 0 ||
    report.review_text;

  return (
    <div className="card overflow-hidden">
      {/* ── Collapsed row ─────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-3 text-left transition-opacity active:opacity-70"
        style={{ background: "none", border: "none", cursor: "pointer", touchAction: "manipulation", WebkitTapHighlightColor: "transparent" } as React.CSSProperties}
        aria-expanded={open}
      >
        {/* Thumbnail */}
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
          <img
            src={getCigarImage(c?.image_url, c?.wrapper)}
            alt={c?.series ?? c?.name ?? "Cigar"}
            className="w-full h-full object-contain"
          />
        </div>

        {/* Cigar info */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium truncate">
            {c?.brand ?? "Unknown Brand"}
          </p>
          <p className="text-sm font-semibold text-foreground truncate">
            {c?.series ?? c?.name ?? "Unknown Cigar"}
          </p>
          {(c?.format || c?.wrapper) && (
            <p className="text-xs text-muted-foreground truncate">
              {[c?.format, c?.wrapper].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {formatDate(report.smoked_at)}
          </p>
        </div>

        {/* Rating badge + chevron */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div
            className="rounded-lg flex flex-col items-center justify-center"
            style={{ width: 44, height: 44, background: `${color}22`, border: `1px solid ${color}55` }}
          >
            <span
              className="font-bold leading-none"
              style={{ fontFamily: "var(--font-serif)", fontSize: 18, color }}
            >
              {rating}
            </span>
            <span className="text-[8px] font-medium uppercase tracking-wide leading-none mt-0.5" style={{ color }}>
              {label.split(" ")[0]}
            </span>
          </div>
          {hasDetails && (
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              style={{
                transform:  open ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
                color:      "var(--muted-foreground)",
              }}
            >
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </button>

      {/* ── Expanded summary ──────────────────────────────────────── */}
      {hasDetails && (
        <div
          style={{
            overflow:   "hidden",
            maxHeight:  open ? 600 : 0,
            transition: "max-height 0.3s ease",
          }}
        >
          <div className="px-4 pb-4" style={{ borderTop: "1px solid var(--border)" }}>
            {/* Rating hero */}
            <div className="flex items-center gap-3 py-4">
              <span
                className="font-bold"
                style={{ fontFamily: "var(--font-serif)", fontSize: 40, color, lineHeight: 1 }}
              >
                {rating}
              </span>
              <div>
                <p className="text-sm font-semibold" style={{ color }}>{label}</p>
                <p className="text-xs text-muted-foreground">Overall Rating</p>
              </div>
            </div>

            {/* Detail rows */}
            <div style={{ borderTop: "1px solid var(--border)" }}>
              {report.smoke_duration_minutes != null && (
                <SummaryRow label="Duration" value={`${report.smoke_duration_minutes} min`} />
              )}
              {report.pairing_drink && (
                <SummaryRow label="Drink" value={report.pairing_drink} />
              )}
              {(report.draw_rating ?? 0) > 0 && (
                <div
                  className="flex items-center justify-between gap-4 py-2.5 border-b last:border-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Draw</span>
                  <StarsSummary val={report.draw_rating!} />
                </div>
              )}
              {(report.burn_rating ?? 0) > 0 && (
                <div
                  className="flex items-center justify-between gap-4 py-2.5 border-b last:border-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Burn</span>
                  <StarsSummary val={report.burn_rating!} />
                </div>
              )}
              {(report.construction_rating ?? 0) > 0 && (
                <div
                  className="flex items-center justify-between gap-4 py-2.5 border-b last:border-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Construction</span>
                  <StarsSummary val={report.construction_rating!} />
                </div>
              )}
              {(report.flavor_rating ?? 0) > 0 && (
                <div
                  className="flex items-center justify-between gap-4 py-2.5 border-b last:border-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Flavor</span>
                  <StarsSummary val={report.flavor_rating!} />
                </div>
              )}
            </div>

            {/* Review text */}
            {report.review_text && (
              <div className="mt-3 space-y-1">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Review</p>
                <p className="text-sm text-foreground leading-relaxed">{report.review_text}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   BurnReportsClient
   ------------------------------------------------------------------ */

interface BurnReportsClientProps {
  reports: BurnReportRow[];
}

export function BurnReportsClient({ reports }: BurnReportsClientProps) {
  const headerRef                       = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

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
          <div className="flex items-center pt-4 pb-3">
            <h1 style={{ fontFamily: "var(--font-serif)" }}>My Reports</h1>
          </div>

        </div>
      </div>

      {/* Spacer */}
      <div style={{ height: headerHeight }} aria-hidden="true" />

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
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
          <div className="flex flex-col gap-2">
            {reports.map((report) => (
              <BurnReportCard key={report.id} report={report} />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
