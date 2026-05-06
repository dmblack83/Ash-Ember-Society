import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------
   Shared design tokens (inline — no new CSS files)
   ------------------------------------------------------------------ */

const S = {
  serif: "'Playfair Display', Georgia, serif",
  sans:  "Inter, system-ui, sans-serif",
  gold:  "var(--gold)",
  ember: "var(--ember)",
  fg1:   "var(--foreground)",
  fg2:   "var(--muted-foreground)",
  fg3:   "rgba(166,144,128,0.75)",
} as const;

/* ------------------------------------------------------------------
   Em — gold italic span
   ------------------------------------------------------------------ */
export function Em({ children }: { children: ReactNode }) {
  return (
    <em style={{ color: "var(--gold)", fontStyle: "italic" }}>{children}</em>
  );
}

/* ------------------------------------------------------------------
   SectionHeading — serif h2 with optional gold em parts
   Usage: <SectionHeading>The Beach at <Em>Guanahaní</Em></SectionHeading>
   ------------------------------------------------------------------ */
export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        fontFamily:    S.serif,
        fontWeight:    600,
        fontSize:      30,
        lineHeight:    1.15,
        letterSpacing: "-0.01em",
        margin:        "56px 0 22px",
        color:         S.fg1,
      }}
    >
      {children}
    </h2>
  );
}

/* ------------------------------------------------------------------
   SectionRule — centered § with gold rules
   ------------------------------------------------------------------ */
