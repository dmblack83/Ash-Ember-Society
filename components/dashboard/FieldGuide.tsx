import Link from "next/link";
import { DashboardSection } from "@/components/dashboard/dashboard-section";

/* ------------------------------------------------------------------
   Volume data
   Each entry drives one row. href points to future article pages.
   ------------------------------------------------------------------ */

const VOLUMES = [
  {
    num:      "01",
    kicker:   "The Origin",
    before:   "A Brief ",
    em:       "History",
    after:    " of the Cigar",
    readTime: "8 min read",
    href:     "/discover/field-guide/vol-01",
  },
  {
    num:      "02",
    kicker:   "The Leaf",
    before:   "The Tobaccos & ",
    em:       "Their Lands",
    after:    "",
    readTime: "11 min read",
    href:     "/discover/field-guide/vol-02",
  },
  {
    num:      "03",
    kicker:   "The Vitola",
    before:   "Shapes, Sizes & ",
    em:       "The Vitolas",
    after:    "",
    readTime: "9 min read",
    href:     "/discover/field-guide/vol-03",
  },
  {
    num:      "04",
    kicker:   "The Cut",
    before:   "The ",
    em:       "Three",
    after:    " Cuts",
    readTime: "4 min read",
    href:     "/discover/field-guide/vol-04",
  },
] as const;

/* ------------------------------------------------------------------
   FieldGuide
   Server component. No props needed — content is static.
   ------------------------------------------------------------------ */

export function FieldGuide() {
  return (
    <DashboardSection title="The Field Guide" sectionIndex={5}>
      <div
        style={{
          background:   "var(--card)",
          border:       "1px solid rgba(212,160,74,0.12)",
          borderRadius: 16,
          overflow:     "hidden",
        }}
      >
        {/* Lede */}
        <p
          style={{
            padding:    "20px 20px 0",
            margin:     0,
            fontFamily: "var(--font-serif)",
            fontStyle:  "italic",
            fontSize:   14,
            lineHeight: 1.65,
            color:      "var(--muted-foreground)",
          }}
        >
          Some objects ask nothing of you. A cigar asks for an hour, a cut,
          a flame, and a small willingness to slow down. These pages are for
          the rest of it.
        </p>

        {/* Section label: "The Volumes  ——  i — iv" */}
        <div
          style={{
            display:       "flex",
            alignItems:    "center",
            gap:           12,
            padding:       "16px 20px 0",
            fontFamily:    "var(--font-sans)",
            fontSize:      10,
            letterSpacing: "0.2em",
            textTransform: "uppercase" as const,
            color:         "var(--muted-foreground)",
          }}
        >
          <span>The Volumes</span>
          <span
            style={{
              flex:       1,
              height:     1,
              background: "rgba(212,160,74,0.20)",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily:    "var(--font-serif)",
              fontStyle:     "italic",
              fontSize:      12,
              color:         "var(--gold)",
              textTransform: "lowercase" as const,
              letterSpacing: 0,
            }}
          >
            i &mdash; iv
          </span>
        </div>

        {/* Volume rows */}
        <nav aria-label="Field guide volumes">
          {VOLUMES.map((vol) => (
            <Link
              key={vol.num}
              href={vol.href}
              className="group flex items-center gap-4 hover:bg-[rgba(212,160,74,0.04)] transition-colors duration-200"
              style={{
                padding:        "18px 20px",
                borderTop:      "1px solid rgba(212,160,74,0.12)",
                textDecoration: "none",
                color:          "inherit",
              }}
            >
              {/* Volume number — large italic serif */}
              <div
                style={{
                  width:      52,
                  flexShrink: 0,
                  fontFamily: "var(--font-serif)",
                  fontStyle:  "italic",
                  fontSize:   42,
                  lineHeight: 1,
                  color:      "var(--fg3)",
                }}
              >
                <em className="not-italic text-[var(--gold)] group-hover:text-[var(--ember)] transition-colors duration-200">
                  {vol.num}
                </em>
              </div>

              {/* Volume title + kicker */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily:    "var(--font-sans)",
                    fontSize:      10,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase" as const,
                    color:         "var(--ember)",
                    marginBottom:  5,
                  }}
                >
                  {vol.kicker}
                </div>
                <div
                  style={{
                    fontFamily:    "var(--font-serif)",
                    fontWeight:    600,
                    fontSize:      20,
                    lineHeight:    1.1,
                    letterSpacing: "-0.01em",
                    color:         "var(--foreground)",
                  }}
                >
                  {vol.before}
                  <em
                    style={{
                      fontStyle:  "italic",
                      color:      "var(--gold)",
                      fontWeight: 400,
                    }}
                  >
                    {vol.em}
                  </em>
                  {vol.after}
                </div>
              </div>

              {/* Read time + arrow — hidden on narrow screens */}
              <div className="hidden sm:flex flex-col items-end gap-1.5">
                <span
                  style={{
                    fontFamily:    "var(--font-sans)",
                    fontSize:      10,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase" as const,
                    color:         "var(--fg3)",
                    whiteSpace:    "nowrap",
                  }}
                >
                  {vol.readTime}
                </span>
                <span
                  className="text-[var(--gold)] group-hover:text-[var(--ember)] group-hover:translate-x-1 transition-all duration-200 inline-block"
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize:   22,
                    lineHeight: 1,
                  }}
                >
                  &rarr;
                </span>
              </div>
            </Link>
          ))}
        </nav>
      </div>
    </DashboardSection>
  );
}
