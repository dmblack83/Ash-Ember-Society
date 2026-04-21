"use client";

import { useState, useEffect } from "react";

/* ------------------------------------------------------------------
   Wisp configuration
   Each wisp is a blurred circle that animates from the bottom of
   the viewport upward, expanding and fading as it rises.
   ------------------------------------------------------------------ */

interface Wisp {
  x:     number;                        // px offset from center (- = left)
  size:  number;                        // starting diameter (px)
  blur:  number;                        // filter: blur (px)
  delay: number;                        // animation-delay (s)
  dur:   number;                        // animation-duration (s)
  anim:  "co-smoke-l" | "co-smoke-r" | "co-smoke-c";
}

const WISPS: Wisp[] = [
  // Core column — the main plume
  { x:   0, size: 88, blur: 22, delay: 0.0, dur: 4.2, anim: "co-smoke-c" },
  { x:   4, size: 72, blur: 18, delay: 0.7, dur: 3.9, anim: "co-smoke-l" },
  { x:  -6, size: 96, blur: 25, delay: 1.4, dur: 4.6, anim: "co-smoke-r" },
  { x:   2, size: 80, blur: 20, delay: 2.1, dur: 4.1, anim: "co-smoke-c" },
  { x:  -3, size: 68, blur: 17, delay: 2.8, dur: 3.8, anim: "co-smoke-l" },
  // Wider spread — diffuses the plume at the edges
  { x: -22, size: 60, blur: 15, delay: 0.4, dur: 3.7, anim: "co-smoke-l" },
  { x:  24, size: 64, blur: 16, delay: 1.1, dur: 4.3, anim: "co-smoke-r" },
  { x: -18, size: 74, blur: 19, delay: 1.8, dur: 3.9, anim: "co-smoke-l" },
  { x:  20, size: 82, blur: 21, delay: 2.5, dur: 4.4, anim: "co-smoke-r" },
  { x:  -8, size: 56, blur: 14, delay: 3.2, dur: 3.6, anim: "co-smoke-c" },
];

/* ------------------------------------------------------------------
   Keyframes
   Three drift variants: left, right, and near-straight (slight curve).
   Scoped names avoid collisions with any other animation in the app.
   ------------------------------------------------------------------ */

const KEYFRAMES = `
  @keyframes co-smoke-l {
    0%   { opacity: 0; transform: translateY(0) scale(0.35); }
    14%  { opacity: 0.3; }
    100% { opacity: 0; transform: translateY(-72vh) translateX(-48px) scale(4); }
  }
  @keyframes co-smoke-r {
    0%   { opacity: 0; transform: translateY(0) scale(0.35); }
    14%  { opacity: 0.3; }
    100% { opacity: 0; transform: translateY(-72vh) translateX(52px) scale(4); }
  }
  @keyframes co-smoke-c {
    0%   { opacity: 0; transform: translateY(0) scale(0.4); }
    12%  { opacity: 0.26; }
    100% { opacity: 0; transform: translateY(-78vh) translateX(10px) scale(4.8); }
  }
`;

/* ------------------------------------------------------------------
   ColdOpenSmoke
   ------------------------------------------------------------------ */

export function ColdOpenSmoke() {
  const [visible,     setVisible]     = useState(false);
  const [fading,      setFading]      = useState(false);
  const [useWillChg,  setUseWillChg]  = useState(true);

  useEffect(() => {
    // Respect the user's motion preference — skip entirely
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Show once per session; each cold PWA open gets a fresh sessionStorage
    if (sessionStorage.getItem("ae-cold-open-v1")) return;
    sessionStorage.setItem("ae-cold-open-v1", "1");

    setVisible(true);

    // At 2.8 s: begin fade-out + drop will-change (animation no longer needs it)
    const tFade = setTimeout(() => {
      setFading(true);
      setUseWillChg(false);
    }, 2800);

    // At 3.5 s: unmount entirely — no DOM residue
    const tUnmount = setTimeout(() => setVisible(false), 3500);

    return () => {
      clearTimeout(tFade);
      clearTimeout(tUnmount);
    };
  }, []);

  if (!visible) return null;

  return (
    <>
      {/* Keyframes hoisted to <head> by React — de-duped automatically */}
      <style>{KEYFRAMES}</style>

      <div
        aria-hidden="true"
        style={{
          position:       "fixed",
          inset:          0,
          zIndex:         99999,
          backgroundColor:"var(--background)",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          opacity:        fading ? 0 : 1,
          transition:     "opacity 0.7s ease-out",
          // Blocks interaction until animation completes; releases at fade start
          pointerEvents:  fading ? "none" : "auto",
          overflow:       "hidden",
        }}
      >
        {/* ── Logo ──────────────────────────────────────────────── */}
        <div style={{ position: "relative", zIndex: 1 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Circle%20Logo.png"
            alt=""
            width={288}
            height={288}
            style={{ objectFit: "contain", display: "block" }}
          />
          {/* 30% scrim to soften the logo against the dark background */}
          <div
            style={{
              position:        "absolute",
              inset:           0,
              backgroundColor: "rgba(0, 0, 0, 0.30)",
              borderRadius:    "50%",
            }}
          />
        </div>

        {/* ── Smoke column — anchored to bottom center, above logo ─ */}
        <div
          style={{
            position: "absolute",
            bottom:   0,
            left:     "50%",
            width:    0,
            height:   0,
            zIndex:   3,
          }}
        >
          {WISPS.map((w, i) => (
            <div
              key={i}
              style={{
                position:        "absolute",
                bottom:          0,
                // Center each circle on its x-offset from the anchor
                left:            w.x - w.size / 2,
                width:           w.size,
                height:          w.size,
                borderRadius:    "50%",
                // var(--foreground) = #F5E6D3 — warm cream from design system
                backgroundColor: "var(--foreground)",
                filter:          `blur(${w.blur}px)`,
                animation:       `${w.anim} ${w.dur}s ease-out ${w.delay}s infinite`,
                // Dropped at 2.8 s when the fade begins
                willChange:      useWillChg ? "transform, opacity" : "auto",
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
