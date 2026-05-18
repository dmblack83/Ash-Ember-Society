"use client";

/* ------------------------------------------------------------------
   RefreshButton

   Shared mobile refresh control. The icon, sizing, and spin-while-
   pending behaviour match the Humidor toolbar refresh button in
   components/humidor/HumidorClient.tsx so the gesture reads the same
   everywhere it appears (Home masthead, Lounge header, Lounge room
   filter row, Account header).

   Default action is router.refresh() — the Next.js App Router
   server-component re-fetch. Callers that need to additionally
   invalidate client caches (SWR keys, in-component state) can pass
   an `onRefresh` handler; it runs after router.refresh() resolves.
   ------------------------------------------------------------------ */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  onRefresh?: () => void | Promise<void>;
  className?: string;
  style?:     React.CSSProperties;
  ariaLabel?: string;
}

export function RefreshButton({
  onRefresh,
  className,
  style,
  ariaLabel = "Refresh",
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const spinning = isPending || busy;

  async function handleClick() {
    if (spinning) return;
    setBusy(true);
    try {
      if (onRefresh) await onRefresh();
    } finally {
      setBusy(false);
    }
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={spinning}
      aria-label={ariaLabel}
      className={className ?? "btn btn-ghost p-2 flex-shrink-0"}
      style={style}
    >
      {/* RefreshCw — Lucide's two-arrow circular refresh glyph. Same
          stroke + size as the Humidor toolbar refresh. */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={spinning ? "animate-spin" : ""}
      >
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
        <path d="M3 21v-5h5" />
      </svg>
    </button>
  );
}
