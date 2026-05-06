/* ------------------------------------------------------------------
   Sentry — edge runtime

   Loaded by instrumentation.ts when NEXT_RUNTIME === "edge".
   Captures errors from edge-runtime routes (most of the (app) tree
   and proxy.ts).

   Replay and most server integrations aren't compatible with edge —
   keep this config minimal.
   ------------------------------------------------------------------ */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  release:     process.env.VERCEL_GIT_COMMIT_SHA,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
