"use client";

import { useEffect } from "react";
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
    num:       "01",
    kicker:    "The Origin",
    title:     "A Brief History of the Cigar",
    goldWord:  "History",
    deck:      "Five centuries of cultivation, colonialism, and craft, told through the leaf, the lector, and the long road from Guanahani to your humidor.",
    readTime:  "8 min read",
  },
  {
    num:       "02",
    kicker:    "The Leaf",
    title:     "The Tobaccos & Their Lands",
    goldWord:  "Their Lands",
    deck:      "From the volcanic soil of Nicaragua to the shade-grown fields of Connecticut, the leaf is the cigar. An atlas of what grows where, and why it matters.",
    readTime:  "11 min read",
  },
  {
    num:       "03",
    kicker:    "The Vitola",
    title:     "Shapes, Sizes & The Vitolas",
    goldWord:  "The Vitolas",
    deck:      "A primer on ring gauge, length, and the named formats that every serious smoker eventually learns to order by heart.",
    readTime:  "9 min read",
  },
  {
    num:       "04",
    kicker:    "The Cut",
    title:     "The Three Cuts",
    goldWord:  "Cuts",
    deck:      "A study of the only three openings worth making at the head of a fine cigar, and what each one does to the smoke that follows.",
    readTime:  "4 min read",
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

export function FieldGuideModal({
  volNumber,
  onClose,
}: {
  volNumber: number;
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const vol     = VOLS[volNumber - 1];
  const Content = CONTENTS[volNumber - 1];

  return (
    <>
      <style>{`
        @keyframes fg-slide-up {
          from { transform: translateY(6%); opacity: 0; }
          to   { transform: translateY(0);  opacity: 1; }
        }
        .fg-modal-enter {
          animation: fg-slide-up 0.28s cubic-bezier(0.32, 0, 0.28, 1) both;
        }
      `}</style>

      <div
        className="fg-modal-enter"
        style={{
          position:        "fixed",
          inset:           0,
          zIndex:          100,
          background:      "var(--background)",
          display:         "flex",
          flexDirection:   "column",
          overflowY:       "hidden",
        }}
      >
        {/* ── Fixed header ── */}
        <div
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            padding:        "0 16px",
            height:         52,
            flexShrink:     0,
            borderBottom:   "1px solid rgba(212,160,74,0.15)",
            background:     "var(--background)",
          }}
        >
          <button
            onClick={onClose}
            style={{
              display:    "flex",
              alignItems: "center",
              gap:        8,
              background: "none",
              border:     "none",
              padding:    "8px 0",
              cursor:     "pointer",
              fontFamily: S.serif,
              fontStyle:  "italic",
              fontSize:   15,
              color:      S.gold,
            }}
          >
            &#8592; The Field Guide
          </button>
          <span
            style={{
              fontFamily:    S.sans,
              fontSize:      10.5,
              fontWeight:    600,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color:         S.fg3,
            }}
          >
            VOL. {vol.num}
          </span>
        </div>

        {/* ── Scrollable body ── */}
        <div
          style={{
            flex:      1,
            overflowY: "auto",
          }}
        >
          {/* Masthead */}
          <div
            style={{
              padding:      "36px 20px 28px",
              borderBottom: "1px solid rgba(212,160,74,0.12)",
            }}
          >
            {/* Eyebrow */}
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

            {/* Title */}
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

            {/* Deck */}
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

            {/* Meta */}
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
              padding:       "32px 20px",
              paddingBottom: "max(40px, env(safe-area-inset-bottom, 40px))",
            }}
          >
            <Content />
          </div>
        </div>
      </div>
    </>
  );
}
