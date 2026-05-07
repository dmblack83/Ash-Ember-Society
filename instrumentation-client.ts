/* ------------------------------------------------------------------
   Sentry — client runtime

   Loaded automatically by Next 16 on the client. Captures unhandled
   errors and promise rejections in the browser, plus the Web Vitals
   instrumentation Sentry wires up by default.

   Replay and Feedback integrations are intentionally off:
   - Replay adds ~80KB gzipped — not justified yet given Sentry isn't
     yet our primary debugging channel.
   - Feedback duplicates the existing in-app feedback UI.
   Both are easy to add later via Sentry.replayIntegration() /
   Sentry.feedbackIntegration() once the team is using the dashboard.
   ------------------------------------------------------------------ */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  /* Send IP + cookies on captured events. Helps debugging but means
     the data IS PII — Sentry's "scrub" defaults strip the obvious
     stuff (passwords, auth tokens) before storage. */
  sendDefaultPii: true,

  /* Sentry Logs product — console.* and structured log calls become
     queryable events. Pairs with the structured logging wrapper
     landing in the next PR. */
  enableLogs: true,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  release:     process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
});

/* ------------------------------------------------------------------
   CSP violation reporter

   Browsers fire `securitypolicyviolation` events on the Document
   whenever a directive (script-src, connect-src, img-src, etc.)
   blocks a resource. Without this listener those events go
   nowhere — the CSP header alone is silent.

   Sentry doesn't auto-instrument CSP violations. Hook them in
   manually as a structured message so they show up alongside other
   issues in the dashboard. Tagged for easy filtering.

   Sample rate: 100% in production. Violations are rare-by-design
   (the policy is allowlist-based) so volume should be low; if a
   storm hits, we want to see it immediately rather than sample it
   away. Bump to 0.1 if it ever floods.
   ------------------------------------------------------------------ */
if (typeof window !== "undefined") {
  document.addEventListener("securitypolicyviolation", (event) => {
    /* Defensive: ignore violations from extensions or devtools that
       don't carry a real `effectiveDirective`. */
    if (!event.effectiveDirective && !event.violatedDirective) return;

    Sentry.captureMessage(
      `CSP violation: ${event.effectiveDirective || event.violatedDirective}`,
      {
        level: "warning",
        tags: {
          type:               "csp",
          effective_directive: event.effectiveDirective || "unknown",
          disposition:         event.disposition || "enforce",
        },
        extra: {
          blockedURI:         event.blockedURI,
          violatedDirective:  event.violatedDirective,
          originalPolicy:     event.originalPolicy?.slice(0, 500),
          documentURI:        event.documentURI,
          sourceFile:         event.sourceFile,
          lineNumber:         event.lineNumber,
          columnNumber:       event.columnNumber,
          sample:             event.sample?.slice(0, 200),
        },
      },
    );
  });
}

/* Wires up Next.js App Router transitions to Sentry's tracing — lets
   page-to-page navigations show up as discrete spans in the traces UI.
   Imported by name in app/layout.tsx is NOT required; Next 16 looks
   up this export automatically. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
