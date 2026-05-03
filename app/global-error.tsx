"use client";

/* ------------------------------------------------------------------
   global-error.tsx

   Catches errors in the root layout itself (e.g. a Provider crashes
   before anything else can render). Per Next.js docs, this file MUST
   include its own <html> and <body> because the root layout has not
   successfully rendered. Rendered without ThemeProvider, ColdOpenSmoke,
   or any other shell — keep the markup self-contained.

   Distinct from app/error.tsx, which catches errors INSIDE the
   successfully-rendered root layout.
   ------------------------------------------------------------------ */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to console in dev. Wire to telemetry (Sentry, etc.)
    // here when we add it.
    console.error("Global error boundary caught:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin:         0,
          fontFamily:     "system-ui, -apple-system, sans-serif",
          backgroundColor: "#1A1210",
          color:           "#F5E6D3",
          minHeight:       "100vh",
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "center",
          padding:         24,
        }}
      >
        <div style={{ maxWidth: 360, textAlign: "center" }}>
          <p
            style={{
              fontFamily:    "ui-monospace, 'SF Mono', Menlo, monospace",
              fontSize:      10,
              fontWeight:    500,
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              color:         "rgba(245,230,211,0.62)",
              margin:        0,
            }}
          >
            Something went wrong
          </p>
          <h1
            style={{
              fontFamily:    "Georgia, 'Times New Roman', serif",
              fontStyle:     "italic",
              fontSize:      28,
              fontWeight:    500,
              color:         "#F5E6D3",
              margin:        "12px 0 0",
              lineHeight:    1.2,
            }}
          >
            The lounge had to step out for a moment.
          </h1>
          <p
            style={{
              fontSize:   14,
              lineHeight: 1.6,
              color:      "rgba(245,230,211,0.62)",
              margin:     "16px 0 24px",
            }}
          >
            An unexpected error interrupted the app. Try again — it usually
            clears on the second attempt.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              fontFamily:    "ui-monospace, 'SF Mono', Menlo, monospace",
              fontSize:      11,
              fontWeight:    500,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color:         "#1A1210",
              background:    "#D4A04A",
              border:        "none",
              borderRadius:  999,
              padding:       "12px 28px",
              cursor:        "pointer",
              minHeight:     44,
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p
              style={{
                fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                fontSize:   10,
                color:      "rgba(245,230,211,0.38)",
                margin:     "20px 0 0",
              }}
            >
              ref: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
