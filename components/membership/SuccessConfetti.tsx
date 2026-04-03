"use client";

import { useEffect } from "react";
import type confetti from "canvas-confetti";

/**
 * Fires a branded confetti burst on mount.
 * Uses amber, gold, and ember colors — no generic rainbow.
 */
export function SuccessConfetti() {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let confetti: ((opts?: confetti.Options) => void) | null = null;

    import("canvas-confetti").then((mod) => {
      confetti = (mod.default ?? mod) as (opts?: confetti.Options) => void;

      const COLORS = [
        "#C17817", // --primary (amber)
        "#D4A04A", // --accent (gold)
        "#E8642C", // --ember
        "#F5E6D3", // --foreground (warm cream)
        "#8B5A0A", // deep amber
        "#A07030", // mid-tone gold
      ];

      /* First burst — wide, centered */
      confetti({
        particleCount: 80,
        spread: 80,
        origin: { x: 0.5, y: 0.55 },
        colors: COLORS,
        gravity: 0.9,
        scalar: 1.1,
        ticks: 200,
      });

      /* Second burst — slight left offset, delayed */
      setTimeout(() => {
        confetti?.({
          particleCount: 50,
          spread: 60,
          angle: 70,
          origin: { x: 0.25, y: 0.6 },
          colors: COLORS,
          gravity: 1,
          scalar: 0.9,
        });
      }, 200);

      /* Third burst — right offset */
      setTimeout(() => {
        confetti?.({
          particleCount: 50,
          spread: 60,
          angle: 110,
          origin: { x: 0.75, y: 0.6 },
          colors: COLORS,
          gravity: 1,
          scalar: 0.9,
        });
      }, 400);
    });
  }, []);

  // Renders nothing — purely a side-effect component
  return null;
}
