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

  /* Send IP, request headers, etc. on captured events. Helps debugging;
     Sentry's default scrubbers strip the obvious secrets (passwords,
     auth tokens) before storage. */
  sendDefaultPii: true,

  /* Attach local variable values to stack frames. Massively easier
     debugging — you see the actual values that triggered the throw,
     not just the variable names. Server-side only (Edge can't). */
  includeLocalVariables: true,

  /* Sentry Logs product: console.* and structured log calls become
     queryable events in the dashboard. Pairs with the structured
     logging wrapper landing in the next PR. */
  enableLogs: true,

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
