/* ------------------------------------------------------------------
   StarRating

   Two modes:
   - display: renders 5 stars with optional partial fill (in 0.25
     increments) for showing averaged-across-thirds ratings on the
     Verdict Card.
   - input: 5 click targets for 1-5 star selection. Tapping a star
     sets that value; tapping the currently-selected star resets to 0.

   Partial fills use an SVG mask + CSS background-color so the gold
   color cascades from CSS (the mask SVG uses a black fill in the data
   URI, and background-color paints under the mask).
   ------------------------------------------------------------------ */

import React from "react";

interface StarRatingProps {
  mode:    "display" | "input";
  value:   number;                   // 0-5; display mode accepts decimals
  size?:   number;                   // px; default 18
  onChange?: (next: number) => void; // input mode only
  ariaLabel?: string;
}

const STAR_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><polygon points='10,1 12.6,7 19,7.5 14.2,11.8 15.7,18 10,14.7 4.3,18 5.8,11.8 1,7.5 7.4,7' fill='black'/></svg>";

export function StarRating({
  mode,
  value,
  size = 18,
  onChange,
  ariaLabel,
}: StarRatingProps) {
  const clamped = Math.max(0, Math.min(5, value));
  const isInput = mode === "input";

  return (
    <div
      role={isInput ? "radiogroup" : "img"}
      aria-label={ariaLabel ?? (isInput ? "Rate from 1 to 5" : `Rated ${clamped} out of 5`)}
      style={{ display: "inline-flex", gap: 4 }}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        /* fill percent for this star (0-100). For display mode we
           support partial fills; for input mode every star is either
           fully filled or fully empty. */
        let fillPct = 0;
        if (isInput) {
          fillPct = i <= clamped ? 100 : 0;
        } else {
          if (i <= Math.floor(clamped)) fillPct = 100;
          else if (i === Math.ceil(clamped)) fillPct = Math.round((clamped - Math.floor(clamped)) * 100);
        }

        const baseStar = (
          <span
            style={{
              position:           "absolute",
              top: 0, left: 0,
              width:              "100%",
              height:             "100%",
              backgroundColor:    "rgba(245,230,211,0.18)",
              WebkitMaskImage:    `url("${STAR_SVG}")`,
              maskImage:          `url("${STAR_SVG}")`,
              WebkitMaskSize:     "contain",
              maskSize:           "contain",
              WebkitMaskRepeat:   "no-repeat",
              maskRepeat:         "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition:       "center",
            }}
          />
        );

        const fillStar = (
          <span
            style={{
              position:           "absolute",
              top: 0, left: 0,
              width:              "100%",
              height:             "100%",
              backgroundColor:    "var(--gold)",
              WebkitMaskImage:    `url("${STAR_SVG}")`,
              maskImage:          `url("${STAR_SVG}")`,
              WebkitMaskSize:     "contain",
              maskSize:           "contain",
              WebkitMaskRepeat:   "no-repeat",
              maskRepeat:         "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition:       "center",
              clipPath:           `inset(0 ${100 - fillPct}% 0 0)`,
            }}
          />
        );

        const inner = (
          <span style={{ position: "relative", display: "inline-block", width: size, height: size }}>
            {baseStar}
            {fillStar}
          </span>
        );

        if (!isInput) return <React.Fragment key={i}>{inner}</React.Fragment>;

        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={i === Math.round(clamped)}
            aria-label={`${i} star${i === 1 ? "" : "s"}`}
            onClick={() => {
              if (!onChange) return;
              /* Tap the currently-selected star to clear back to 0. */
              const next = i === Math.round(clamped) ? 0 : i;
              onChange(next);
            }}
            style={{
              padding:    4,
              margin:     -4,
              background: "transparent",
              border:     "none",
              cursor:     "pointer",
              lineHeight: 0,
            }}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
