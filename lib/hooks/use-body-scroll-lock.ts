"use client";

import { useEffect } from "react";

/**
 * iOS-safe body scroll lock, extracted from the per-sheet copies.
 *
 * Plain `overflow: hidden` doesn't stop momentum / rubber-band
 * scrolling on iOS Safari — `position: fixed` on <body> is the
 * reliable fix. Scroll position is captured on lock and restored on
 * unlock so the page doesn't jump.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top      = `-${scrollY}px`;
    document.body.style.width    = "100%";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.position = "";
      document.body.style.top      = "";
      document.body.style.width    = "";
      document.body.style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}
