"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient }    from "@/utils/supabase/client";
import { FieldGuideModal } from "@/components/field-guide/FieldGuideModal";

type VolCounts = { likes: number; comments: number };

const S = {
  serif: "'Playfair Display', Georgia, serif",
  sans:  "Inter, system-ui, sans-serif",
  gold:  "var(--gold)",
  ember: "var(--ember)",
  fg1:   "var(--foreground)",
  fg2:   "var(--muted-foreground)",
  fg3:   "rgba(166,144,128,0.75)",
} as const;

const VOLUMES = [
  { num: "01", kicker: "The Origin", before: "A Brief ",       em: "History",     after: " of the Cigar", readTime: "8 min read"  },
  { num: "02", kicker: "The Leaf",   before: "The Tobaccos & ", em: "Their Lands", after: "",              readTime: "11 min read" },
  { num: "03", kicker: "The Vitola", before: "Shapes, Sizes & ", em: "The Vitolas", after: "",             readTime: "9 min read"  },
  { num: "04", kicker: "The Cut",    before: "The ",            em: "Three",       after: " Cuts",         readTime: "4 min read"  },
] as const;

export function FieldGuide() {
  const supabase = useMemo(() => createClient(), []);

  const [expanded,  setExpanded]  = useState(false);
  const [activeVol, setActiveVol] = useState<number | null>(null);
  const [counts,    setCounts]    = useState<Record<number, VolCounts>>({});

  /* Fetch like + comment counts for all volumes on mount */
  useEffect(() => {
    let cancelled = false;
    async function fetchCounts() {
      const [likesRes, commentsRes] = await Promise.all([
        supabase.from("field_guide_likes").select("vol_number"),
        supabase.from("field_guide_comments").select("vol_number").is("parent_comment_id", null),
      ]);
      if (cancelled) return;

      const lc: Record<number, number> = {};
      for (const r of likesRes.data ?? [])    { lc[r.vol_number] = (lc[r.vol_number] ?? 0) + 1; }
      const cc: Record<number, number> = {};
      for (const r of commentsRes.data ?? []) { cc[r.vol_number] = (cc[r.vol_number] ?? 0) + 1; }

      const merged: Record<number, VolCounts> = {};
      for (let v = 1; v <= 4; v++) { merged[v] = { likes: lc[v] ?? 0, comments: cc[v] ?? 0 }; }
      setCounts(merged);
    }
    fetchCounts();
    return () => { cancelled = true; };
  }, [supabase]);

  return (
    <section
      className="animate-fade-in"
      style={{ animationDelay: "0.5s", animationFillMode: "both" }}
    >
      {/* ── Title card (always visible, tap to expand) ── */}
      <button
        onClick={() => setExpanded((x) => !x)}
        style={{
          display:      "block",
          width:        "100%",
          background:   "var(--card)",
          border:       "1px solid rgba(212,160,74,0.18)",
          borderRadius: expanded ? "16px 16px 0 0" : 16,
          padding:      "28px 24px 22px",
          textAlign:    "left",
          cursor:       "pointer",
          outline:      "none",
        }}
      >
        {/* Eyebrow with flanking rules */}
        <div
          style={{
            display:    "flex",
            alignItems: "center",
            gap:        12,
            marginBottom: 18,
          }}
        >
          <span
            style={{
              flex:       1,
              height:     1,
              background: "linear-gradient(90deg, transparent, rgba(212,160,74,0.4))",
              display:    "block",
            }}
          />
          <span
            style={{
              fontFamily:    S.sans,
              fontSize:      9.5,
              fontWeight:    600,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color:         S.gold,
              whiteSpace:    "nowrap",
            }}
          >
            Library &middot; Est. MMXXII
          </span>
          <span
            style={{
              flex:       1,
              height:     1,
              background: "linear-gradient(90deg, rgba(212,160,74,0.4), transparent)",
              display:    "block",
            }}
          />
        </div>

        {/* Title */}
        <div
          style={{
            fontFamily:    S.serif,
            fontStyle:     "italic",
            fontSize:      44,
            fontWeight:    700,
            lineHeight:    1.0,
            letterSpacing: "-0.02em",
            color:         S.fg1,
            marginBottom:  10,
          }}
        >
          The{" "}
          <span style={{ color: "#d4a04a" }}>Field</span>
          {" "}Guide
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontFamily:   S.serif,
            fontSize:     15,
            lineHeight:   1.55,
            color:        S.fg2,
            marginBottom: 20,
          }}
        >
          A standing reference for the curious smoker.
        </div>

        {/* Imprint + chevron */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span
            style={{
              fontFamily:    S.sans,
              fontSize:      9.5,
              fontWeight:    600,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color:         S.fg3,
            }}
          >
            In Four Volumes
          </span>
          <span
            style={{
              fontFamily:  S.serif,
              fontSize:    18,
              color:       S.gold,
              display:     "inline-block",
              transition:  "transform 0.2s ease",
              transform:   expanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            &#8595;
          </span>
        </div>
      </button>

      {/* ── Expanded panel ── */}
      {expanded && (
        <div
          style={{
            background:   "var(--card)",
            border:       "1px solid rgba(212,160,74,0.18)",
            borderTop:    "none",
            borderRadius: "0 0 16px 16px",
          }}
        >
          {/* Lede */}
          <div style={{ padding: "0 24px 22px" }}>
            <div
              style={{
                height:       1,
                background:   "rgba(212,160,74,0.14)",
                marginBottom: 22,
              }}
            />
            <p
              style={{
                margin:     0,
                fontFamily: S.serif,
                fontStyle:  "italic",
                fontSize:   15,
                lineHeight: 1.72,
                color:      S.fg2,
              }}
            >
              Some objects ask nothing of you. A cigar asks for an hour, a cut, a flame, and a small willingness to slow down. These pages are for the rest of it &mdash; the leaf, the cut, the lineage. Read them in order, or do not. The volumes keep their own counsel.
            </p>
          </div>

          {/* Volumes label */}
          <div
            style={{
              display:    "flex",
              alignItems: "center",
              gap:        12,
              padding:    "0 24px 14px",
            }}
          >
            <span
              style={{
                fontFamily:    S.sans,
                fontSize:      9.5,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color:         S.fg2,
              }}
            >
              The Volumes
            </span>
            <span style={{ flex: 1, height: 1, background: "rgba(212,160,74,0.18)" }} />
            <span
              style={{
                fontFamily: S.serif,
                fontStyle:  "italic",
                fontSize:   12,
                color:      S.gold,
              }}
            >
              i &mdash; iv
            </span>
          </div>

          {/* Volume list */}
          <nav aria-label="Field guide volumes">
            {VOLUMES.map((vol, i) => (
              <div key={vol.num} style={{ borderTop: "1px solid rgba(212,160,74,0.12)" }}>
                <button
                  onClick={() => setActiveVol(i + 1)}
                  className="group hover:bg-[rgba(212,160,74,0.04)] transition-colors duration-200"
                  style={{
                    display:    "flex",
                    width:      "100%",
                    alignItems: "center",
                    gap:        16,
                    padding:    "18px 24px",
                    background: "transparent",
                    border:     "none",
                    cursor:     "pointer",
                    textAlign:  "left",
                    color:      "inherit",
                    outline:    "none",
                  }}
                >
                  {/* Volume number */}
                  <div
                    style={{
                      width:      48,
                      flexShrink: 0,
                      fontFamily: S.serif,
                      fontStyle:  "italic",
                      fontSize:   38,
                      lineHeight: 1,
                      color:      S.gold,
                    }}
                    className="group-hover:text-[var(--ember)] transition-colors duration-200"
                  >
                    {vol.num}
                  </div>

                  {/* Title block */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily:    S.sans,
                        fontSize:      10,
                        letterSpacing: "0.22em",
                        textTransform: "uppercase",
                        color:         S.ember,
                        marginBottom:  4,
                      }}
                    >
                      {vol.kicker}
                    </div>
                    <div
                      style={{
                        fontFamily:    S.serif,
                        fontWeight:    600,
                        fontSize:      18,
                        lineHeight:    1.1,
                        letterSpacing: "-0.01em",
                        color:         S.fg1,
                        marginBottom:  6,
                      }}
                    >
                      {vol.before}
                      <em style={{ fontStyle: "italic", color: S.gold, fontWeight: 400 }}>
                        {vol.em}
                      </em>
                      {vol.after}
                    </div>
                    {/* Like + comment counts */}
                    {counts[i + 1] && (counts[i + 1].likes > 0 || counts[i + 1].comments > 0) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {counts[i + 1].likes > 0 && (
                          <span style={{ display: "flex", alignItems: "center", gap: 3, fontFamily: S.sans, fontSize: 10, color: S.fg3 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z" />
                            </svg>
                            {counts[i + 1].likes}
                          </span>
                        )}
                        {counts[i + 1].comments > 0 && (
                          <span style={{ display: "flex", alignItems: "center", gap: 3, fontFamily: S.sans, fontSize: 10, color: S.fg3 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            {counts[i + 1].comments}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Read time + arrow */}
                  <div
                    style={{
                      display:       "flex",
                      flexDirection: "column",
                      alignItems:    "flex-end",
                      gap:           4,
                      flexShrink:    0,
                    }}
                  >
                    <span
                      style={{
                        fontFamily:    S.sans,
                        fontSize:      10,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        color:         S.fg3,
                        whiteSpace:    "nowrap",
                      }}
                    >
                      {vol.readTime}
                    </span>
                    <span
                      className="text-[var(--gold)] group-hover:text-[var(--ember)] group-hover:translate-x-1 transition-all duration-200 inline-block"
                      style={{ fontFamily: S.serif, fontSize: 20, lineHeight: 1 }}
                    >
                      &rarr;
                    </span>
                  </div>
                </button>
              </div>
            ))}
          </nav>

          <div style={{ height: 8 }} />
        </div>
      )}

      {/* ── Article modal ── */}
      {activeVol !== null && (
        <FieldGuideModal
          volNumber={activeVol}
          onClose={() => setActiveVol(null)}
        />
      )}
    </section>
  );
}
