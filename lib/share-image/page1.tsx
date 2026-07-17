import React from "react";
import { T }            from "./tokens";
import { gradeFor, starFillPct, fitWithin, singlePhotoBandHeight, photoRowHeight } from "./helpers";
import { smokedAtToLocalDate }   from "@/lib/format";
import type { ShareImageProps, SharePhoto } from "./types";

const STAR_PATH = "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";
const STAR_LABELS = ["", "Poor", "Below Average", "Average", "Good", "Outstanding"] as const;

function subRatingGrade(val: number): string {
  const bucket = Math.min(5, Math.floor(val));
  return val >= 1 ? STAR_LABELS[bucket] : "—";
}

function SatoriStarRow({ val, rowKey }: { val: number; rowKey: string }) {
  const s = T.type.star;
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {([1, 2, 3, 4, 5] as const).map((star) => {
        const pct = starFillPct(star, val);
        if (pct === 100 || pct === 0) {
          return (
            <svg key={star} width={s} height={s} viewBox="0 0 24 24">
              <path d={STAR_PATH} fill={pct === 100 ? T.gold : "rgba(245,230,211,0.18)"} />
            </svg>
          );
        }
        const clipId = `clip-${rowKey}-${star}`;
        return (
          <svg key={star} width={s} height={s} viewBox="0 0 24 24">
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
      <p style={{ fontFamily: T.mono, fontSize: T.type.eyebrow, fontWeight: 500, letterSpacing: "0.22em",
        textTransform: "uppercase", color: T.paperMute, margin: 0 }}>
        {label}
      </p>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
        <SatoriStarRow val={val} rowKey={rowKey} />
      </div>
      <p style={{ fontFamily: T.mono, fontSize: T.type.eyebrow, fontWeight: 500, letterSpacing: "0.18em",
        textTransform: "uppercase", color: T.goldDeep, margin: "8px 0 0" }}>
        {subRatingGrade(val)}
      </p>
    </div>
  );
}

/* Photos scale to FIT, never crop — mirrors the in-app VerdictCard rule.
   Each cell letterboxes its image on a dim backdrop; the drawn size comes
   from fitWithin (explicit contain math, no reliance on Satori's object-fit
   intrinsic-size sniffing). A single photo takes its natural aspect ratio
   at content width, capped by singlePhotoBandHeight. */
function PhotoCell({ photo, cellW, cellH }: { photo: SharePhoto; cellW: number; cellH: number }) {
  // Unknown intrinsic size (sharp metadata failed): fill-the-cell crop, the
  // pre-fix behavior — cropping beats stretching for real photos.
  if (!photo.width || !photo.height) {
    return (
      <img src={photo.uri} width={cellW} height={cellH}
        style={{ objectFit: "cover", borderRadius: 2 }} />
    );
  }
  const fit = fitWithin(photo.width, photo.height, cellW, cellH);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
      width: cellW, height: cellH, background: "rgba(0,0,0,0.25)", borderRadius: 2 }}>
      <img src={photo.uri} width={fit.width} height={fit.height}
        style={{ borderRadius: 2 }} />
    </div>
  );
}

function PhotoStrip({ photos }: { photos: SharePhoto[] }) {
  if (photos.length === 0) return null;
  const cw  = T.CONTENT_WIDTH;
  const gap = T.PHOTO_GAP;

  if (photos.length === 1) {
    const h = singlePhotoBandHeight(photos[0].width, photos[0].height);
    return (
      <div style={{ display: "flex", marginTop: 24 }}>
        <PhotoCell photo={photos[0]} cellW={cw} cellH={h} />
      </div>
    );
  }

  // 2 or 3 photos: equal cells side by side (the in-app asymmetric layout
  // relies on tap-to-open; the export shows every photo at the same size).
  // Row height tracks the tallest fitted photo, capped at the band.
  const w = Math.floor((cw - gap * (photos.length - 1)) / photos.length);
  const h = photoRowHeight(photos, w);
  return (
    <div style={{ display: "flex", gap, marginTop: 24 }}>
      {photos.map((photo, i) => (
        <PhotoCell key={i} photo={photo} cellW={w} cellH={h} />
      ))}
    </div>
  );
}

