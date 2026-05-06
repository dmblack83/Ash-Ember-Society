/* ------------------------------------------------------------------
   Sentry — server runtime (Node.js)

   Loaded by instrumentation.ts when NEXT_RUNTIME === "nodejs".
   Captures errors from API routes, Server Actions, and server
   components running on the Node serverless target.

   Edge-runtime routes load sentry.edge.config.ts instead.
   ------------------------------------------------------------------ */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  /* 10% transaction sampling in production. Generous enough to spot
     trends without burning the free-tier quota; tighten if needed. */
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  /* Tag releases by Vercel deployment commit so the issue stream
     groups errors per deploy. VERCEL_GIT_COMMIT_SHA is auto-injected
     by Vercel. Falls back to undefined locally — Sentry handles that. */
  release: process.env.VERCEL_GIT_COMMIT_SHA,

  /* Distinguish preview vs prod issues in the dashboard. */
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
