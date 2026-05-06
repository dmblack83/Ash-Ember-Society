/* ------------------------------------------------------------------
   Next.js instrumentation entrypoint

   Next 16 calls register() once per server cold start. We use it to
   load the right Sentry config for the current runtime — Sentry needs
   to know whether we're running under Node or Edge to wire the right
   transport.

   onRequestError fires for every error thrown inside a request scope
   (route handlers, server components, server actions). Sentry's
   captureRequestError forwards it to the issue stream with full
   request context attached.
   ------------------------------------------------------------------ */

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
