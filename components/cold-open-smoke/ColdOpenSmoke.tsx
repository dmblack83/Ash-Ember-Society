"use client";

import { useState, useEffect } from "react";

/* ------------------------------------------------------------------
   Flash prevention — module-level flag so the overlay is visible
   from the very first render on cold open, eliminating any flash
   of the home screen between SSR and hydration.
   ------------------------------------------------------------------ */

let _hasShown = false;

/* ------------------------------------------------------------------
   Wisp configuration
   18 wisps across three bands: core plume, mid spread, wide edges.
   Spawned 12vh below the viewport so they rise into view naturally.
   ------------------------------------------------------------------ */

interface Wisp {
  x:     number;
  size:  number;
  blur:  number;
  delay: number;
  dur:   number;
  anim:  "co-smoke-l" | "co-smoke-r" | "co-smoke-c";
}

const WISPS: Wisp[] = [
  // Core column
  { x:   0, size: 88, blur: 22, delay: 0.0, dur: 4.4, anim: "co-smoke-c" },
  { x:   4, size: 72, blur: 18, delay: 0.7, dur: 4.1, anim: "co-smoke-l" },
  { x:  -6, size: 96, blur: 25, delay: 1.4, dur: 4.8, anim: "co-smoke-r" },
  { x:   2, size: 80, blur: 20, delay: 2.1, dur: 4.3, anim: "co-smoke-c" },
  { x:  -3, size: 68, blur: 17, delay: 2.8, dur: 4.0, anim: "co-smoke-l" },
  { x:   5, size: 76, blur: 19, delay: 0.3, dur: 4.6, anim: "co-smoke-r" },
  // Mid spread
  { x: -22, size: 60, blur: 15, delay: 0.4, dur: 3.9, anim: "co-smoke-l" },
  { x:  24, size: 64, blur: 16, delay: 1.1, dur: 4.5, anim: "co-smoke-r" },
  { x: -18, size: 74, blur: 19, delay: 1.8, dur: 4.1, anim: "co-smoke-l" },
  { x:  20, size: 82, blur: 21, delay: 2.5, dur: 4.6, anim: "co-smoke-r" },
  { x:  -8, size: 56, blur: 14, delay: 3.2, dur: 3.8, anim: "co-smoke-c" },
  { x:  12, size: 70, blur: 18, delay: 1.6, dur: 4.2, anim: "co-smoke-r" },
  // Wide edges
  { x: -44, size: 52, blur: 13, delay: 0.6, dur: 3.7, anim: "co-smoke-l" },
  { x:  46, size: 58, blur: 15, delay: 1.3, dur: 4.3, anim: "co-smoke-r" },
  { x: -36, size: 66, blur: 17, delay: 2.0, dur: 4.0, anim: "co-smoke-l" },
  { x:  38, size: 62, blur: 16, delay: 2.7, dur: 4.4, anim: "co-smoke-r" },
  { x: -28, size: 54, blur: 14, delay: 3.4, dur: 3.9, anim: "co-smoke-l" },
  { x:  30, size: 60, blur: 15, delay: 0.9, dur: 4.1, anim: "co-smoke-r" },
];

/* ------------------------------------------------------------------
   Keyframes — wisps spawn 12vh below the viewport and rise into view.
   Opacity peaks at 20-22% when wisps enter the visible area.
   ------------------------------------------------------------------ */

const KEYFRAMES = `
  @keyframes co-smoke-l {
    0%   { opacity: 0;    transform: translateY(0) scale(0.35); }
    20%  { opacity: 0.21; }
    100% { opacity: 0;    transform: translateY(-95vh) translateX(-52px) scale(4); }
  }
  @keyframes co-smoke-r {
    0%   { opacity: 0;    transform: translateY(0) scale(0.35); }
    22%  { opacity: 0.20; }
    100% { opacity: 0;    transform: translateY(-95vh) translateX(56px) scale(4); }
  }
  @keyframes co-smoke-c {
    0%   { opacity: 0;    transform: translateY(0) scale(0.4); }
    20%  { opacity: 0.22; }
    100% { opacity: 0;    transform: translateY(-105vh) translateX(10px) scale(4.8); }
  }
`;

/* ------------------------------------------------------------------
   ColdOpenSmoke
   ------------------------------------------------------------------ */

export function ColdOpenSmoke() {
  // Start hidden — shown only after confirming PWA + mobile in useEffect.
  // This avoids rendering the overlay at all in a browser context.
  const [visible,    setVisible]    = useState(false);
  const [fading,     setFading]     = useState(false);
  const [useWillChg, setUseWillChg] = useState(true);

  useEffect(() => {
    // Only play when launched from the installed PWA on a mobile device.
    // navigator.standalone covers iOS Safari; display-mode: standalone
    // covers Android/Chrome PWA. Both are checked for full coverage.
    const isPWA    = (navigator as Navigator & { standalone?: boolean }).standalone === true ||
                     window.matchMedia("(display-mode: standalone)").matches;
    const isMobile = window.matchMedia("(max-width: 768px)").matches;

    if (!isPWA || !isMobile) return;

    // Respect reduced-motion preference
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Show once per JS session (module-level flag survives client-side nav)
    if (_hasShown) return;
    _hasShown = true;

    setVisible(true);

    // Fade out at 4 s, drop will-change at the same time
    const tFade    = setTimeout(() => { setFading(true); setUseWillChg(false); }, 4000);
    // Unmount at 5 s — animation complete
    const tUnmount = setTimeout(() => setVisible(false), 5000);

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
        style={{
          position:        "fixed",
          inset:           0,
          zIndex:          99999,
          backgroundColor: "var(--background)",
          overflow:        "hidden",
          // Blocks all interaction during the active phase
          pointerEvents:   fading ? "none" : "auto",
          opacity:         fading ? 0 : 1,
          transition:      "opacity 1s ease-out",
        }}
      >
        {/* ── Logo — absolutely centered, unaffected by layout ─────── */}
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
          {/* 50% scrim over the logo */}
          <div
            style={{
              position:        "absolute",
              inset:           0,
              backgroundColor: "rgba(0,0,0,0.50)",
              borderRadius:    "50%",
            }}
          />
        </div>

        {/* ── Smoke column — anchor is 12vh below the bottom edge ───── */}
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
