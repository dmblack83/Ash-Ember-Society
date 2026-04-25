"use client";

import { useState } from "react";

/* ------------------------------------------------------------------
   Accordion card — same pattern as Partners page
   ------------------------------------------------------------------ */

function AccordionCard({ title }: { title: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        backgroundColor: "var(--card)",
        borderRadius:    12,
        border:          "1px solid rgba(255,255,255,0.06)",
        overflow:        "hidden",
      }}
    >
      {/* Header row */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width:          "100%",
          padding:        "18px 20px",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          gap:            12,
          background:     "transparent",
          border:         "none",
          cursor:         "pointer",
          textAlign:      "left",
          WebkitTapHighlightColor: "transparent",
        }}
        aria-expanded={open}
      >
        <span
          style={{
            color:      "var(--foreground)",
            fontSize:   16,
            fontWeight: 600,
            fontFamily: "var(--font-playfair, 'Playfair Display'), serif",
          }}
        >
          {title}
        </span>

        {/* Chevron */}
        <svg
          width="18" height="18" viewBox="0 0 18 18" fill="none"
          aria-hidden="true"
          style={{
            flexShrink: 0,
            color:      "var(--muted-foreground)",
            transform:  open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.22s ease",
          }}
        >
          <path
            d="M4.5 6.75L9 11.25L13.5 6.75"
            stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Expanded body */}
      {open && (
        <div
          style={{
            padding:        "4px 20px 28px",
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            gap:            10,
            borderTop:      "1px solid rgba(255,255,255,0.05)",
          }}
        >
          {/* Clock icon */}
          <div
            style={{
              width:           44,
              height:          44,
              borderRadius:    "50%",
              backgroundColor: "rgba(193,120,23,0.12)",
              display:         "flex",
              alignItems:      "center",
              justifyContent:  "center",
              marginTop:       20,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="10" cy="10" r="7.5" stroke="#C17817" strokeWidth="1.5"/>
              <path
                d="M10 6.5V10.5L12.5 12"
                stroke="#C17817" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          </div>

          <span
            style={{
              color:         "var(--primary)",
              fontSize:      14,
              fontWeight:    600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Coming Soon
          </span>

          <span
            style={{
              color:      "var(--muted-foreground)",
              fontSize:   13,
              textAlign:  "center",
              lineHeight: 1.6,
              maxWidth:   260,
            }}
          >
            This section is in development. Check back soon.
          </span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Content page
   ------------------------------------------------------------------ */

export default function ContentPage() {
  return (
    <div style={{ padding: "24px 16px 32px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Section header */}
      <div style={{ marginBottom: 8 }}>
        <h1
          style={{
            fontSize:   22,
            fontWeight: 700,
            fontFamily: "var(--font-playfair, 'Playfair Display'), serif",
            color:      "var(--foreground)",
            margin:     0,
          }}
        >
          Content
        </h1>
        <p
          style={{
            fontSize:  14,
            color:     "var(--muted-foreground)",
            marginTop: 6,
            lineHeight: 1.5,
          }}
        >
          Videos and product reviews curated for the aficionado.
        </p>
      </div>

      <AccordionCard title="Videos" />
      <AccordionCard title="Product Reviews" />
    </div>
  );
}
