"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

export interface AgingItem {
  id:                string;
  aging_start_date:  string | null;
  aging_target_date: string;          // guaranteed non-null by query
  cigar: {
    brand:  string | null;
    series: string | null;
    format: string | null;
  };
}

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

/** How long a cigar has been aging, expressed as a readable string. */
function agingDuration(startDate: string | null): string | null {
  if (!startDate) return null;
  const days = Math.floor(
    (Date.now() - new Date(startDate).getTime()) / 86_400_000
  );
  if (days < 1)   return "Started today";
  if (days < 31)  return `Aging ${days} day${days !== 1 ? "s" : ""}`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `Aging ${months} month${months !== 1 ? "s" : ""}`;
  const years  = Math.floor(months / 12);
  const rem    = months % 12;
  return rem > 0
    ? `Aging ${years}y ${rem}mo`
    : `Aging ${years} year${years !== 1 ? "s" : ""}`;
}

/* ------------------------------------------------------------------
   Chevron icon
   ------------------------------------------------------------------ */

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{
        transition: "transform 0.25s ease",
        transform:  open ? "rotate(180deg)" : "rotate(0deg)",
        flexShrink: 0,
        color:      "var(--muted-foreground)",
      }}
    >
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------
   Status label
   ------------------------------------------------------------------ */

function StatusLabel() {
  return (
    <span className="text-xs font-semibold flex-shrink-0" style={{ color: "#4ade80" }}>
      Ready
    </span>
  );
}

/* ------------------------------------------------------------------
   Single aging row (expanded only)
   ------------------------------------------------------------------ */

function AgingRow({ item }: { item: AgingItem }) {
  const router   = useRouter();
  const duration = agingDuration(item.aging_start_date);
  const display  = item.cigar.series ?? item.cigar.format;

  return (
    <button
      type="button"
      onClick={() => router.push(`/humidor/${item.id}`, { scroll: false })}
      className="w-full flex items-center justify-between gap-3 text-left transition-opacity active:opacity-70"
      style={{
        minHeight:               44,
        touchAction:             "manipulation",
        WebkitTapHighlightColor: "transparent",
        background:              "none",
        border:                  "none",
        padding:                 "10px 0",
        cursor:                  "pointer",
      } as React.CSSProperties}
      aria-label={`${display} — ready to smoke`}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        {item.cigar.brand && (
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground truncate">
            {item.cigar.brand}
          </p>
        )}
        <p className="text-sm font-semibold text-foreground truncate leading-snug">
          {display}
        </p>
        {duration && (
          <p className="text-xs text-muted-foreground">{duration}</p>
        )}
      </div>
      <StatusLabel />
    </button>
  );
}

/* ------------------------------------------------------------------
   AgingAlerts — main export

   Receives initial items as a prop (server-fetched in home/page.tsx).
   Keeps "use client" for accordion expand/collapse and useRouter.
   ------------------------------------------------------------------ */

export function AgingAlerts({ initialItems }: { initialItems: AgingItem[] }) {
  const [expanded, setExpanded] = useState(false);

  // No matching cigars — hide the section entirely
  if (initialItems.length === 0) return null;

  const count = initialItems.length;

  return (
    <section className="flex flex-col gap-3 animate-fade-in" style={{ animationDelay: "160ms" }}>
      <div
        className="glass rounded-xl overflow-hidden"
        aria-label="Aging alerts"
      >
        {/* ── Always-visible collapsed header ────────────────────── */}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center justify-between gap-2 px-4"
          style={{
            minHeight:               44,
            paddingTop:              10,
            paddingBottom:           10,
            touchAction:             "manipulation",
            WebkitTapHighlightColor: "transparent",
            background:              "none",
            border:                  "none",
            cursor:                  "pointer",
          } as React.CSSProperties}
          aria-expanded={expanded}
          aria-controls="aging-alerts-list"
        >
          {/* Left: section title */}
          <span
            className="font-semibold leading-none"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize:   14,
              color:      "var(--gold)",
            }}
          >
            Aging Alerts
          </span>

          {/* Right: bell + count + chevron */}
          <div className="flex items-center gap-2">
            {/* Bell icon */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
              style={{ color: "var(--muted-foreground)", flexShrink: 0 }}
            >
              <path
                d="M7 1.5a4 4 0 00-4 4v2.5l-1 1.5h10l-1-1.5V5.5a4 4 0 00-4-4z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
              <path
                d="M5.5 11.5a1.5 1.5 0 003 0"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>

            {/* Count badge */}
            <span
              className="flex items-center justify-center rounded-full text-[10px] font-bold"
              style={{
                minWidth:        18,
                height:          18,
                padding:         "0 5px",
                background:      "var(--primary)",
                color:           "#fff",
              }}
            >
              {count}
            </span>

            <Chevron open={expanded} />
          </div>
        </button>

        {/* ── Expandable list ───────────────────────────────────── */}
        <div
          id="aging-alerts-list"
          style={{
            maxHeight:  expanded ? count * 80 + 32 : 0,
            overflow:   "hidden",
            transition: "max-height 0.3s ease",
          }}
        >
          {/* Divider */}
          <div style={{ height: 1, backgroundColor: "var(--border)", marginInline: 16 }} />

          {/* Sub-label */}
          <div className="px-4 pt-2.5 pb-0.5">
            <p
              className="text-[11px] font-bold tracking-widest uppercase"
              style={{ color: "var(--muted-foreground)" }}
            >
              Ready to Smoke
            </p>
          </div>

          {/* Rows */}
          <div className="px-4 divide-y" style={{ borderColor: "var(--border)" }}>
            {initialItems.map((item) => (
              <AgingRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
