"use client";

/* ------------------------------------------------------------------
   app/error.tsx — root-level client error boundary

   Catches errors anywhere inside the root layout (auth pages,
   marketing landing) that aren't caught by a more specific
   error.tsx (e.g. the one in app/(app)/). Renders inside the root
   layout so ThemeProvider, fonts, and the cold-open shell are
   available — no need to re-declare <html>/<body>.
   ------------------------------------------------------------------ */

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root error boundary caught:", error);
  }, [error]);

  return (
    <main
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "var(--background)" }}
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
            fontSize:   28,
            fontWeight: 500,
            color:      "var(--foreground)",
            margin:     "12px 0 0",
            lineHeight: 1.2,
          }}
        >
          The lounge had to step out for a moment.
        </h1>
        <p
          className="text-sm leading-relaxed mt-4 mb-6"
          style={{ color: "var(--paper-mute)" }}
        >
          An unexpected error interrupted the page. Try again — it usually
          clears on the second attempt.
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
            href="/"
            className="btn btn-ghost"
            style={{ minHeight: 44 }}
          >
            Back to start
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
