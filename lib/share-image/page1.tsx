import React from "react";
import { T }            from "./tokens";
import { gradeFor, starFillPct } from "./helpers";
import type { ShareImageProps }  from "./types";

const STAR_PATH = "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";
const STAR_LABELS = ["", "Poor", "Below Average", "Average", "Good", "Outstanding"] as const;

function subRatingGrade(val: number): string {
  const bucket = Math.min(5, Math.floor(val));
  return val >= 1 ? STAR_LABELS[bucket] : "—";
}

function SatoriStarRow({ val, rowKey }: { val: number; rowKey: string }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {([1, 2, 3, 4, 5] as const).map((s) => {
        const pct = starFillPct(s, val);
        if (pct === 100 || pct === 0) {
          return (
            <svg key={s} width="12" height="12" viewBox="0 0 24 24">
              <path d={STAR_PATH} fill={pct === 100 ? T.gold : "rgba(245,230,211,0.18)"} />
            </svg>
          );
        }
        const clipId = `clip-${rowKey}-${s}`;
        return (
          <svg key={s} width="12" height="12" viewBox="0 0 24 24">
            <defs>
              <clipPath id={clipId}>
                <rect x="0" y="0" width={(24 * pct) / 100} height="24" />
              </clipPath>
            </defs>
            <path d={STAR_PATH} fill="rgba(245,230,211,0.18)" />
            <path d={STAR_PATH} fill={T.gold} clipPath={`url(#${clipId})`} />
          </svg>
        );
      })}
    </div>
  );
}

function SubRatingCell({ label, val, rowKey }: { label: string; val: number; rowKey: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
      <p style={{ fontFamily: T.mono, fontSize: 8, fontWeight: 500, letterSpacing: "0.22em",
        textTransform: "uppercase", color: T.paperMute, margin: 0 }}>
        {label}
      </p>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 5 }}>
        <SatoriStarRow val={val} rowKey={rowKey} />
      </div>
      <p style={{ fontFamily: T.mono, fontSize: 8, fontWeight: 500, letterSpacing: "0.18em",
        textTransform: "uppercase", color: T.goldDeep, margin: "5px 0 0" }}>
        {subRatingGrade(val)}
      </p>
    </div>
  );
}

function PhotoStrip({ uris }: { uris: string[] }) {
  if (uris.length === 0) return null;
  const cw  = T.CONTENT_WIDTH;
  const gap = T.PHOTO_GAP;

  if (uris.length === 1) {
    return (
      <div style={{ display: "flex", marginTop: 20 }}>
        <img src={uris[0]} width={cw} height={Math.round(cw * 0.75)}
          style={{ objectFit: "cover", borderRadius: 2 }} />
      </div>
    );
  }

  if (uris.length === 2) {
    const w = Math.floor((cw - gap) / 2);
    const h = Math.round(w * 0.75);
    return (
      <div style={{ display: "flex", gap, marginTop: 20 }}>
        <img src={uris[0]} width={w} height={h} style={{ objectFit: "cover", borderRadius: 2 }} />
        <img src={uris[1]} width={w} height={h} style={{ objectFit: "cover", borderRadius: 2 }} />
      </div>
    );
  }

  // 3-photo asymmetric layout: left 1.85fr, right 1fr
  const leftW  = Math.floor((cw - gap) * (1.85 / 2.85));
  const rightW = (cw - gap) - leftW;
  const leftH  = Math.round(leftW * 0.75);
  const rightH = Math.floor((leftH - gap) / 2);
  return (
    <div style={{ display: "flex", gap, marginTop: 20 }}>
      <img src={uris[0]} width={leftW} height={leftH}
        style={{ objectFit: "cover", borderRadius: 2 }} />
      <div style={{ display: "flex", flexDirection: "column", gap }}>
        <img src={uris[1]} width={rightW} height={rightH}
          style={{ objectFit: "cover", borderRadius: 2 }} />
        <img src={uris[2]} width={rightW} height={rightH}
          style={{ objectFit: "cover", borderRadius: 2 }} />
      </div>
    </div>
  );
}

