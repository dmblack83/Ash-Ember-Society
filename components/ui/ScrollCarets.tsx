"use client";

import { useEffect, useState } from "react";

/**
 * Page-scroll carets — small chevron pills that appear at top-right and
 * bottom-right of the viewport when there is more content above/below the
 * current scroll position. Mobile only.
 */
export function ScrollCarets() {
  const [showUp,   setShowUp]   = useState(false);
  const [showDown, setShowDown] = useState(false);

  useEffect(() => {
    function update() {
      const scrollY   = window.scrollY;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      setShowUp(scrollY > 60);
      setShowDown(maxScroll > 60 && scrollY < maxScroll - 60);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const base: React.CSSProperties = {
    position:         "fixed",
    right:            14,
    zIndex:           20,
    width:            28,
    height:           28,
    borderRadius:     "50%",
    backgroundColor:  "rgba(26,18,16,0.88)",
    border:           "1px solid var(--border)",
    display:          "flex",
    alignItems:       "center",
    justifyContent:   "center",
    pointerEvents:    "none",
    backdropFilter:   "blur(6px)",
    transition:       "opacity 0.25s ease",
  };

  return (
    <div className="md:hidden">
      <div style={{ ...base, top: 64, opacity: showUp ? 1 : 0 }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 8L6 4L10 8" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div style={{ ...base, bottom: 88, opacity: showDown ? 1 : 0 }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4L6 8L10 4" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
