/* ------------------------------------------------------------------
   VerdictCard

   The editorial "Burn Report" card, used everywhere a saved or
   in-flight Burn Report is rendered:

   - Step 6 (Summary) of the Burn Report flow (in-flight preview)
   - Humidor → Burn Reports list (saved)
   - Lounge inline post + post detail + post modal (saved + shared)

   Design language: see design_handoff_burn_report. This component
   is the single source of truth — do not branch the layout per
   call site.

   Props are intentionally normalized (string photo URLs, plain
   numeric ratings, plain trimmed strings) so each call site only
   has to adapt its source data once at the boundary.
   ------------------------------------------------------------------ */

import React from "react";
import Image from "next/image";

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

/* In-flight Burn Report previews pass blob: URLs (URL.createObjectURL
   on the user's File). next/image can't optimize client-side memory
   refs, so we mark blob sources `unoptimized` and let the browser
   render them directly. Saved-report sources are real Supabase
   URLs and run through the optimizer normally. */
function isBlobUrl(src: string): boolean {
  return src.startsWith("blob:");
}

/* ------------------------------------------------------------------
   Score-grade label — 1–100 thresholds. Kept in sync with the
   in-flight `ratingLabel` in BurnReport.tsx so saved and live cards
   show the same word for the same number.
   ------------------------------------------------------------------ */

function gradeFor(v: number): string {
  if (v <= 20) return "Poor";
  if (v <= 40) return "Below Average";
  if (v <= 60) return "Average";
  if (v <= 80) return "Good";
  return "Outstanding";
}

const STAR_LABELS = ["", "Poor", "Below Average", "Average", "Good", "Excellent"] as const;

/* ------------------------------------------------------------------
   Sub-components — hoisted so React doesn't recreate them per render
   ------------------------------------------------------------------ */

function StarRow({ val }: { val: number }) {
  return (
    <div className="flex" style={{ gap: 2 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            fill={s <= val ? "var(--gold)" : "rgba(245,230,211,0.18)"}
          />
        </svg>
      ))}
    </div>
  );
}

function SubRatingCell({ label, val }: { label: string; val: number }) {
  return (
    <div style={{ textAlign: "center" }}>
      <p
        style={{
          fontFamily:    "var(--font-mono)",
          fontSize:      9,
          fontWeight:    500,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color:         "var(--paper-mute)",
          margin:        0,
        }}
      >
        {label}
      </p>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
        <StarRow val={val} />
      </div>
      <p
        style={{
          fontFamily:    "var(--font-mono)",
          fontSize:      9,
          fontWeight:    500,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color:         "var(--gold-deep)",
          margin:        "6px 0 0",
          minHeight:     11,
        }}
      >
        {val > 0 ? STAR_LABELS[val] : "—"}
      </p>
    </div>
  );
}

function SpecCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <p
        style={{
          fontFamily:    "var(--font-mono)",
          fontSize:      9,
          fontWeight:    500,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color:         "var(--paper-mute)",
          margin:        0,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle:  "italic",
          fontSize:   16,
          fontWeight: 500,
          color:      "var(--foreground)",
          margin:     "4px 0 0",
          lineHeight: 1.2,
        }}
      >
        {value}
      </p>
    </div>
  );
}