function Masthead({ parts }: { parts: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", marginBottom: 20 }}>
      <div style={{ height: 1, background: T.line, width: "100%" }} />
      <p style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 500, letterSpacing: "0.32em",
        textTransform: "uppercase", color: T.paperMute, textAlign: "center", margin: "6px 0",
        width: "100%" }}>
        {parts.join(" · ")}
      </p>
      <div style={{ height: 1, background: T.line, width: "100%" }} />
    </div>
  );
}

function Footer() {
  return (
    <div style={{ display: "flex", flexDirection: "column", marginTop: 20 }}>
      <div style={{ height: 1, background: T.line, width: "100%" }} />
      <p style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 500, letterSpacing: "0.32em",
        textTransform: "uppercase", color: T.goldFooter, textAlign: "center", margin: "8px 0",
        width: "100%" }}>
        ASH & EMBER · WWW.ASHEMBER.VIP
      </p>
    </div>
  );
}

export function buildPage1(p: ShareImageProps): React.ReactElement {
  const score     = p.overallRating ?? 0;
  const grade     = p.overallRating != null ? gradeFor(p.overallRating) : "—";
  const firstName = (p.displayName?.trim().split(/\s+/)[0] ?? "").toUpperCase() || null;

  const smokedDate = new Date(
    p.smokedAt.length === 10 ? p.smokedAt + "T00:00:00" : p.smokedAt
  );
  const mastheadDate = smokedDate
    .toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" })
    .toUpperCase()
    .replace(",", "");
  const mastheadParts = [
    "Burn Report",
    p.reportNumber != null ? `No. ${p.reportNumber}` : null,
    mastheadDate,
  ].filter(Boolean) as string[];

  const verdictLabel = firstName ? `${firstName}'S VERDICT` : "THE VERDICT";
  const scoreColW    = Math.round(T.CONTENT_WIDTH * 0.25);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: T.IMAGE_WIDTH,
      backgroundColor: T.background, padding: T.outerPad }}>
      <div style={{ display: "flex", flexDirection: "column", backgroundColor: T.card,
        border: `1px solid ${T.line}`, borderRadius: 4, padding: T.cardPad }}>

        <Masthead parts={mastheadParts} />

        {/* Hero row: 25% score | 75% identity */}
        <div style={{ display: "flex", gap: 16, marginBottom: 20, alignItems: "center" }}>
          {/* Score column */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", width: scoreColW, paddingRight: 16,
            borderRight: `1px solid ${T.lineSoft}` }}>
            <p style={{ fontFamily: T.mono, fontSize: 7, fontWeight: 500, letterSpacing: "0.28em",
              textTransform: "uppercase", color: T.paperMute, margin: 0, textAlign: "center" }}>
              {verdictLabel}
            </p>
            <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: 52, fontWeight: 500,
              color: T.gold, margin: "4px 0 0", lineHeight: 1 }}>
              {p.overallRating != null ? score : "—"}
            </p>
            <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: 13, fontWeight: 500,
              color: T.foreground, margin: "4px 0 0" }}>
              {grade}
            </p>
          </div>

          {/* Identity column */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center",
            alignItems: "center", flex: 1 }}>
            {p.cigar?.brand && (
              <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: 20, fontWeight: 500,
                color: T.gold, margin: 0, whiteSpace: "nowrap" }}>
                {p.cigar.brand}
              </p>
            )}
            <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: 20, fontWeight: 600,
              color: T.foreground, margin: "4px 0 0", lineHeight: 1.1, textAlign: "center" }}>
              {p.cigar?.series ?? p.cigar?.format ?? "Unknown Cigar"}
            </p>
            {p.cigar?.format && p.cigar?.series && (
              <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: 12,
                color: T.paperMute, margin: "4px 0 0" }}>
                {p.cigar.format}
              </p>
            )}
          </div>
        </div>

        {/* Sub-ratings strip */}
        <div style={{ display: "flex", gap: 8 }}>
          <SubRatingCell label="Draw"   val={p.drawRating         ?? 0} rowKey="draw" />
          <SubRatingCell label="Burn"   val={p.burnRating         ?? 0} rowKey="burn" />
          <SubRatingCell label="Build"  val={p.constructionRating ?? 0} rowKey="build" />
          <SubRatingCell label="Flavor" val={p.flavorRating       ?? 0} rowKey="flavor" />
        </div>

        <PhotoStrip uris={p.photoDataUris.slice(0, 3)} />

        <Footer />
      </div>
    </div>
  );
}
