"use client";

/* ------------------------------------------------------------------
   app/(app)/error.tsx — authenticated app error boundary

   Catches errors inside the (app) route group. Renders inside the
   (app) layout so the bottom nav is preserved — the user can navigate
   away to a working surface (Lounge, Account) without a full reload.

   Distinct from app/error.tsx, which catches errors outside the (app)
   group (auth, marketing).
   ------------------------------------------------------------------ */

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error("(app) error boundary caught:", error);
  }, [error]);

  return (
    <main
      className="flex items-center justify-center px-6"
      style={{
        // Account for the bottom nav (~72px on (app) routes) so the
        // CTAs stay visually centered in the visible area.
        minHeight: "calc(100vh - 96px)",
        paddingBottom: "calc(72px + env(safe-area-inset-bottom))",
      }}
    >
      <div className="max-w-sm text-center">
        <p
          style={{
            fontFamily:    "var(--font-mono)",
            fontSize:      10,
            fontWeight:    500,
            letterSpacing: "0.32em",
            textTransform: "uppercase",
            color:         "var(--paper-mute)",
            margin:        0,
          }}
        >
          Something went wrong
        </p>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle:  "italic",
            fontSize:   26,
            fontWeight: 500,
            color:      "var(--foreground)",
            margin:     "12px 0 0",
            lineHeight: 1.2,
          }}
        >
          We couldn&rsquo;t load this page.
        </h1>
        <p
          className="text-sm leading-relaxed mt-4 mb-6"
          style={{ color: "var(--paper-mute)" }}
        >
          A network blip or a transient server hiccup. Tap retry — it usually
          clears immediately. If it keeps happening, head back to Home.
        </p>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="btn btn-primary"
            style={{ minHeight: 44 }}
          >
            Try again
          </button>
          <Link
            href="/home"
            className="btn btn-ghost"
            style={{ minHeight: 44 }}
          >
            Back to Home
          </Link>
        </div>

        {error.digest && (
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize:   10,
              color:      "var(--paper-dim)",
              margin:     "20px 0 0",
            }}
          >
            ref: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