function PhotoStrip({
  urls,
  onPhotoClick,
  sizesHint,
}: {
  urls: string[];
  onPhotoClick?: (url: string) => void;
  /* Comma-list of viewport-conditional widths the layout uses for
     each cell. Saved-report contexts (full card) pass a tighter
     value than the in-flight preview to give the optimizer a more
     accurate target. */
  sizesHint: string;
}) {
  if (urls.length === 0) return null;

  // Each cell wraps a next/image in fill mode so the optimizer
  // generates a srcset matched to the rendered size. blob: URLs
  // (in-flight previews from URL.createObjectURL) bypass the
  // optimizer; everything else (Supabase Storage) goes through it.
  function cell(url: string, cellStyle: React.CSSProperties) {
    const inner = (
      <Image
        src={url}
        alt=""
        fill
        sizes={sizesHint}
        quality={82}
        unoptimized={isBlobUrl(url)}
        style={{ objectFit: "cover", borderRadius: 3 }}
      />
    );

    const wrapperStyle: React.CSSProperties = {
      position: "relative",
      ...cellStyle,
    };

    if (!onPhotoClick) {
      return <div style={wrapperStyle}>{inner}</div>;
    }
    return (
      <button
        type="button"
        onClick={() => onPhotoClick(url)}
        style={{ ...wrapperStyle, padding: 0, border: "none", background: "none", cursor: "pointer" }}
        aria-label="View photo"
      >
        {inner}
      </button>
    );
  }

  if (urls.length === 1) {
    return (
      <div style={{ marginTop: 22 }}>
        {cell(urls[0], { width: "100%", aspectRatio: "16 / 10" })}
      </div>
    );
  }

  if (urls.length === 2) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 22 }}>
        {urls.map((u, i) => (
          <React.Fragment key={i}>{cell(u, { aspectRatio: "1 / 1" })}</React.Fragment>
        ))}
      </div>
    );
  }

  // 3 (or more — show first 3 in the asymmetric layout, drop extras)
  return (
    <div
      style={{
        display:             "grid",
        gridTemplateColumns: "2fr 1fr",
        gridTemplateRows:    "1fr 1fr",
        gap:                 6,
        marginTop:           22,
        aspectRatio:         "3 / 2",
      }}
    >
      {cell(urls[0], { gridRow: "1 / span 2" })}
      {cell(urls[1], {})}
      {cell(urls[2], {})}
    </div>
  );
}

/* ------------------------------------------------------------------
   Public types
   ------------------------------------------------------------------ */

export interface VerdictCardCigar {
  brand:  string | null;
  series: string | null;
  format: string | null;
}

export interface VerdictCardProps {
  cigar: VerdictCardCigar | null;

  /* Masthead. `reportNumber` is optional — if omitted, the "NO. N"
     segment is dropped. `smokedAt` is an ISO date or full ISO ts. */
  reportNumber?: number | null;
  smokedAt:      string;

  /* Score block. overallRating null renders an em dash. */
  overallRating: number | null;

  /* Sub-ratings (1–5). Null/0 renders as muted "—". */
  drawRating?:         number | null;
  burnRating?:         number | null;
  constructionRating?: number | null;
  flavorRating?:       number | null;

  /* Review. Empty/null hides the pull-quote section entirely. */
  reviewText: string | null;

  /* Specs. Pass plain strings; values trimmed by callers. */
  smokeDurationMinutes: number | string | null;
  pairingDrink:         string | null;
  occasion:             string | null;

  /* Already-resolved flavor names — caller maps tag IDs → names. */
  flavorTagNames: string[];

  /* Photo URLs (string). In-flight callers convert File → blob URL
     at the boundary (URL.createObjectURL). */
  photoUrls: string[];

  /* Thirds (from burn_reports). Optional — when missing, no section. */
  thirdsEnabled?:   boolean;
  thirdBeginning?:  string | null;
  thirdMiddle?:     string | null;
  thirdEnd?:        string | null;

  /* Byline. Both optional; if both null, the byline line is dropped.
     `displayName` should be the AUTHOR of the report (in the lounge
     this is the post author, not the viewer). */
  displayName: string | null;
  city:        string | null;

  /* Optional photo lightbox handler. When provided, photos become
     buttons that fire on tap. The in-flight preview omits this. */
  onPhotoClick?: (url: string) => void;
}

/* ------------------------------------------------------------------
   VerdictCard
   ------------------------------------------------------------------ */

