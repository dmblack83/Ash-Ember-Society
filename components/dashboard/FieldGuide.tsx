"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

/* FieldGuideModal (302 lines) only mounts when the user opens a vol.
   Conditional render at the call site means the chunk fetches only
   on first open. */
const FieldGuideModal = dynamic(
  () => import("@/components/field-guide/FieldGuideModal").then((m) => ({ default: m.FieldGuideModal })),
  { ssr: false },
);

/* ------------------------------------------------------------------
   FieldGuide

   Bordered card with a gold page-corner fold. Single eyebrow rule +
   italic serif title + four secondary buttons that each open the
   respective volume modal in place.

   Replaces the old expandable card with the per-volume detail rows;
   that detail UX still lives inside FieldGuideModal once a volume is
   opened.
   ------------------------------------------------------------------ */

const VOLUMES = [1, 2, 3, 4] as const;

const buttonStyle: React.CSSProperties = {
  flex:                    "1 1 0",
  minWidth:                0,
  display:                 "inline-flex",
  alignItems:              "center",
  justifyContent:          "center",
  fontFamily:              "var(--font-mono)",
  fontSize:                10,
  fontWeight:              600,
  letterSpacing:           "0.14em",
  textTransform:           "uppercase",
  padding:                 "11px 6px",
  borderRadius:            3,
  background:              "transparent",
  color:                   "var(--foreground)",
  border:                  "1px solid var(--line-strong)",
  cursor:                  "pointer",
  touchAction:             "manipulation",
  WebkitTapHighlightColor: "transparent",
  transition:              "background 200ms ease, border-color 200ms ease",
  minHeight:               44,
  whiteSpace:              "nowrap",
};

export function FieldGuide() {
  const [activeVol, setActiveVol] = useState<number | null>(null);

  return (
    <section
      className="animate-fade-in"
      style={{
        position:     "relative",
        border:       "1px solid var(--line)",
        borderRadius: 6,
        background:
          "radial-gradient(ellipse at 100% 0%, rgba(212,160,74,0.12), transparent 60%), " +
          "linear-gradient(180deg, #221911 0%, #16100a 100%)",
        padding:      "26px 22px 22px",
        overflow:     "hidden",
      }}
    >
      {/* Page-corner fold (top-right gold triangle) */}
      <span
        aria-hidden="true"
        style={{
          position:    "absolute",
          top:         0,
          right:       0,
          width:       0,
          height:      0,
          borderStyle: "solid",
          borderWidth: "0 28px 28px 0",
          borderColor: "transparent var(--gold) transparent transparent",
          opacity:     0.55,
        }}
      />

      {/* Eyebrow with leading rule */}
      <div
        style={{
          fontFamily:    "var(--font-mono)",
          fontSize:      10,
          letterSpacing: "0.32em",
          textTransform: "uppercase",
          color:         "var(--gold)",
          display:       "flex",
          alignItems:    "center",
          gap:           10,
          marginBottom:  10,
        }}
      >
        <span aria-hidden="true" style={{ width: 18, height: 1, background: "var(--gold)" }} />
        Library &middot; Est. MMXXII
      </div>

      {/* Title */}
      <h2
        style={{
          fontFamily:    "var(--font-serif)",
          fontWeight:    500,
          fontSize:      "clamp(28px, 7vw, 38px)",
          lineHeight:    0.98,
          letterSpacing: "-0.01em",
          color:         "var(--foreground)",
          margin:        "0 0 10px",
        }}
      >
        The{" "}
        <em style={{ fontStyle: "italic", color: "var(--gold)" }}>Field</em>{" "}
        Guide.
      </h2>

      {/* Sub */}
      <p
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle:  "italic",
          fontSize:   14,
          color:      "var(--paper-mute)",
          margin:     "0 0 18px",
          lineHeight: 1.4,
        }}
      >
        A standing reference for the curious smoker.
      </p>

      {/* Volume buttons */}
      <div style={{ display: "flex", gap: 6, flexWrap: "nowrap" }}>
        {VOLUMES.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setActiveVol(v)}
            style={buttonStyle}
            aria-label={`Open Field Guide Volume ${v}`}
          >
            Vol. {v}
          </button>
        ))}
      </div>

      {/* Article modal */}
      {activeVol !== null && (
        <FieldGuideModal
          volNumber={activeVol}
          onClose={() => setActiveVol(null)}
        />
      )}
    </section>
  );
}
