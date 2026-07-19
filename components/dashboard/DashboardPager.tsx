"use client";

import { Children, useCallback, useEffect, useRef, useState } from "react";
import { CollapseContext } from "./collapse-context";
import { wrapIndex, ringOffset } from "@/lib/ui/carousel";

const SWIPE_THRESHOLD_PX = 40;
const UNIFORM_MIN_HEIGHT = 96; // collapsed cards share this height

/*
 * DashboardPager — looping one-card-at-a-time carousel.
 *
 * Data-agnostic: it arranges its children (the dashboard islands) and
 * owns paging only. The active slide is in normal flow so a child's
 * inline expand grows the pager and pushes following content down; the
 * other slides are absolutely positioned and translated offscreen via
 * ringOffset (seamless loop, no clones, all children stay mounted).
 *
 * Every navigation bumps a CollapseContext counter so expandable
 * children collapse themselves.
 */
export function DashboardPager({
  children,
  initialIndex = 0,
}: {
  children: React.ReactNode;
  initialIndex?: number;
}) {
  const slides = Children.toArray(children);
  const n = slides.length;
  const [active, setActive] = useState(initialIndex);
  const [navTick, setNavTick] = useState(0);

  /* Slide count can change at runtime (the Govee sensor slide appears/
     disappears with connection state). Reclamp so a removed last slide
     can't leave `active` pointing past the end. */
  useEffect(() => {
    setActive((a) => (a >= n ? wrapIndex(a, n) : a));
  }, [n]);

  const startX = useRef<number | null>(null);

  /* eslint-disable react-hooks/preserve-manual-memoization */
  const goTo = useCallback(
    (i: number) => {
      setActive(wrapIndex(i, n));
      setNavTick((t) => t + 1); // signal children to collapse
    },
    [n],
  );
  const next = useCallback(() => goTo(active + 1), [goTo, active]);
  const prev = useCallback(() => goTo(active - 1), [goTo, active]);
  /* eslint-enable react-hooks/preserve-manual-memoization */

  function onPointerDown(e: React.PointerEvent) {
    startX.current = e.clientX;
  }
  function onPointerUp(e: React.PointerEvent) {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX) { if (dx < 0) next(); else prev(); }
  }

  const arrowStyle: React.CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: "50%",
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--foreground)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontSize: 18,
    lineHeight: 1,
  };

  return (
    <CollapseContext.Provider value={navTick}>
      <section role="region" aria-roledescription="carousel" aria-label="Dashboard highlights">
        <div
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          style={{ position: "relative", overflow: "hidden", touchAction: "pan-y" }}
        >
          {slides.map((slide, i) => {
            const offset = ringOffset(i, active, n);
            const isActive = offset === 0;
            return (
              <div
                key={i}
                aria-hidden={!isActive}
                style={{
                  position: isActive ? "relative" : "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  minHeight: UNIFORM_MIN_HEIGHT,
                  transform: `translateX(${offset * 100}%)`,
                  transition: "transform .3s cubic-bezier(.16,1,.3,1)",
                  pointerEvents: isActive ? "auto" : "none",
                  opacity: isActive ? 1 : 0,
                }}
              >
                {slide}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-4 mt-3">
          <button type="button" onClick={prev} aria-label="Previous" style={arrowStyle}>
            &#8249;
          </button>
          <div className="flex items-center gap-[7px]">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to item ${i + 1} of ${n}`}
                aria-current={i === active ? "true" : undefined}
                style={{
                  width: i === active ? 18 : 7,
                  height: 7,
                  borderRadius: 4,
                  border: "none",
                  padding: 0,
                  background: i === active ? "var(--gold, #D4A04A)" : "var(--border)",
                  transition: "all .2s",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
          <button type="button" onClick={next} aria-label="Next" style={arrowStyle}>
            &#8250;
          </button>
        </div>
      </section>
    </CollapseContext.Provider>
  );
}