function Masthead({ parts }: { parts: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", marginBottom: 24 }}>
      <div style={{ height: 1, background: T.line, width: "100%" }} />
      <div style={{ display: "flex", justifyContent: "center", width: "100%", padding: "8px 0" }}>
        <p style={{ fontFamily: T.mono, fontSize: T.type.meta, fontWeight: 500, letterSpacing: "0.32em",
          textTransform: "uppercase", color: T.paperMute, margin: 0 }}>
          {parts.join(" · ")}
        </p>
      </div>
      <div style={{ height: 1, background: T.line, width: "100%" }} />
    </div>
  );
}

function Footer() {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", marginTop: 24 }}>
      <div style={{ height: 1, background: T.line, width: "100%" }} />
      <div style={{ display: "flex", justifyContent: "center", width: "100%", padding: "10px 0" }}>
        <p style={{ fontFamily: T.mono, fontSize: T.type.eyebrow, fontWeight: 500, letterSpacing: "0.32em",
          textTransform: "uppercase", color: T.goldFooter, margin: 0 }}>
          ASH & EMBER · WWW.ASHEMBER.VIP
        </p>
      </div>
    </div>
  );
}

export function buildPage1(p: ShareImageProps): React.ReactElement {
  const score     = p.overallRating ?? 0;
  const grade     = p.overallRating != null ? gradeFor(p.overallRating) : "—";
  const firstName = (p.displayName?.trim().split(/\s+/)[0] ?? "").toUpperCase() || null;

  const smokedDate = smokedAtToLocalDate(p.smokedAt) ?? new Date();
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
  const scoreColW    = Math.round(T.CONTENT_WIDTH * 0.28);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: T.IMAGE_WIDTH,
      backgroundColor: T.background, padding: T.outerPad }}>
      <div style={{ display: "flex", flexDirection: "column", backgroundColor: T.card,
        border: `1px solid ${T.line}`, borderRadius: 4, padding: T.cardPad }}>

        <Masthead parts={mastheadParts} />

        {/* Hero row: score | identity */}
        <div style={{ display: "flex", gap: 20, marginBottom: 24, alignItems: "center" }}>
          {/* Score column */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", width: scoreColW, paddingRight: 20,
            borderRight: `1px solid ${T.lineSoft}` }}>
            <p style={{ fontFamily: T.mono, fontSize: T.type.eyebrow, fontWeight: 500, letterSpacing: "0.28em",
              textTransform: "uppercase", color: T.paperMute, margin: 0, textAlign: "center" }}>
              {verdictLabel}
            </p>
            <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.score, fontWeight: 500,
              color: T.gold, margin: "6px 0 0", lineHeight: 1 }}>
              {p.overallRating != null ? score : "—"}
            </p>
            <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.caption, fontWeight: 500,
              color: T.foreground, margin: "6px 0 0" }}>
              {grade}
            </p>
          </div>

          {/* Identity column — brand/series allowed to wrap (no nowrap) */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center",
            alignItems: "center", flex: 1 }}>
            {p.cigar?.brand && (
              <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.identity, fontWeight: 500,
                color: T.gold, margin: 0, lineHeight: 1.1, textAlign: "center" }}>
                {p.cigar.brand}
              </p>
            )}
            <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.identity, fontWeight: 600,
              color: T.foreground, margin: "6px 0 0", lineHeight: 1.1, textAlign: "center" }}>
              {p.cigar?.series ?? p.cigar?.format ?? "Unknown Cigar"}
            </p>
            {p.cigar?.format && p.cigar?.series && (
              <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.caption,
                color: T.paperMute, margin: "6px 0 0", textAlign: "center" }}>
                {p.cigar.format}
              </p>
            )}
          </div>
        </div>

        {/* Sub-ratings strip */}
        <div style={{ display: "flex", gap: 10 }}>
          <SubRatingCell label="Draw"   val={p.drawRating         ?? 0} rowKey="draw" />
          <SubRatingCell label="Burn"   val={p.burnRating         ?? 0} rowKey="burn" />
          <SubRatingCell label="Build"  val={p.constructionRating ?? 0} rowKey="build" />
          <SubRatingCell label="Flavor" val={p.flavorRating       ?? 0} rowKey="flavor" />
        </div>

        <PhotoStrip photos={p.photos.slice(0, 3)} />

        <Footer />
      </div>
    </div>
  );
}
