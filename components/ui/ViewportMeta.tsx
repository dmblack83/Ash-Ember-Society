"use client";

import { useEffect } from "react";

/* ------------------------------------------------------------------
   ViewportMeta — client-side viewport and keyboard behaviour patches.

   1. Desktop (≥ 1024 px): strips maximum-scale=1 so users can still
      pinch-zoom on wide screens.

   2. iOS focusout: resets window.scrollY to 0 after the software
      keyboard dismisses — prevents the page staying shifted up.
   ------------------------------------------------------------------ */

export function ViewportMeta() {
  useEffect(() => {
    /* ── Desktop: remove maximum-scale restriction ─────────────── */
    const mq = window.matchMedia("(min-width: 1024px)");

    function applyViewport(isDesktop: boolean) {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
      if (!meta) return;
      if (isDesktop) {
        meta.content =
          "width=device-width, initial-scale=1, interactive-widget=resizes-content";
      } else {
        meta.content =
          "width=device-width, initial-scale=1, maximum-scale=1, interactive-widget=resizes-content";
      }
    }

    applyViewport(mq.matches);
    const handler = (e: MediaQueryListEvent) => applyViewport(e.matches);
    mq.addEventListener("change", handler);

    /* ── iOS: reset scroll after keyboard dismisses ────────────── */
    function handleFocusOut() {
      // Small delay so the keyboard has fully closed before we scroll
      setTimeout(() => window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }), 100);
    }
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      mq.removeEventListener("change", handler);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  return null;
}
