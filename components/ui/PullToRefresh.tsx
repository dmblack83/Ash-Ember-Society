"use client";

/*
 * PullToRefresh — indicator-only pull-to-refresh.
 *
 * The page content is NEVER transformed: several routes have
 * position:fixed headers, and a transform on any ancestor would
 * re-anchor them mid-gesture. Instead a circular indicator badge
 * descends from the top as the user pulls (Material / Android-Chrome
 * pattern), spins while refreshing, then retracts.
 *
 * The body already sets `overscroll-behavior-y: none`, so pulling
 * down at scroll-top moves nothing natively — all listeners stay
 * passive (no preventDefault, no scroll-blocking).
 *
 * Default refresh action: revalidate every mounted SWR key (that is
 * what "pull to refresh" means to a user). No router.refresh() — RSC
 * refreshes on cold networks are the documented resume-freeze
 * failure mode in this app.
 */

import React, { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";

const PULL_THRESHOLD = 80;   /* px of pull to arm a refresh */
const INDICATOR_SIZE = 36;
const MIN_SPIN_MS    = 500;  /* keep the spinner visible long enough to read */

export function PullToRefresh({
  onRefresh,
  children,
}: {
  /** Defaults to revalidating all mounted SWR keys. */
  onRefresh?: () => Promise<unknown>;
  children:   React.ReactNode;
}) {
  const { mutate } = useSWRConfig();
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const indicator = indicatorRef.current;
    if (!indicator) return;

    let startY  = 0;
    let armed   = false;
    let pulling = false;

    const setPull = (progress: number) => {
      /* Descend up to ~70px with resistance past the threshold;
         rotate as a "fill" affordance. Direct DOM writes — no React
         renders during the gesture. */
      const travel = Math.min(progress, 1.35);
      indicator.style.transition = "none";
      indicator.style.transform =
        `translateX(-50%) translateY(${travel * 70}px) rotate(${progress * 270}deg)`;
      indicator.style.opacity = String(Math.min(1, progress * 1.6));
    };

    const retract = () => {
      indicator.style.transition =
        "transform 300ms var(--ease-spring), opacity 200ms ease";
      indicator.style.transform = "translateX(-50%) translateY(0) rotate(0deg)";
      indicator.style.opacity = "0";
    };

    const holdSpinning = () => {
      indicator.style.transition = "transform 200ms ease";
      indicator.style.transform =
        `translateX(-50%) translateY(${PULL_THRESHOLD * 0.8}px)`;
      indicator.style.opacity = "1";
    };

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      armed   = window.scrollY <= 0;
      startY  = e.touches[0].clientY;
      pulling = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!armed || refreshingRef.current) return;
      /* If the page scrolled since touchstart, this is a scroll. */
      if (window.scrollY > 0) { armed = false; if (pulling) retract(); return; }
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) { if (pulling) { pulling = false; retract(); } return; }
      pulling = true;
      setPull(dy / PULL_THRESHOLD);
    };

    const onEnd = async () => {
      if (!pulling || refreshingRef.current) return;
      pulling = false;
      const raw = indicator.style.transform;
      const rotated = /rotate\(([\d.]+)deg\)/.exec(raw);
      const progress = rotated ? parseFloat(rotated[1]) / 270 : 0;

      if (progress < 1) { retract(); return; }

      refreshingRef.current = true;
      setRefreshing(true);
      holdSpinning();
      const started = Date.now();
      try {
        if (onRefresh) {
          await onRefresh();
        } else {
          await mutate(() => true);
        }
      } catch {
        /* Refresh is best-effort; SWR error handling owns retries. */
      }
      const elapsed = Date.now() - started;
      if (elapsed < MIN_SPIN_MS) {
        await new Promise((r) => setTimeout(r, MIN_SPIN_MS - elapsed));
      }
      refreshingRef.current = false;
      setRefreshing(false);
      retract();
    };

    document.addEventListener("touchstart",  onStart, { passive: true });
    document.addEventListener("touchmove",   onMove,  { passive: true });
    document.addEventListener("touchend",    onEnd,   { passive: true });
    document.addEventListener("touchcancel", onEnd,   { passive: true });
    return () => {
      document.removeEventListener("touchstart",  onStart);
      document.removeEventListener("touchmove",   onMove);
      document.removeEventListener("touchend",    onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [mutate, onRefresh]);

  return (
    <>
      {/* Indicator badge — fixed, starts hidden above the viewport. */}
      <div
        ref={indicatorRef}
        aria-hidden="true"
        className="fixed z-40 flex items-center justify-center rounded-full"
        style={{
          top:             `calc(env(safe-area-inset-top) - ${INDICATOR_SIZE + 8}px)`,
          left:            `calc(50% + var(--app-content-left) / 2)`,
          width:           INDICATOR_SIZE,
          height:          INDICATOR_SIZE,
          transform:       "translateX(-50%)",
          opacity:         0,
          pointerEvents:   "none",
          backgroundColor: "var(--card)",
          border:          "1px solid var(--card-border-hover)",
          boxShadow:       "0 4px 16px rgba(0,0,0,0.45)",
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden="true"
          className={refreshing ? "animate-spin" : undefined}
        >
          <path
            d="M9 2a7 7 0 1 1-6.3 3.9"
            stroke="var(--ember, #E8642C)"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M2.2 2.4v3.8H6"
            stroke="var(--ember, #E8642C)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {children}
    </>
  );
}
