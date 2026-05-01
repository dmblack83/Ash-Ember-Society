"use client";

import { useRouter } from "next/navigation";

/* ------------------------------------------------------------------
   TonightsPairing

   Replaces the old QuickActions row. Bordered card with a 165° gradient
   and a radial highlight in the top-right corner. Eyebrow rule + italic
   serif title + two side-by-side primary buttons (Burn Report / Add Cigar).
   ------------------------------------------------------------------ */

function PlusIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <path
        d="M5.5 1.5v8M1.5 5.5h8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

const baseBtnStyle: React.CSSProperties = {
  flex:                    1,
  display:                 "inline-flex",
  alignItems:              "center",
  justifyContent:          "center",
  gap:                     8,
  fontFamily:              "var(--font-mono)",
  fontSize:                11,
  fontWeight:              600,
  letterSpacing:           "0.2em",
  textTransform:           "uppercase",
  padding:                 "12px 14px",
  borderRadius:            4,
  cursor:                  "pointer",
  touchAction:             "manipulation",
  WebkitTapHighlightColor: "transparent",
  transition:              "filter 200ms ease, background 200ms ease",
  border:                  "none",
  minHeight:               44,
};

export function TonightsPairing() {
  const router = useRouter();

  return (
    <section
      style={{
        position:     "relative",
        border:       "1px solid var(--line)",
        borderRadius: 6,
        background:   "linear-gradient(165deg, #2a1f15 0%, #1a130c 100%)",
        padding:      "20px 22px 18px",
        overflow:     "hidden",
      }}
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
        }}
      >
        Tonight
        <span
          aria-hidden="true"
          style={{ flex: 1, height: 1, background: "var(--line)" }}
        />
      </div>

      {/* Italic title */}
      <h2
        style={{
          fontFamily:    "var(--font-serif)",
          fontStyle:     "italic",
          fontWeight:    500,
          fontSize:      "clamp(20px, 5vw, 26px)",
          lineHeight:    1.05,
          color:         "var(--foreground)",
          margin:        "0 0 16px",
        }}
      >
        Begin a new burn, or shelve a fresh acquisition.
      </h2>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, position: "relative", zIndex: 1 }}>
        <button
          type="button"
          onClick={() => router.push("/humidor")}
          style={{
            ...baseBtnStyle,
            background: "linear-gradient(180deg, #e1c787 0%, #b89549 100%)",
            color:      "#1a1208",
          }}
          aria-label="New Burn Report"
        >
          <PlusIcon />
          Burn Report
        </button>
        <button
          type="button"
          onClick={() => router.push("/humidor?add=true")}
          style={{
            ...baseBtnStyle,
            background: "transparent",
            color:      "var(--foreground)",
            border:     "1px solid var(--line-strong)",
          }}
          aria-label="Add Cigar"
        >
          <PlusIcon />
          Add Cigar
        </button>
      </div>
    </section>
  );
}
