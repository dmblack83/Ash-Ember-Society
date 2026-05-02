"use client";

/* ------------------------------------------------------------------
   Masthead

   Newspaper-style greeting at the top of the home dashboard.

   Implementation: a `position: fixed` overlay layered over an
   invisible spacer that occupies the same layout space. This is
   stricter than `position: sticky`, which on iOS drifts during the
   rubber-band overscroll bounce when the user pulls down past the
   top of the page.

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

/* Inner content shared by the spacer (in-flow, invisible) and the
   fixed overlay (visible, positioned at viewport top). Rendering the
   identical tree in both keeps the spacer's height in sync with the
   visible header without manual measurement. */
function MastheadContent({
  displayName,
  isAdmin,
  copy,
}: {
  displayName: string;
  isAdmin:     boolean;
  copy:        (typeof COPY)[keyof typeof COPY];
}) {
  return (
    <div className="px-4 sm:px-6 max-w-2xl mx-auto" style={{ position: "relative" }}>
      {/* Top hairline rule (gold @ 50% opacity) */}
      <div
        aria-hidden="true"
        style={{
          height:       1,
          background:   "var(--gold)",
          opacity:      0.5,
          marginBottom: 14,
        }}
      />

      {/* Optional admin link, top-right */}
      {isAdmin && (
        <Link
          href="/admin"
          prefetch={false}
          style={{
            position:       "absolute",
            top:            4,
            right:          16,
            fontFamily:     "var(--font-mono)",
            fontSize:       10,
            letterSpacing:  "0.22em",
            textTransform:  "uppercase",
            color:          "var(--gold)",
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
        {copy.hi},
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
            display:       "block",
            fontSize:      "clamp(15px, 4vw, 18px)",
            fontStyle:     "italic",
            color:         "var(--paper-mute)",
            fontWeight:    400,
            marginTop:     12,
            letterSpacing: 0,
          }}
        >
          {copy.sub}
        </span>
      </h1>
    </div>
  );
}

export function Masthead({ displayName, isAdmin = false }: Props) {
  const part = partOfDay();
  const c    = COPY[part];

  const sharedPad: React.CSSProperties = {
    paddingTop:    "calc(env(safe-area-inset-top) + 14px)",
    paddingBottom: 18,
  };

  return (
    <header
      className="animate-fade-in"
      style={{ position: "relative" }}
      aria-label="Welcome"
    >
      {/* Spacer — in-flow, invisible. Reserves the same vertical space
          as the fixed overlay below so page content starts beneath it. */}
      <div aria-hidden="true" style={{ ...sharedPad, visibility: "hidden", pointerEvents: "none" }}>
        <MastheadContent displayName={displayName} isAdmin={isAdmin} copy={c} />
      </div>

      {/* Fixed overlay — pinned to viewport top, immune to overscroll.
          The translate3d + isolation + high z-index combo is defensive
          against iOS PWA WebKit compositing quirks: without forcing the
          masthead onto its own GPU layer with its own stacking context,
          the cards' large gradient backgrounds were occasionally
          painting above the fixed overlay during scroll. */}
      <div
        style={{
          ...sharedPad,
          position:     "fixed",
          top:          0,
          left:         0,
          right:        0,
          zIndex:       100,
          background:   "var(--background)",
          borderBottom: "1px solid var(--line)",
          transform:    "translate3d(0, 0, 0)",
          willChange:   "transform",
          isolation:    "isolate",
        }}
      >
        <MastheadContent displayName={displayName} isAdmin={isAdmin} copy={c} />
      </div>
    </header>
  );
}
