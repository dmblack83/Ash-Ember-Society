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
      className="fixed bottom-6 right-6 z-[60] card animate-slide-up flex items-center gap-3 max-w-xs"
      style={{ borderLeft: "4px solid var(--primary)" }}
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
