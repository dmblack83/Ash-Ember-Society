"use client";

/* ------------------------------------------------------------------
   Masthead

   Newspaper-style greeting at the top of the home dashboard. In-flow
   (not fixed) — replaces the previous WelcomeSection sticky header.

   - Top hairline gold rule.
   - Time-of-day greeting (Date().getHours()) with italic gold name.
   - Italic kicker copy that varies by part of day.
   - Optional ADMIN link top-right (only shown when isAdmin = true).
   ------------------------------------------------------------------ */

import Link from "next/link";

interface Props {
  displayName: string;
  isAdmin?:    boolean;
}

function partOfDay(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return "morning";
  if (h >= 12 && h < 18) return "afternoon";
  return "evening";
}

const COPY = {
  morning:   { hi: "Good morning",   sub: "A still morning for a slow start." },
  afternoon: { hi: "Good afternoon", sub: "A long afternoon for a longer ash." },
  evening:   { hi: "Good evening",   sub: "A quiet night for a slow burn." },
} as const;

export function Masthead({ displayName, isAdmin = false }: Props) {
  const part = partOfDay();
  const c    = COPY[part];

  return (
    <header
      className="animate-fade-in"
      style={{
        position:     "relative",
        padding:      "16px 4px 22px",
        borderBottom: "1px solid var(--line)",
      }}
      aria-label="Welcome"
    >
      {/* Top hairline rule (gold @ 50% opacity) */}
      <div
        aria-hidden="true"
        style={{
          height:     1,
          background: "var(--gold)",
          opacity:    0.5,
          marginBottom: 14,
        }}
      />

      {/* Optional admin link, top-right */}
      {isAdmin && (
        <Link
          href="/admin"
          prefetch={false}
          style={{
            position:      "absolute",
            top:           18,
            right:         4,
            fontFamily:    "var(--font-mono)",
            fontSize:      10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color:         "var(--gold)",
            textDecoration: "none",
          }}
        >
          Admin →
        </Link>
      )}

      <h1
        suppressHydrationWarning
        style={{
          fontFamily:    "var(--font-serif)",
          fontWeight:    500,
          fontSize:      "clamp(32px, 8vw, 40px)",
          lineHeight:    0.98,
          letterSpacing: "-0.015em",
          color:         "var(--foreground)",
          margin:        0,
          textWrap:      "pretty" as React.CSSProperties["textWrap"],
        }}
      >
        {c.hi},
        <em
          style={{
            display:    "block",
            fontStyle:  "italic",
            color:      "var(--gold)",
            fontWeight: 500,
            marginTop:  4,
          }}
        >
          {displayName}.
        </em>
        <span
          suppressHydrationWarning
          style={{
            display:    "block",
            fontSize:   "clamp(15px, 4vw, 18px)",
            fontStyle:  "italic",
            color:      "var(--paper-mute)",
            fontWeight: 400,
            marginTop:  12,
            letterSpacing: 0,
          }}
        >
          {c.sub}
        </span>
      </h1>
    </header>
  );
}
