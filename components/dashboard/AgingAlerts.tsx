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

/** Days between today (00:00 local) and a YYYY-MM-DD date string. */
function daysUntil(dateStr: string): number {
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

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
   Status label
   ------------------------------------------------------------------ */

function StatusLabel({ days }: { days: number }) {
  if (days < 0) {
    return (
      <span className="text-xs font-semibold flex-shrink-0" style={{ color: "var(--moss)" }}>
        Ready
      </span>
    );
  }
  if (days === 0) {
    return (
      <span className="text-xs font-semibold flex-shrink-0" style={{ color: "var(--moss)" }}>
        Ready Today
      </span>
    );
  }
  return (
    <span className="text-xs font-semibold flex-shrink-0" style={{ color: "var(--gold)" }}>
      Ready in {days}d
    </span>
  );
}

/* ------------------------------------------------------------------
   Single aging row (expanded only)
   ------------------------------------------------------------------ */

function AgingRow({ item }: { item: AgingItem }) {
  const router   = useRouter();
  const days     = daysUntil(item.aging_target_date);
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
      aria-label={`${display} — ${days < 0 ? "ready" : days === 0 ? "ready today" : `ready in ${days} days`}`}
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
      <StatusLabel days={days} />
    </button>
  );
}

/* ------------------------------------------------------------------
   AgingAlerts — main export

   Receives initial items as a prop (server-fetched in home/page.tsx).
   Editorial chrome: italic-serif "Aging Shelf" header with a mono
   "N ALERTS ▾" toggle. List format inside the card is unchanged from
   the original — only the surrounding chrome moved to the new design.
   ------------------------------------------------------------------ */

export function AgingAlerts({ initialItems }: { initialItems: AgingItem[] }) {
  const [expanded, setExpanded] = useState(false);

  // No matching cigars — hide the section entirely
  if (initialItems.length === 0) return null;

  const count = initialItems.length;

  return (
    <section
      className="animate-fade-in"
      style={{
        animationDelay: "160ms",
        position:       "relative",
        border:         "1px solid var(--line)",
        borderRadius:   6,
        background:     "linear-gradient(165deg, #2a1f15 0%, #1a130c 100%)",
        padding:        "18px 20px 16px",
        overflow:       "hidden",
      }}
      aria-label="Aging shelf"
    >
      {/* Radial highlight in top-right */}
      <div
        aria-hidden="true"
        style={{
          position:      "absolute",
          top:           0,
          right:         0,
          width:         140,
          height:        140,
          background:    "radial-gradient(ellipse at top right, rgba(212,160,74,0.16), transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Eyebrow with trailing rule */}
      <div
        style={{
          fontFamily:    "var(--font-mono)",
          fontSize:      10,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          color:         "var(--gold)",
          display:       "flex",
          alignItems:    "center",
          gap:           10,
          marginBottom:  10,
          position:      "relative",
          zIndex:        1,
        }}
      >
        Aging Shelf
        <span
          aria-hidden="true"
          style={{ flex: 1, height: 1, background: "var(--line)" }}
        />
      </div>

      {/* Header row — italic title + count toggle */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-baseline justify-between"
        style={{
          minHeight:               44,
          padding:                 "0",
          touchAction:             "manipulation",
          WebkitTapHighlightColor: "transparent",
          background:              "none",
          border:                  "none",
          cursor:                  "pointer",
          textAlign:               "left",
          position:                "relative",
          zIndex:                  1,
        } as React.CSSProperties}
        aria-expanded={expanded}
        aria-controls="aging-shelf-list"
      >
        <h2
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle:  "italic",
            fontWeight: 500,
            fontSize:   "clamp(20px, 5vw, 24px)",
            lineHeight: 1.1,
            color:      "var(--foreground)",
            margin:     0,
          }}
        >
          {count} {count === 1 ? "cigar" : "cigars"} ready soon.
        </h2>

        <span
          style={{
            display:        "inline-flex",
            alignItems:     "center",
            gap:            6,
            fontFamily:     "var(--font-mono)",
            fontSize:       9,
            letterSpacing:  "0.22em",
            textTransform:  "uppercase",
            color:          "var(--paper-mute)",
            flexShrink:     0,
          }}
        >
          {expanded ? "Hide" : "View"}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            aria-hidden="true"
            style={{
              transition: "transform 0.25s ease",
              transform:  expanded ? "rotate(0deg)" : "rotate(-90deg)",
              color:      "var(--gold)",
            }}
          >
            <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {/* ── Expandable list ───────────────────────────────────── */}
      <div
        id="aging-shelf-list"
        style={{
          maxHeight:  expanded ? 1000 : 0,
          opacity:    expanded ? 1 : 0,
          overflow:   "hidden",
          transition: "max-height 320ms ease, opacity 220ms ease, margin-top 200ms ease, padding-top 200ms ease",
          borderTop:  expanded ? "1px solid var(--line)" : "1px solid transparent",
          marginTop:  expanded ? 12 : 0,
          paddingTop: expanded ? 4 : 0,
          position:   "relative",
          zIndex:     1,
        }}
      >
        <div className="divide-y" style={{ borderColor: "var(--line-soft)" }}>
          {initialItems.map((item) => (
            <AgingRow key={item.id} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
