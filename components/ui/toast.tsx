"use client";

import { useEffect } from "react";

/* ------------------------------------------------------------------
   Shared Toast — bottom-right, amber left border, auto-dismisses 3s.
   ------------------------------------------------------------------ */

export function Toast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className="fixed right-4 z-[60] card animate-slide-up flex items-center gap-3 bottom-[calc(72px+env(safe-area-inset-bottom))] lg:bottom-6"
      style={{
        /* Respect the desktop side rail at lg+: --app-content-left
           is 0 below the breakpoint and the rail's width above, so
           the toast clears the rail without overlap. */
        left:       "calc(var(--app-content-left) + 1rem)",
        borderLeft: "4px solid var(--primary)",
        maxWidth:   480,
        margin:     "0 auto",
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        className="flex-shrink-0"
        style={{ color: "var(--primary)" }}
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M5 8L7 10L11 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="text-sm text-foreground">{message}</p>
    </div>
  );
}