export function SectionRule() {
  return (
    <div
      style={{
        display:        "flex",
        justifyContent: "center",
        alignItems:     "center",
        gap:            14,
        margin:         "48px 0",
        fontFamily:     S.serif,
        fontStyle:      "italic",
        color:          S.gold,
        fontSize:       14,
      }}
    >
      <span
        style={{
          flex:       "0 0 70px",
          height:     1,
          background: "rgba(212,160,74,0.35)",
          display:    "block",
        }}
      />
      §
      <span
        style={{
          flex:       "0 0 70px",
          height:     1,
          background: "rgba(212,160,74,0.35)",
          display:    "block",
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------
   PullQuote — italic serif block quote with decorative marks
   ------------------------------------------------------------------ */
export function PullQuote({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        margin:       "44px 0",
        padding:      "36px 52px",
        borderTop:    "1px solid rgba(212,160,74,0.28)",
        borderBottom: "1px solid rgba(212,160,74,0.28)",
        fontFamily:   S.serif,
        fontStyle:    "italic",
        fontSize:     24,
        lineHeight:   1.4,
        color:        S.fg1,
        textAlign:    "center",
        position:     "relative",
      }}
    >
      <span
        aria-hidden
        style={{
          position:   "absolute",
          top:        4,
          left:       14,
          fontFamily: S.serif,
          fontSize:   64,
          color:      S.gold,
          lineHeight: 1,
          opacity:    0.6,
        }}
      >
        &#8220;
      </span>
      {children}
      <span
        aria-hidden
        style={{
          position:   "absolute",
          bottom:     -22,
          right:      14,
          fontFamily: S.serif,
          fontSize:   64,
          color:      S.gold,
          lineHeight: 1,
          opacity:    0.6,
        }}
      >
        &#8221;
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------
   Closer — centered "· finis ·"
   ------------------------------------------------------------------ */
export function Closer() {
  return (
    <div
      style={{
        textAlign:     "center",
        marginTop:     56,
        fontFamily:    S.serif,
        fontStyle:     "italic",
        fontSize:      22,
        color:         S.gold,
        letterSpacing: "0.05em",
      }}
    >
      <span style={{ color: S.fg3, margin: "0 12px" }}>·</span>
      finis
      <span style={{ color: S.fg3, margin: "0 12px" }}>·</span>
    </div>
  );
}

/* ------------------------------------------------------------------
   Colophon — footer with logo + label
   ------------------------------------------------------------------ */
function Colophon({ volLabel }: { volLabel: string }) {
  return (
    <footer
      style={{
        marginTop:     64,
        paddingTop:    24,
        borderTop:     "1px solid rgba(212,160,74,0.18)",
        display:       "flex",
        justifyContent:"space-between",
        alignItems:    "center",
        fontFamily:    S.sans,
        fontSize:      11,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color:         S.fg3,
        flexWrap:      "wrap",
        gap:           10,
      }}
    >
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <Image
          src="/Circle Logo.png"
          alt=""
          width={22}
          height={22}
          sizes="22px"
          quality={75}
          style={{ opacity: 0.7 }}
        />
        <span>Ash &amp; Ember Society</span>
      </div>
      <div>{volLabel}</div>
    </footer>
  );
}

/* ------------------------------------------------------------------
   ArticleShell — page wrapper
   ------------------------------------------------------------------ */
export function ArticleShell({
  volNumber,
  volLabel,
  eyebrow,
  kicker,
  title,
  deck,
  meta,
  children,
  mastheadStyle,
}: {
  volNumber: string;
  volLabel:  string;
  eyebrow:   string;
  kicker:    string;
  title:     ReactNode;
  deck:      string;
  meta:      ReactNode;
  children:  ReactNode;
  mastheadStyle?: "default" | "bordered";
}) {
  const isBordered = mastheadStyle === "bordered";

  return (
    <div
      style={{
        background:      "var(--background)",
        minHeight:       "100vh",
        backgroundImage: "radial-gradient(ellipse 60% 30% at 50% 0%, rgba(193,120,23,0.10), transparent 70%)",
      }}
    >
      <div
        style={{
          maxWidth: 760,
          margin:   "0 auto",
          padding:  "56px 24px 88px",
        }}
      >
        {/* Topbar */}
        <div
          style={{
            display:        "flex",
            justifyContent: "space-between",
            alignItems:     "center",
            marginBottom:   56,
            fontFamily:     S.sans,
            fontSize:       11,
            letterSpacing:  "0.14em",
            textTransform:  "uppercase",
            color:          S.fg3,
          }}
        >
          <Link
            href="/home"
            style={{
              color:          "var(--muted-foreground)",
              textDecoration: "none",
            }}
          >
            &larr; The Field Guide
          </Link>
          <span style={{ color: S.gold }}>{volNumber}</span>
        </div>

        {/* Masthead */}
        {isBordered ? (
          <header
            style={{
              textAlign:    "center",
              borderTop:    "1px solid rgba(212,160,74,0.28)",
              borderBottom: "1px solid rgba(212,160,74,0.28)",
              padding:      "28px 0 32px",
              position:     "relative",
              marginBottom: 44,
            }}
          >
            {/* Gold dots on borders */}
            <span
              aria-hidden
              style={{
                position:    "absolute",
                top:         -3.5,
                left:        "50%",
                transform:   "translateX(-50%)",
                width:       6,
                height:      6,
                background:  "var(--gold)",
                borderRadius:"50%",
                display:     "block",
                boxShadow:   "0 0 12px rgba(212,160,74,0.55)",
              }}
            />
            <span
              aria-hidden
              style={{
                position:    "absolute",
                bottom:      -3.5,
                left:        "50%",
                transform:   "translateX(-50%)",
                width:       6,
                height:      6,
                background:  "var(--gold)",
                borderRadius:"50%",
                display:     "block",
                boxShadow:   "0 0 12px rgba(212,160,74,0.55)",
              }}
            />
            <div
              style={{
                fontFamily:    S.sans,
                fontSize:      11,
                fontWeight:    500,
                textTransform: "uppercase",
                letterSpacing: "0.42em",
                color:         "var(--muted-foreground)",
                marginBottom:  18,
                display:       "flex",
                alignItems:    "center",
                justifyContent:"center",
                gap:           14,
              }}
            >
              <span style={{ width: 36, height: 1, background: "rgba(166,144,128,0.5)", display:"block" }} />
              {eyebrow}
              <span style={{ width: 36, height: 1, background: "rgba(166,144,128,0.5)", display:"block" }} />
            </div>
            <div
              style={{
                fontFamily:    S.sans,
                fontSize:      11,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color:         S.ember,
                marginBottom:  14,
              }}
            >
              {kicker}
            </div>
            <h1
              style={{
                fontFamily:    S.serif,
                fontWeight:    800,
                fontSize:      "clamp(44px, 7vw, 72px)",
                lineHeight:    0.98,
                letterSpacing: "-0.02em",
                margin:        0,
                color:         S.fg1,
              }}
            >
              {title}
            </h1>
            <p
              style={{
                fontFamily: S.serif,
                fontStyle:  "italic",
                fontWeight: 400,
                fontSize:   17,
                color:      "var(--muted-foreground)",
                margin:     "14px auto 0",
                maxWidth:   560,
                lineHeight: 1.55,
              }}
            >
              {deck}
            </p>
            <div
              style={{
                display:        "flex",
                justifyContent: "center",
                gap:            22,
                marginTop:      22,
                fontSize:       10.5,
                textTransform:  "uppercase",
                letterSpacing:  "0.3em",
                color:          S.fg3,
                flexWrap:       "wrap",
              }}
            >
              {meta}
            </div>
          </header>
        ) : (
          <header style={{ marginBottom: 0 }}>
            <div
              style={{
                display:        "flex",
                alignItems:     "center",
                gap:            14,
                justifyContent: "center",
                margin:         "0 0 24px",
                fontFamily:     S.sans,
                fontSize:       11,
                letterSpacing:  "0.14em",
                textTransform:  "uppercase",
                color:          S.gold,
              }}
            >
              <span
                style={{
                  flex:       "0 0 80px",
                  height:     1,
                  background: "linear-gradient(90deg, transparent, var(--gold), transparent)",
                  display:    "block",
                }}
              />
              {eyebrow}
              <span
                style={{
                  flex:       "0 0 80px",
                  height:     1,
                  background: "linear-gradient(90deg, transparent, var(--gold), transparent)",
                  display:    "block",
                }}
              />
            </div>
            <div
              style={{
                textAlign:     "center",
                fontFamily:    S.sans,
                fontSize:      10.5,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color:         S.ember,
                marginBottom:  18,
              }}
            >
              {kicker}
            </div>
            <h1
              style={{
                fontFamily:    S.serif,
                fontWeight:    700,
                fontSize:      "clamp(40px, 6vw, 64px)",
                lineHeight:    1,
                letterSpacing: "-0.02em",
                textAlign:     "center",
                margin:        0,
                color:         S.fg1,
              }}
            >
              {title}
            </h1>
            <p
              style={{
                textAlign:  "center",
                fontFamily: S.serif,
                fontStyle:  "italic",
                fontSize:   19,
                color:      "var(--muted-foreground)",
                margin:     "22px auto 0",
                maxWidth:   540,
                lineHeight: 1.45,
              }}
            >
              {deck}
            </p>
            <div
              style={{
                display:        "flex",
                justifyContent: "center",
                gap:            28,
                margin:         "36px 0 56px",
                fontFamily:     S.sans,
                fontSize:       11,
                letterSpacing:  "0.14em",
                textTransform:  "uppercase",
                color:          S.fg3,
                flexWrap:       "wrap",
              }}
            >
              {meta}
            </div>
          </header>
        )}

        {/* Article body */}
        <article
          style={{
            fontFamily: S.sans,
          }}
        >
          {children}
        </article>

        <Colophon volLabel={volLabel} />
      </div>
    </div>
  );
}
