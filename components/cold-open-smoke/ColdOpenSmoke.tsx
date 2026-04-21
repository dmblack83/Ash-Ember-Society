"use client";

import { useState, useEffect } from "react";

/* ------------------------------------------------------------------
   Module-level flag — prevents re-show on in-app navigations.
   Resets naturally on every cold PWA open (fresh module load).
   Never set on the server (useEffect is client-only), so SSR always
   produces the overlay in the initial HTML → no flash of content.
   ------------------------------------------------------------------ */
let _hasShown = false;

/* ------------------------------------------------------------------
   Wisp configuration
   ------------------------------------------------------------------ */

interface Wisp {
  x:     number;                          // px offset from screen center
  size:  number;                          // starting diameter (px)
  blur:  number;                          // filter: blur (px)
  delay: number;                          // animation-delay (s)
  dur:   number;                          // animation-duration (s)
  anim:  "co-smoke-l" | "co-smoke-r" | "co-smoke-c";
}

const WISPS: Wisp[] = [
  // Core column
  { x:   0, size:  90, blur: 23, delay: 0.0, dur: 4.2, anim: "co-smoke-c" },
  { x:   5, size:  74, blur: 19, delay: 0.7, dur: 3.9, anim: "co-smoke-l" },
  { x:  -7, size:  98, blur: 26, delay: 1.4, dur: 4.6, anim: "co-smoke-r" },
  { x:   3, size:  82, blur: 21, delay: 2.1, dur: 4.1, anim: "co-smoke-c" },
  { x:  -4, size:  70, blur: 18, delay: 2.8, dur: 3.8, anim: "co-smoke-l" },
  { x:   8, size:  86, blur: 22, delay: 0.4, dur: 4.4, anim: "co-smoke-r" },
  { x:  -2, size:  78, blur: 20, delay: 1.8, dur: 4.0, anim: "co-smoke-c" },
  // Mid spread
  { x: -25, size:  62, blur: 16, delay: 0.3, dur: 3.7, anim: "co-smoke-l" },
  { x:  26, size:  66, blur: 17, delay: 1.0, dur: 4.3, anim: "co-smoke-r" },
  { x: -20, size:  76, blur: 20, delay: 1.7, dur: 3.9, anim: "co-smoke-l" },
  { x:  22, size:  84, blur: 22, delay: 2.5, dur: 4.4, anim: "co-smoke-r" },
  { x: -10, size:  58, blur: 15, delay: 3.1, dur: 3.6, anim: "co-smoke-c" },
  { x:  12, size:  68, blur: 17, delay: 3.6, dur: 4.0, anim: "co-smoke-l" },
  // Wide spread
  { x: -42, size:  55, blur: 14, delay: 0.6, dur: 3.5, anim: "co-smoke-l" },
  { x:  44, size:  58, blur: 15, delay: 1.3, dur: 4.1, anim: "co-smoke-r" },
  { x: -36, size:  64, blur: 16, delay: 2.0, dur: 3.8, anim: "co-smoke-l" },
  { x:  38, size:  72, blur: 18, delay: 2.7, dur: 4.2, anim: "co-smoke-r" },
  { x:  -1, size: 100, blur: 28, delay: 1.2, dur: 4.8, anim: "co-smoke-c" },
];

/* ------------------------------------------------------------------
   Keyframes
   Smoke origin is 12 vh below the viewport — wisps travel upward,
   entering the visible area around the 20–22% mark (peak opacity),
   then expand and dissipate across the full screen height.
   ------------------------------------------------------------------ */

const KEYFRAMES = `
  /* Hide entirely for users who prefer reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .co-smoke-overlay { display: none !important; }
  }

  @keyframes co-smoke-l {
    0%   { opacity: 0; transform: translateY(0) scale(0.35); }
    22%  { opacity: 0.30; }
    100% { opacity: 0; transform: translateY(-95vh) translateX(-48px) scale(4.2); }
  }
  @keyframes co-smoke-r {
    0%   { opacity: 0; transform: translateY(0) scale(0.35); }
    22%  { opacity: 0.30; }
    100% { opacity: 0; transform: translateY(-95vh) translateX(52px) scale(4.2); }
  }
  @keyframes co-smoke-c {
    0%   { opacity: 0; transform: translateY(0) scale(0.4); }
    20%  { opacity: 0.26; }
    100% { opacity: 0; transform: translateY(-105vh) translateX(10px) scale(5); }
  }
`;

/* ------------------------------------------------------------------
   ColdOpenSmoke
   ------------------------------------------------------------------ */

export function ColdOpenSmoke() {
  // Start visible on first module load → overlay is in the initial HTML,
  // eliminating any flash of the home screen.
  const [visible,    setVisible]    = useState(() => !_hasShown);
  const [fading,     setFading]     = useState(false);
  const [useWillChg, setUseWillChg] = useState(true);

  useEffect(() => {
    // CSS already hides for reduced-motion, but skip JS timers too
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(false);
      return;
    }

    // Already played this session
    if (_hasShown) {
      setVisible(false);
      return;
    }

    _hasShown = true;

    // 2.8 s → start fade + release will-change
    const tFade = setTimeout(() => {
      setFading(true);
      setUseWillChg(false);
    }, 2800);

    // 3.5 s → unmount, no DOM residue
    const tUnmount = setTimeout(() => setVisible(false), 3500);

    return () => {
      clearTimeout(tFade);
      clearTimeout(tUnmount);
    };
  }, []);

  if (!visible) return null;

  return (
    <>
      <style>{KEYFRAMES}</style>

      <div
        aria-hidden="true"
        className="co-smoke-overlay"
        style={{
          position:        "fixed",
          inset:           0,
          zIndex:          99999,
          backgroundColor: "var(--background)",
          opacity:         fading ? 0 : 1,
          transition:      "opacity 0.7s ease-out",
          // Blocks interaction while fully opaque; releases as it fades
          pointerEvents:   fading ? "none" : "auto",
          overflow:        "hidden",
        }}
      >
        {/* ── Logo — absolutely centered, independent of flexbox ────── */}
        <div
          style={{
            position:  "absolute",
            top:       "50%",
            left:      "50%",
            transform: "translate(-50%, -50%)",
            zIndex:    1,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Circle%20Logo.png"
            alt=""
            width={288}
            height={288}
            style={{ objectFit: "contain", display: "block" }}
          />
          {/* 30% scrim to soften the logo */}
          <div
            style={{
              position:        "absolute",
              inset:           0,
              backgroundColor: "rgba(0, 0, 0, 0.30)",
              borderRadius:    "50%",
            }}
          />
        </div>

        {/* ── Smoke — origin 12 vh below viewport, above logo ──────── */}
        <div
          style={{
            position: "absolute",
            bottom:   "-12vh",
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
                left:            w.x - w.size / 2,
                width:           w.size,
                height:          w.size,
                borderRadius:    "50%",
                backgroundColor: "var(--foreground)",
                filter:          `blur(${w.blur}px)`,
                animation:       `${w.anim} ${w.dur}s ease-out ${w.delay}s infinite`,
                willChange:      useWillChg ? "transform, opacity" : "auto",
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
