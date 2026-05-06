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

/* Wires up Next.js App Router transitions to Sentry's tracing — lets
   page-to-page navigations show up as discrete spans in the traces UI.
   Imported by name in app/layout.tsx is NOT required; Next 16 looks
   up this export automatically. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
