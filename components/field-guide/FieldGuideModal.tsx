"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Vol01Content } from "@/components/field-guide/content/Vol01Content";
import { Vol02Content } from "@/components/field-guide/content/Vol02Content";
import { Vol03Content } from "@/components/field-guide/content/Vol03Content";
import { Vol04Content } from "@/components/field-guide/content/Vol04Content";

const S = {
  serif: "'Playfair Display', Georgia, serif",
  sans:  "Inter, system-ui, sans-serif",
  gold:  "var(--gold)",
  ember: "var(--ember)",
  fg1:   "var(--foreground)",
  fg2:   "var(--muted-foreground)",
  fg3:   "rgba(166,144,128,0.75)",
} as const;

const VOLS = [
  {
    num:      "01",
    kicker:   "The Origin",
    title:    "A Brief History of the Cigar",
    goldWord: "History",
    deck:     "Five centuries of cultivation, colonialism, and craft, told through the leaf, the lector, and the long road from Guanahani to your humidor.",
    readTime: "8 min read",
  },
  {
    num:      "02",
    kicker:   "The Leaf",
    title:    "The Tobaccos & Their Lands",
    goldWord: "Their Lands",
    deck:     "From the volcanic soil of Nicaragua to the shade-grown fields of Connecticut, the leaf is the cigar. An atlas of what grows where, and why it matters.",
    readTime: "11 min read",
  },
  {
    num:      "03",
    kicker:   "The Vitola",
    title:    "Shapes, Sizes & The Vitolas",
    goldWord: "The Vitolas",
    deck:     "A primer on ring gauge, length, and the named formats that every serious smoker eventually learns to order by heart.",
    readTime: "9 min read",
  },
  {
    num:      "04",
    kicker:   "The Cut",
    title:    "The Three Cuts",
    goldWord: "Cuts",
    deck:     "A study of the only three openings worth making at the head of a fine cigar, and what each one does to the smoke that follows.",
    readTime: "4 min read",
  },
] as const;

const CONTENTS = [Vol01Content, Vol02Content, Vol03Content, Vol04Content];

function TitleNode({ title, goldWord }: { title: string; goldWord: string }) {
  const idx = title.indexOf(goldWord);
  if (idx === -1) return <>{title}</>;
  return (
    <>
      {title.slice(0, idx)}
      <em style={{ fontStyle: "italic", color: S.gold, fontWeight: 400 }}>{goldWord}</em>
      {title.slice(idx + goldWord.length)}
    </>
  );
}

