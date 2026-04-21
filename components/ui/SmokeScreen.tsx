"use client";

import { useState, useEffect } from "react";

/* ------------------------------------------------------------------
   Smoke wisp configuration
   ------------------------------------------------------------------ */

interface Wisp {
  x:     number;                        // px offset from screen center
  size:  number;                        // diameter (px)
  blur:  number;                        // filter blur (px)
  delay: number;                        // animation-delay (s)
  dur:   number;                        // animation-duration (s)
  anim:  "smoke-l" | "smoke-r" | "smoke-c";
}

const WISPS: Wisp[] = [
  // Core column
  { x:   0, size: 88, blur: 22, delay: 0.0, dur: 4.2, anim: "smoke-c" },
  { x:   4, size: 72, blur: 18, delay: 0.7, dur: 3.9, anim: "smoke-l" },
  { x:  -6, size: 96, blur: 25, delay: 1.4, dur: 4.6, anim: "smoke-r" },
  { x:   2, size: 80, blur: 20, delay: 2.1, dur: 4.1, anim: "smoke-c" },
  { x:  -3, size: 68, blur: 17, delay: 2.8, dur: 3.8, anim: "smoke-l" },
  // Wider spread
  { x: -22, size: 60, blur: 15, delay: 0.4, dur: 3.7, anim: "smoke-l" },
  { x:  24, size: 64, blur: 16, delay: 1.1, dur: 4.3, anim: "smoke-r" },
  { x: -18, size: 74, blur: 19, delay: 1.8, dur: 3.9, anim: "smoke-l" },
  { x:  20, size: 82, blur: 21, delay: 2.5, dur: 4.4, anim: "smoke-r" },
  { x:  -8, size: 56, blur: 14, delay: 3.2, dur: 3.6, anim: "smoke-c" },
];

/* Wisps drift left, right, or nearly straight up with a slight curve */
const KEYFRAMES = `
  @keyframes smoke-l {
    0%   { opacity: 0; transform: translateY(0) translateX(0) scale(0.35); }
    14%  { opacity: 0.32; }
    100% { opacity: 0; transform: translateY(-72vh) translateX(-48px) scale(4.0); }
  }
  @keyframes smoke-r {
    0%   { opacity: 0; transform: translateY(0) translateX(0) scale(0.35); }
    14%  { opacity: 0.32; }
    100% { opacity: 0; transform: translateY(-72vh) translateX(52px) scale(4.0); }
  }
  @keyframes smoke-c {
    0%   { opacity: 0; transform: translateY(0) translateX(0) scale(0.4); }
    12%  { opacity: 0.28; }
    100% { opacity: 0; transform: translateY(-78vh) translateX(10px) scale(4.8); }
  }
`;

/* ------------------------------------------------------------------
   SmokeScreen
   Shows once per PWA session (cleared on each cold open via
   sessionStorage). Fades out after ~2.8 s and is removed from the
   DOM at ~3.5 s so it has no further impact on the app.
   ------------------------------------------------------------------ */

export function SmokeScreen() {
  const [visible, setVisible] = useState(false);
  const [fading,  setFading]  = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("ae-splash-v1")) return;

    sessionStorage.setItem("ae-splash-v1", "1");
    setVisible(true);

    const t1 = setTimeout(() => setFading(true),   2800);
    const t2 = setTimeout(() => setVisible(false), 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (!visible) return null;

  return (
    <>
      {/* Keyframes are hoisted by React 19 / de-duped server-side */}
      <style>{KEYFRAMES}</style>

      <div
        aria-hidden="true"
        style={{
          position:        "fixed",
          inset:           0,
          zIndex:          99999,
          backgroundColor: "#1A1210",
          display:         "flex",
          flexDirection:   "column",
          alignItems:      "center",
          justifyContent:  "center",
          opacity:         fading ? 0 : 1,
          transition:      "opacity 0.7s ease-out",
          pointerEvents:   fading ? "none" : "auto",
          overflow:        "hidden",
        }}
      >
        {/* ── Brand lockup ──────────────────────────────────────── */}
        <div style={{ textAlign: "center", position: "relative", zIndex: 2 }}>
          {/* Top rule */}
          <div
            style={{
              width:           48,
              height:          1,
              backgroundColor: "#D4A04A",
              margin:          "0 auto 20px",
            }}
          />

          <p
            style={{
              fontFamily:    "var(--font-playfair, serif)",
              fontSize:      30,
              fontWeight:    600,
              color:         "#D4A04A",
              letterSpacing: "0.04em",
              lineHeight:    1.2,
              margin:        0,
            }}
          >
            Ash &amp; Ember
          </p>
          <p
            style={{
              fontFamily:    "var(--font-playfair, serif)",
              fontSize:      11,
              fontWeight:    400,
              color:         "#A69080",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              marginTop:     10,
            }}
          >
            Society
          </p>

          {/* Bottom rule */}
          <div
            style={{
              width:           48,
              height:          1,
              backgroundColor: "#D4A04A",
              margin:          "20px auto 0",
            }}
          />
        </div>

        {/* ── Smoke column — rises from bottom center ───────────── */}
        <div
          style={{
            position: "absolute",
            bottom:   0,
            left:     "50%",
            width:    0,
            height:   0,
          }}
        >
          {WISPS.map((w, i) => (
            <div
              key={i}
              style={{
                position:        "absolute",
                bottom:          0,
                /* center each circle on its x-offset */
                left:            w.x - w.size / 2,
                width:           w.size,
                height:          w.size,
                borderRadius:    "50%",
                backgroundColor: "rgba(245, 230, 211, 1)",
                filter:          `blur(${w.blur}px)`,
                animation:       `${w.anim} ${w.dur}s ease-out ${w.delay}s infinite`,
                willChange:      "transform, opacity",
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
