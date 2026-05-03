/* ------------------------------------------------------------------
   BurnReportPreviewCard

   Compact editorial preview of a Burn Report. Shown in:
   - Humidor → Burn Reports list
   - Lounge feed (when a burn report is shared)

   Tapping the card opens the full Verdict view (current VerdictCard
   in a modal). The preview is intentionally light — top strip with
   volume number + date, score block on the left, meta block on the
   right, and a 4-cell sub-rating stripe at the bottom. No photos, no
   review text, no specs, no thirds. Those live in the full view.

   Visual reference: design_handoff_burn_report_feed.

   The handoff specifies Cormorant Garamond + JetBrains Mono and a
   custom palette; per project guidance we map onto existing tokens —
   --font-serif (Playfair) for italic editorial, --font-mono for
   monospace, --card / --gold / --paper-mute / --line / --line-soft
   for the surface and chrome.
   ------------------------------------------------------------------ */

import React from "react";

/* Same grade thresholds as VerdictCard. Kept in sync so the two
   surfaces always show the same word for the same score. */
function gradeFor(v: number): string {
  if (v <= 20) return "Poor";
  if (v <= 40) return "Below Average";
  if (v <= 60) return "Average";
  if (v <= 80) return "Good";
  return "Outstanding";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    .toUpperCase();
}

/* Star row — five Unicode stars, gold for filled and dimmed paper for
   empty. The handoff specifies Unicode (★) over SVG so the stripe
   stays text-light and font-weight-rendered. */
function StarRow({ val }: { val: number }) {
  return (
    <div
      style={{
        fontFamily:    "var(--font-mono)",
        fontSize:      11,
        letterSpacing: "0.5px",
        lineHeight:    1,
      }}
    >
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          style={{
            color: s <= val ? "var(--gold)" : "rgba(245,230,211,0.18)",
          }}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function StripeCell({ label, val, isLast }: { label: string; val: number; isLast: boolean }) {
  return (
    <div
      style={{
        padding:     "10px 6px",
        textAlign:   "center",
        borderRight: isLast ? "none" : "1px solid var(--line-soft)",
      }}
    >
      <p
        style={{
          fontFamily:    "var(--font-mono)",
          fontSize:      7.5,
          fontWeight:    500,
          letterSpacing: "0.20em",
          textTransform: "uppercase",
          color:         "var(--paper-dim)",
          margin:        "0 0 4px",
        }}
      >
        {label}
      </p>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <StarRow val={val} />
      </div>
    </div>
  );
}

export interface BurnReportPreviewCardCigar {
  brand:  string | null;
  series: string | null;
  format: string | null;
}

export interface BurnReportPreviewCardProps {
  cigar:        BurnReportPreviewCardCigar | null;
  reportNumber: number | null;
  smokedAt:     string;
  overallRating:       number | null;
  drawRating?:         number | null;
  burnRating?:         number | null;
  constructionRating?: number | null;
  flavorRating?:       number | null;
  /* Duration shown alongside grade ("Good · 84 min"). */
  smokeDurationMinutes?: number | null;
  /* Tap handler — opens the full view. */
  onTap?: () => void;
}

export function BurnReportPreviewCard({
  cigar,
  reportNumber,
  smokedAt,
  overallRating,
  drawRating         = null,
  burnRating         = null,
  constructionRating = null,
  flavorRating       = null,
  smokeDurationMinutes,
  onTap,
}: BurnReportPreviewCardProps) {
  const score = overallRating ?? 0;
  const grade = overallRating != null ? gradeFor(overallRating) : "—";

  const brand = (cigar?.brand ?? "").trim();
  const name  = [cigar?.series, cigar?.format].filter(Boolean).join(" ").trim();

  const gradeLine = smokeDurationMinutes
    ? `${grade} · ${smokeDurationMinutes} min`
    : grade;

  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        all:          "unset",
        display:      "block",
        width:        "100%",
        cursor:       onTap ? "pointer" : "default",
        border:       "1px solid var(--line)",
        borderRadius: 6,
        background:   `
          radial-gradient(ellipse 110% 50% at 50% -10%, rgba(212,160,74,0.08), transparent 65%),
          var(--card)
        `,
        transition:              "border-color 0.18s, transform 0.18s",
        touchAction:             "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--line-strong)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--line)"; }}
    >
      {/* Top strip — volume number + date, dashed bottom border */}
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
        <span style={{ color: "var(--gold)" }}>
          {reportNumber != null ? `NO. ${reportNumber}` : ""}
        </span>
        <span>{formatDate(smokedAt)}</span>
      </div>

      {/* Main row — score block + meta block, vertical divider between */}
      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "auto 1fr",
          gap:                 16,
          padding:             "0 16px 14px",
          alignItems:          "center",
        }}
      >
        {/* Score block */}
        <div
          style={{
            textAlign:    "center",
            paddingRight: 16,
            borderRight:  "1px solid var(--line-soft)",
            minWidth:     72,
          }}
        >
          <span
            style={{
              fontFamily:    "var(--font-serif)",
              fontStyle:     "italic",
              fontSize:      56,
              lineHeight:    0.9,
              color:         "var(--gold)",
              fontWeight:    500,
              letterSpacing: "-0.03em",
              display:       "block",
            }}
          >
            {overallRating ?? "—"}
          </span>
          <span
            style={{
              fontFamily:    "var(--font-mono)",
              fontSize:      8,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color:         "var(--paper-dim)",
              marginTop:     4,
              display:       "block",
            }}
          >
            / 100
          </span>
        </div>

        {/* Meta block — brand caps, cigar name italic, grade · duration */}
        <div style={{ minWidth: 0, textAlign: "left" }}>
          {brand && (
            <p
              style={{
                fontFamily:    "var(--font-mono)",
                fontSize:      9,
                fontWeight:    500,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color:         "var(--gold)",
                margin:        "0 0 4px",
              }}
            >
              {brand}
            </p>
          )}
          {name && (
            <p
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle:  "italic",
                fontSize:   19,
                fontWeight: 500,
                color:      "var(--foreground)",
                lineHeight: 1.1,
                margin:     "0 0 4px",
                wordBreak:  "break-word",
              }}
            >
              {name}
            </p>
          )}
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
            {gradeLine}
          </p>
        </div>
      </div>

      {/* Stripe — 4-cell sub-ratings */}
      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          borderTop:           "1px solid var(--line-soft)",
        }}
      >
        <StripeCell label="Draw"   val={drawRating         ?? 0} isLast={false} />
        <StripeCell label="Burn"   val={burnRating         ?? 0} isLast={false} />
        <StripeCell label="Build"  val={constructionRating ?? 0} isLast={false} />
        <StripeCell label="Flavor" val={flavorRating       ?? 0} isLast={true} />
      </div>
    </button>
  );
}