/* ── Heart icon ──────────────────────────────────────────────────── */
function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill={filled ? "var(--gold)" : "none"} stroke={filled ? "var(--gold)" : "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

/* ── Chat icon ───────────────────────────────────────────────────── */
function ChatIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function FieldGuideModal({
  volNumber,
  onClose,
}: {
  volNumber: number;
  onClose: () => void;
}) {
  const scrollRef         = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState(true);
  const [liked, setLiked] = useState(false);

  /* Lock body scroll */
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  /* Show/hide scroll caret based on position */
  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setCaret(el.scrollTop + el.clientHeight < el.scrollHeight - 80);
  }

  const vol     = VOLS[volNumber - 1];
  const Content = CONTENTS[volNumber - 1];

  const modal = (
    <>
      <style>{`
        @keyframes fg-slide-up {
          from { transform: translateY(6%); opacity: 0; }
          to   { transform: translateY(0);  opacity: 1; }
        }
        .fg-modal-enter { animation: fg-slide-up 0.28s cubic-bezier(0.32, 0, 0.28, 1) both; }
      `}</style>

      <div
        className="fg-modal-enter"
        style={{
          position:      "fixed",
          inset:         0,
          zIndex:        200,
          background:    "var(--background)",
          display:       "flex",
          flexDirection: "column",
          overflow:      "hidden",
        }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div
          style={{
            flexShrink:   0,
            borderBottom: "1px solid rgba(212,160,74,0.15)",
            background:   "var(--background)",
            paddingTop:   "env(safe-area-inset-top)",
          }}
        >
          {/* Three-column grid: [back] [VOL. ##] [icons] */}
          <div
            style={{
              display:             "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems:         "center",
              height:              52,
              paddingLeft:        16,
              paddingRight:       16,
            }}
          >
            {/* Left — back */}
            <button
              onClick={onClose}
              style={{
                display:    "flex",
                alignItems: "center",
                gap:        6,
                background: "none",
                border:     "none",
                padding:    "8px 0",
                cursor:     "pointer",
                fontFamily: S.serif,
                fontStyle:  "italic",
                fontSize:   15,
                color:      S.gold,
                outline:    "none",
                justifySelf: "start",
              }}
            >
              &#8592; Back
            </button>

            {/* Center — volume label */}
            <span
              style={{
                fontFamily:    S.sans,
                fontSize:      11,
                fontWeight:    700,
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                color:         S.fg3,
                justifySelf:  "center",
              }}
            >
              VOL. {vol.num}
            </span>

            {/* Right — like + comment */}
            <div
              style={{
                display:        "flex",
                alignItems:     "center",
                gap:            18,
                justifySelf:   "end",
              }}
            >
              {/* Like — toggles locally; wire to DB once table is in place */}
              <button
                onClick={() => setLiked((x) => !x)}
                aria-label={liked ? "Unlike" : "Like"}
                style={{
                  background:  "none",
                  border:      "none",
                  padding:     4,
                  cursor:      "pointer",
                  color:       liked ? S.gold : S.fg3,
                  outline:     "none",
                  lineHeight:  0,
                  transition:  "color 0.15s ease",
                }}
              >
                <HeartIcon filled={liked} />
              </button>

              {/* Comment — placeholder; see options discussion */}
              <button
                aria-label="Comments"
                style={{
                  background: "none",
                  border:     "none",
                  padding:    4,
                  cursor:     "pointer",
                  color:      S.fg3,
                  outline:    "none",
                  lineHeight: 0,
                }}
              >
                <ChatIcon />
              </button>
            </div>
          </div>
        </div>

        {/* ── Scroll area + caret overlay ────────────────────────── */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>

          {/* Scrollable content */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            style={{
              position:  "absolute",
              inset:     0,
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            {/* Width-constrained inner wrapper — matches home page max-w-2xl */}
            <div style={{ maxWidth: "42rem", margin: "0 auto", width: "100%" }}>

              {/* Masthead */}
              <div
                style={{
                  padding:      "36px 16px 28px",
                  borderBottom: "1px solid rgba(212,160,74,0.12)",
                }}
              >
                <div
                  style={{
                    fontFamily:    S.sans,
                    fontSize:      10,
                    fontWeight:    600,
                    letterSpacing: "0.32em",
                    textTransform: "uppercase",
                    color:         S.ember,
                    marginBottom:  10,
                  }}
                >
                  {vol.kicker}
                </div>

                <h1
                  style={{
                    fontFamily:    S.serif,
                    fontSize:      34,
                    fontWeight:    700,
                    lineHeight:    1.1,
                    letterSpacing: "-0.015em",
                    margin:        "0 0 14px",
                    color:         S.fg1,
                  }}
                >
                  <TitleNode title={vol.title} goldWord={vol.goldWord} />
                </h1>

                <p
                  style={{
                    fontFamily: S.serif,
                    fontStyle:  "italic",
                    fontSize:   15,
                    lineHeight: 1.65,
                    color:      S.fg2,
                    margin:     "0 0 18px",
                  }}
                >
                  {vol.deck}
                </p>

                <div
                  style={{
                    display:       "flex",
                    alignItems:    "center",
                    gap:           8,
                    fontFamily:    S.sans,
                    fontSize:      10,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    color:         S.fg3,
                  }}
                >
                  <span>Ash &amp; Ember Society</span>
                  <span style={{ color: S.ember }}>·</span>
                  <span>Field Guide</span>
                  <span style={{ color: S.ember }}>·</span>
                  <span>{vol.readTime}</span>
                </div>
              </div>

              {/* Article content */}
              <div
                style={{
                  padding:       "32px 16px",
                  paddingBottom: "max(80px, calc(env(safe-area-inset-bottom) + 60px))",
                }}
              >
                <Content />
              </div>
            </div>
          </div>

          {/* Scroll caret — fades when near bottom */}
          <div
            style={{
              position:       "absolute",
              bottom:         0,
              left:           0,
              right:          0,
              height:         80,
              background:     "linear-gradient(to bottom, transparent, var(--background) 85%)",
              display:        "flex",
              alignItems:     "flex-end",
              justifyContent: "center",
              paddingBottom:  "max(14px, env(safe-area-inset-bottom))",
              pointerEvents:  "none",
              transition:     "opacity 0.25s ease",
              opacity:        caret ? 1 : 0,
              zIndex:         1,
            }}
          >
            <span
              style={{
                fontFamily: S.serif,
                fontSize:   20,
                color:      S.gold,
                opacity:    0.7,
                lineHeight: 1,
              }}
            >
              &#8595;
            </span>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modal, document.body);
}
