"use client";

import { useEffect } from "react";

/* ------------------------------------------------------------------
   ViewportMeta — client-side viewport patches.

   Next.js 16 generates the <meta name="viewport"> from the exported
   `viewport` constant (app/layout.tsx). This component runs after
   hydration to:

   1. Append `interactive-widget=resizes-content` so Android Chrome
      shrinks the content area (rather than overlaying it) when the
      software keyboard opens. This is not a standard Next.js Viewport
      field, so we inject it here.

   2. On desktop (≥ 1024 px): remove `maximum-scale=1` and
      `user-scalable=no` so pinch-zoom still works for mouse users.
      Restores them if the window shrinks back below the breakpoint.
   ------------------------------------------------------------------ */

export function ViewportMeta() {
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");

    function applyViewport(isDesktop: boolean) {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
      if (!meta) return;

      if (isDesktop) {
        // Desktop: allow pinch-zoom, keep interactive-widget for Android
        meta.content =
          "width=device-width, initial-scale=1, interactive-widget=resizes-content";
      } else {
        // Mobile: prevent iOS auto-zoom, keep interactive-widget for Android
        meta.content =
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, interactive-widget=resizes-content";
      }
    }

    applyViewport(mq.matches);
    const handler = (e: MediaQueryListEvent) => applyViewport(e.matches);
    mq.addEventListener("change", handler);

    return () => mq.removeEventListener("change", handler);
  }, []);

  return null;
}
