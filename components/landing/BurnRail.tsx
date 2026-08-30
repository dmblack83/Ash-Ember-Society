// components/landing/BurnRail.tsx
"use client";

import { useEffect, useRef } from "react";
import { pageProgress, railDisplayPercent, shouldWriteProgress } from "@/lib/landing/scroll-math";

/* Desktop-only cigar that burns down with reading progress. Progress is
   computed per frame from live scroll bounds (pinned scenes change page
   height, so a cached range would go stale). Hidden <900px and under
   reduced motion via landing.css. */
export function BurnRail() {
  const ashRef = useRef<HTMLElement>(null);
  const emberRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    let raf = 0;
    let lastP = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = pageProgress(window.scrollY, max);
      if (!shouldWriteProgress(p, lastP)) return;
      lastP = p;
      const d = railDisplayPercent(p).toFixed(2) + "%";
      if (ashRef.current) ashRef.current.style.height = d;
      if (emberRef.current) emberRef.current.style.top = d;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="burn-rail" aria-hidden="true">
      <div className="cigar">
        <span className="cigar-smoke"><b /><b /><b /><b /><b /></span>
        <i className="cigar-ash" ref={ashRef} />
        <span className="cigar-ember" ref={emberRef} />
        <span className="cigar-band">A<i>&</i>E</span>
      </div>
      <span className="rail-word">Scroll</span>
    </div>
  );
}
