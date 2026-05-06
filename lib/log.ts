import * as Sentry from "@sentry/nextjs";

/* ------------------------------------------------------------------
   Structured logging.

   Replaces ad-hoc `console.error("[scope] message", err)` calls with
   a typed payload that:

     1. Sends the event to Sentry's Logs product (queryable in the
        dashboard alongside issues + traces). Requires enableLogs:true
        in the Sentry init configs — already set.

     2. Captures Errors as Sentry exceptions so they show up in the
        Issues stream with full stack trace + breadcrumbs (only when
        the `error` field is an actual Error instance and level is
        "error").

     3. Always emits to the console — production logs to Vercel
        function logs as single-line JSON (greppable, log-aggregator
        friendly); development pretty-prints for human reading.

   Usage:

     import { log } from "@/lib/log";

     log.error({ scope: "webhook", message: "signature failed",
                 event_id, error: err });

     log.warn({ scope: "cron:aging-ready", message: "user push send failed",
                user_id, error: err });

     log.info({ scope: "stripe:webhook", message: "subscription created",
                user_id, tier });

   Required field is `scope` — a stable identifier for the source
   (route name, module name, "feature:operation" pair). Consistent
   scopes make logs queryable. Anything else is structured fields.

   Existing console.error sites are NOT migrated by this PR — that's
   an ongoing maintenance task. Use this wrapper in new code.
   ------------------------------------------------------------------ */

type Level = "error" | "warn" | "info" | "debug";

export interface LogPayload {
  /** Stable scope identifier — route, module, or "feature:operation". */
  scope: string;
  /** Human-readable summary. Optional but recommended for searchability. */
  message?: string;
  /** Error object (or any value). For level="error", Error instances also
      go to Sentry as exceptions via captureException. */
  error?: unknown;
  /** Arbitrary structured fields (user_id, event_id, duration_ms, ...). */
  [key: string]: unknown;
}

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}

function emit(level: Level, payload: LogPayload): void {
  const { scope, message, error, ...rest } = payload;
  const summary = message ?? level;

  /* ── Sentry Logs ─────────────────────────────────────────────── */
  const sentryFields: Record<string, unknown> = { scope, ...rest };
  if (error !== undefined) sentryFields.error = serializeError(error);
  Sentry.logger?.[level]?.(`[${scope}] ${summary}`, sentryFields);

  /* ── Sentry Issues — only for genuine Error instances at error level.
        Avoids spam from level="info" diagnostics that pass an `error`
        field for context. */
  if (level === "error" && error instanceof Error) {
    Sentry.captureException(error, { tags: { scope } });
  }

  /* ── Console ─────────────────────────────────────────────────── */
  const consoleFn =
    level === "debug" ? console.log
    : level === "info"  ? console.info
    : level === "warn"  ? console.warn
    : console.error;

  if (process.env.NODE_ENV === "production") {
    /* Single-line JSON — Vercel log search and external aggregators
       parse this directly. */
    consoleFn(JSON.stringify({
      level,
      scope,
      message: summary,
      ...rest,
      ...(error !== undefined && { error: serializeError(error) }),
    }));
  } else {
    /* Dev: pretty per-call. console.error/warn render the `error`
       arg specially so the stack is clickable in browser DevTools
       and Node terminals. */
    const prefix = `[${scope}]`;
    if (error !== undefined && Object.keys(rest).length > 0) {
      consoleFn(prefix, summary, rest, error);
    } else if (error !== undefined) {
      consoleFn(prefix, summary, error);
    } else if (Object.keys(rest).length > 0) {
      consoleFn(prefix, summary, rest);
    } else {
      consoleFn(prefix, summary);
    }
  }
}

export const log = {
  error: (payload: LogPayload) => emit("error", payload),
  warn:  (payload: LogPayload) => emit("warn",  payload),
  info:  (payload: LogPayload) => emit("info",  payload),
  debug: (payload: LogPayload) => emit("debug", payload),
};
