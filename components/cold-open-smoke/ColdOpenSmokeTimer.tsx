"use client";

import { useEffect } from "react";

/* ------------------------------------------------------------------
   ColdOpenSmokeTimer

   Tiny client-only companion to <ColdOpenSmoke />. Reads the class
   set synchronously by the inline init script in <head>; if active,
   schedules the fade-out and unmount.

   Total visible time is 4 s: 3 s at full opacity, 1 s opacity fade,
   then the active class is removed and the overlay disappears.
   ------------------------------------------------------------------ */

const VISIBLE_MS = 3000;
const FADE_MS    = 1000;

export function ColdOpenSmokeTimer() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains("cold-smoke-active")) return;

    const tFade = setTimeout(
      () => root.classList.add("cold-smoke-fading"),
      VISIBLE_MS,
    );
    const tRemove = setTimeout(
      () => root.classList.remove("cold-smoke-active", "cold-smoke-fading"),
      VISIBLE_MS + FADE_MS,
    );

    return () => {
      clearTimeout(tFade);
      clearTimeout(tRemove);
    };
  }, []);

  return null;
}
