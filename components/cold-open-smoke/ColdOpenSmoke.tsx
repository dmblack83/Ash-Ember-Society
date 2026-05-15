import { ColdOpenSmokeTimer } from "./ColdOpenSmokeTimer";

/* Re-exported from a pure-TS sibling so next.config.ts can import the
   script string for CSP hash computation without pulling in JSX. */
export { COLD_SMOKE_INIT_SCRIPT } from "./cold-smoke-init";

/* ------------------------------------------------------------------
   ColdOpenSmoke — cold-launch loader.

   Architecture: the overlay markup is server-rendered every request,
   but is hidden by default via CSS (`.cold-smoke-overlay { display:
   none }`). A synchronous inline init script — placed in <head> by
   the root layout — checks that the user is in a mobile PWA and
   hasn't seen the loader recently, then adds `cold-smoke-active` to
   <html>. Because the script runs at parse time before the body
   paints, the overlay is visible from the very first frame. No flash
   of dashboard, no React-render gap.

   The 30-minute "recently seen" threshold uses localStorage so it
   survives iOS killing the PWA when the user taps an external link
   and returns. Without that, every external-link round-trip would
   replay the loader.

   Background continuity: on iOS PWA, the same image iOS used for
   the apple-touch-startup-image splash is set as the overlay's CSS
   background-image via per-device media queries in globals.css.
   That means the splash → cold-smoke handoff is a frame-perfect
   match — identical logo position, identical dark fill, identical
   pixel dimensions — with the rising smoke wisps animating on top.

   On Android / desktop / non-listed iOS sizes, the overlay falls
   back to a solid #15110b background (the Android PWA splash uses
   the manifest background_color, also #15110b, so the handoff is
   still color-continuous even without an image).
   ------------------------------------------------------------------ */

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

export function ColdOpenSmoke() {
  return (
    <>
      <div className="cold-smoke-overlay" aria-hidden="true">
        <div className="cold-smoke-column">
          {WISPS.map((w, i) => (
            <div
              key={i}
              className="cold-smoke-wisp"
              style={{
                left:      w.x - w.size / 2,
                width:     w.size,
                height:    w.size,
                filter:    `blur(${w.blur}px)`,
                animation: `${w.anim} ${w.dur}s ease-out ${w.delay}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      <ColdOpenSmokeTimer />
    </>
  );
}