export function VerdictCard({
  cigar,
  reportNumber,
  smokedAt,
  overallRating,
  drawRating,
  burnRating,
  constructionRating,
  flavorRating,
  reviewText,
  smokeDurationMinutes,
  pairingDrink,
  occasion,
  flavorTagNames,
  photoUrls,
  thirdsEnabled  = false,
  thirdBeginning = null,
  thirdMiddle    = null,
  thirdEnd       = null,
  displayName,
  city,
  onPhotoClick,
}: VerdictCardProps) {
  const score = overallRating ?? 0;
  const grade = overallRating != null ? gradeFor(overallRating) : "—";

  // First name (uppercase) and city (uppercase) for byline + verdict label.
  const firstName = (displayName?.trim().split(/\s+/)[0] ?? "").toUpperCase() || null;
  const cityUpper = city?.trim().toUpperCase() || null;

  // Masthead date: "MAY 02 2026" — uppercase, mono, no commas.
  const smokedDate = smokedAt
    ? new Date(smokedAt.length === 10 ? smokedAt + "T00:00:00" : smokedAt)
    : new Date();
  const mastheadDate = smokedDate
    .toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" })
    .toUpperCase()
    .replace(",", "");

  const mastheadParts = [
    "Burn Report",
    reportNumber != null ? `No. ${reportNumber}` : null,
    mastheadDate,
  ].filter(Boolean) as string[];

  const review = reviewText?.trim() ?? "";

  const anyThird = (thirdBeginning?.trim() || thirdMiddle?.trim() || thirdEnd?.trim()) ?? "";
  const showThirds = thirdsEnabled && anyThird.length > 0;

  return (
    <div>
      {/* ────────── Verdict Card ────────── */}
      <article
        style={{
          background:    "var(--card)",
          border:        "1px solid var(--line)",
          borderRadius:  4,
          padding:       22,
        }}
      >
        {/* Masthead row — two hairlines bracketing a mono uppercase line */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ height: 1, background: "var(--line)" }} aria-hidden="true" />
          <p
            style={{
              fontFamily:    "var(--font-mono)",
              fontSize:      10,
              fontWeight:    500,
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              color:         "var(--paper-mute)",
              textAlign:     "center",
              margin:        "6px 0",
            }}
          >
            {mastheadParts.join(" · ")}
          </p>
          <div style={{ height: 1, background: "var(--line)" }} aria-hidden="true" />
        </div>

        {/* Centered identity */}
        <div style={{ textAlign: "center" }}>
          {cigar?.brand && (
            <p
              style={{
                fontFamily:    "var(--font-mono)",
                fontSize:      10,
                fontWeight:    500,
                letterSpacing: "0.32em",
                textTransform: "uppercase",
                color:         "var(--gold)",
                margin:        0,
              }}
            >
              {cigar.brand}
            </p>
          )}
          <p
            style={{
              fontFamily:    "var(--font-serif)",
              fontStyle:     "italic",
              fontSize:      28,
              fontWeight:    500,
              color:         "var(--foreground)",
              margin:        "8px 0 0",
              lineHeight:    1.1,
              letterSpacing: "-0.01em",
            }}
          >
            {cigar?.series ?? cigar?.format ?? "Unknown Cigar"}
          </p>
          {cigar?.format && cigar?.series && (
            <p
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle:  "italic",
                fontSize:   15,
                color:      "var(--paper-mute)",
                margin:     "4px 0 0",
              }}
            >
              {cigar.format}
            </p>
          )}
        </div>

        {/* Score block */}
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "auto 1fr",
            gap:                 18,
            alignItems:          "center",
            padding:             "22px 0",
            margin:              "22px 0",
            borderTop:           "1px solid var(--line-soft)",
            borderBottom:        "1px solid var(--line-soft)",
          }}
        >
          <p
            style={{
              fontFamily:    "var(--font-serif)",
              fontStyle:     "italic",
              fontSize:      76,
              fontWeight:    500,
              lineHeight:    0.9,
              letterSpacing: "-0.02em",
              color:         "var(--gold)",
              margin:        0,
              paddingRight:  18,
              borderRight:   "1px solid var(--line-soft)",
            }}
          >
            {overallRating != null ? score : "—"}
          </p>
          <div>
            <p
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle:  "italic",
                fontSize:   22,
                fontWeight: 500,
                color:      "var(--foreground)",
                lineHeight: 1.05,
                margin:     0,
              }}
            >
              {grade}
            </p>
            <p
              style={{
                fontFamily:    "var(--font-mono)",
                fontSize:      10,
                fontWeight:    500,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color:         "var(--paper-mute)",
                margin:        "4px 0 0",
              }}
            >
              {firstName ? `${firstName}'s Verdict` : "The Verdict"}
            </p>
          </div>
        </div>

        {/* Sub-ratings stripe */}
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap:                 8,
          }}
        >
          <SubRatingCell label="Draw"   val={drawRating         ?? 0} />
          <SubRatingCell label="Burn"   val={burnRating         ?? 0} />
          <SubRatingCell label="Build"  val={constructionRating ?? 0} />
          <SubRatingCell label="Flavor" val={flavorRating       ?? 0} />
        </div>

        {/* Photo strip */}
        {/* The card maxes out around 600px wide; pass that as the
            optimizer's sizes hint so it picks a variant matched to
            the rendered cell rather than the full viewport. */}
        <PhotoStrip
          urls={photoUrls}
          onPhotoClick={onPhotoClick}
          sizesHint="(max-width: 640px) 100vw, 600px"
        />

        {/* Thirds — above the pull-quote when toggle was on AND ≥ 1
            phase has content. Empty thirds within an enabled set
            render as an em dash so the structure stays visible. */}
        {showThirds && (
          <div
            style={{
              marginTop:  28,
              paddingTop: 22,
              borderTop:  "1px dashed var(--line-soft)",
            }}
          >
            {([
              ["First Third · Beginning", thirdBeginning],
              ["Second Third · Middle",   thirdMiddle],
              ["Final Third · End",       thirdEnd],
            ] as const).map(([tag, text]) => {
              const t = text?.trim() ?? "";
              return (
                <div key={tag} style={{ marginBottom: 14 }}>
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
                    {tag}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-serif)",
                      fontStyle:  "italic",
                      fontSize:   17,
                      lineHeight: 1.4,
                      color:      t ? "var(--foreground)" : "var(--paper-dim)",
                      margin:     "4px 0 0",
                      whiteSpace: "pre-line",
                    }}
                  >
                    {t || "—"}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Pull-quote review */}
        {review && (
          <div style={{ position: "relative", marginTop: 28, paddingTop: 12 }}>
            <span
              aria-hidden="true"
              style={{
                position:      "absolute",
                top:           -6,
                left:          -2,
                fontFamily:    "var(--font-serif)",
                fontStyle:     "italic",
                fontSize:      "3em",
                lineHeight:    1,
                color:         "var(--gold)",
                opacity:       0.85,
                pointerEvents: "none",
              }}
            >
              &ldquo;
            </span>
            <p
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle:  "italic",
                fontSize:   17,
                lineHeight: 1.5,
                color:      "var(--foreground)",
                margin:     "0 0 0 24px",
                whiteSpace: "pre-line",
              }}
            >
              {review}
            </p>
            {(firstName || cityUpper) && (
              <div style={{ marginTop: 14, marginLeft: 24, display: "flex", alignItems: "center", gap: 10 }}>
                <span aria-hidden="true" style={{ width: 20, height: 1, background: "var(--gold-deep)", flexShrink: 0 }} />
                <p
                  style={{
                    fontFamily:    "var(--font-mono)",
                    fontSize:      10,
                    fontWeight:    500,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color:         "var(--paper-mute)",
                    margin:        0,
                  }}
                >
                  {[firstName, cityUpper].filter(Boolean).join(" · ")}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Specs strip */}
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap:                 8,
            marginTop:           28,
            paddingTop:          18,
            borderTop:           "1px solid var(--line-soft)",
          }}
        >
          <SpecCell
            label="Duration"
            value={
              smokeDurationMinutes != null && String(smokeDurationMinutes).trim()
                ? `${smokeDurationMinutes} min`
                : "—"
            }
          />
          <SpecCell label="Pairing"  value={pairingDrink?.trim() || "—"} />
          <SpecCell label="Occasion" value={occasion?.trim()     || "—"} />
        </div>
      </article>

      {/* Flavor profile italic line — gold middots. Real text whitespace
          gives the browser line-break opportunities; CSS margin on
          inline elements does not. */}
      {flavorTagNames.length > 0 && (
        <p
          style={{
            fontFamily:   "var(--font-serif)",
            fontStyle:    "italic",
            fontSize:     17,
            lineHeight:   1.5,
            color:        "var(--paper-mute)",
            textAlign:    "center",
            margin:       "22px 0 0",
            padding:      "0 12px",
            overflowWrap: "anywhere",
          }}
        >
          {flavorTagNames.map((name, i) => (
            <span key={name}>
              {name.toLowerCase()}
              {i < flavorTagNames.length - 1 && (
                <>
                  {" "}
                  <span style={{ color: "var(--gold)" }}>·</span>
                  {" "}
                </>
              )}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
