"use client";

/* ------------------------------------------------------------------
   BurnReportDraftCard

   Compact card for an unfiled burn-report draft. Lives at the top of
   the My Reports list above filed reports. Tapping routes back into
   the burn-report flow at the persisted step so the user can resume.

   Visual language matches BurnReportPreviewCard (same card surface,
   same brand caps + italic series treatment) but swaps the score
   block for a Draft badge and a step-progress line, and adds a small
   trash affordance for explicit dismissal.
   ------------------------------------------------------------------ */

import React from "react";
import { useRouter } from "next/navigation";

const STEP_TOTAL = 6;
const STEP_LABELS = [
  "The Basics",
  "Pairing",
  "Rating",
  "Flavor Profile",
  "Overall",
  "Summary",
] as const;

function relativeTime(savedAt: number): string {
  const diff = Date.now() - savedAt;
  const min  = Math.round(diff / 60_000);
  if (min < 1)   return "Just now";
  if (min < 60)  return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24)   return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export interface BurnReportDraftCardProps {
  itemId:   string;
  step:     number;
  savedAt:  number;
  cigar: {
    brand:  string | null;
    series: string | null;
    format: string | null;
  } | null;
  onDelete: (itemId: string) => void;
}

export function BurnReportDraftCard({
  itemId,
  step,
  savedAt,
  cigar,
  onDelete,
}: BurnReportDraftCardProps) {
  const router = useRouter();

  const brand = (cigar?.brand ?? "").trim();
  const name  = [cigar?.series, cigar?.format].filter(Boolean).join(" ").trim() || "Untitled cigar";

  const safeStep   = Math.max(0, Math.min(step, STEP_TOTAL - 1));
  const stepLabel  = STEP_LABELS[safeStep];
  const stepNumber = safeStep + 1;

  function handleResume() {
    router.push(`/humidor/${itemId}/burn-report`);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    onDelete(itemId);
  }

  return (
    <button
      type="button"
      onClick={handleResume}
      style={{
        all:          "unset",
        display:      "block",
        width:        "100%",
        cursor:       "pointer",
        border:       "1px dashed var(--gold, #D4A04A)",
        borderRadius: 6,
        background:   `
          radial-gradient(ellipse 110% 50% at 50% -10%, rgba(212,160,74,0.10), transparent 65%),
          var(--card)
        `,
        transition:              "border-color 0.18s, transform 0.18s",
        touchAction:             "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {/* Top strip — Draft badge + saved timestamp */}
      <div
        style={{
          padding:        "14px 16px 4px",
          display:        "flex",
          justifyContent: "space-between",
          alignItems:     "center",
          fontFamily:     "var(--font-mono)",
          fontSize:       8.5,
          letterSpacing:  "0.24em",
          textTransform:  "uppercase",
          color:          "var(--paper-dim)",
          borderBottom:   "1px dashed var(--line-soft)",
          marginBottom:   14,
        }}
      >
        <span
          style={{
            color:           "#1a1208",
            background:      "var(--gold, #D4A04A)",
            padding:         "3px 8px",
            borderRadius:    999,
            letterSpacing:   "0.22em",
            fontSize:        8.5,
            fontWeight:      600,
          }}
        >
          Draft
        </span>
        <span>Saved {relativeTime(savedAt)}</span>
      </div>

      {/* Main row — cigar identity + step progress */}
      <div
        style={{
          display:    "grid",
          gap:        10,
          padding:    "0 16px 14px",
        }}
      >
        {brand && (
          <p
            style={{
              fontFamily:    "var(--font-mono)",
              fontSize:      9,
              fontWeight:    500,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color:         "var(--gold)",
              margin:        0,
            }}
          >
            {brand}
          </p>
        )}
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle:  "italic",
            fontSize:   19,
            fontWeight: 500,
            color:      "var(--foreground)",
            lineHeight: 1.1,
            margin:     0,
            wordBreak:  "break-word",
          }}
        >
          {name}
        </p>
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle:  "italic",
            fontSize:   14,
            color:      "var(--paper-mute)",
            margin:     0,
            lineHeight: 1.3,
          }}
        >
          Step {stepNumber} of {STEP_TOTAL} · {stepLabel}
        </p>
      </div>

      {/* Footer row — Continue prompt + dismiss affordance */}
      <div
        style={{
          display:        "flex",
          justifyContent: "space-between",
          alignItems:     "center",
          padding:        "10px 16px",
          borderTop:      "1px solid var(--line-soft)",
        }}
      >
        <span
          style={{
            fontFamily:    "var(--font-mono)",
            fontSize:      10,
            fontWeight:    500,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color:         "var(--gold, #D4A04A)",
          }}
        >
          Tap to continue
        </span>
        <span
          role="button"
          tabIndex={0}
          aria-label="Discard draft"
          onClick={handleDelete}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleDelete(e as unknown as React.MouseEvent);
            }
          }}
          style={{
            display:        "inline-flex",
            alignItems:     "center",
            justifyContent: "center",
            width:          32,
            height:         32,
            color:          "var(--paper-mute)",
            background:     "transparent",
            border:         "none",
            cursor:         "pointer",
            borderRadius:   999,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M3 6h18M8 6V4h8v2M19 6l-1.5 14h-11L5 6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
      </div>
    </button>
  );
}
