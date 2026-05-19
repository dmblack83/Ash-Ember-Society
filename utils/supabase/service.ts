import { createClient } from "@supabase/supabase-js";
import { log } from "@/lib/log";

/**
 * Service-role Supabase client — bypasses Row Level Security.
 *
 * Use ONLY in server-side code (API routes, webhook handlers, server actions).
 * NEVER import this in client components or expose to the browser.
 *
 * Required env var: SUPABASE_SERVICE_ROLE_KEY
 *
 * @deprecated Prefer `createServiceClientFor(callerId, reason)` so usage is
 * tagged for audit. Direct `createServiceClient()` calls bypass the audit
 * trail and make it harder to detect drift in RLS-bypass surface area.
 * This export is kept working for now so existing call sites compile, but
 * all new code should use `createServiceClientFor`. SEC-02 migration
 * removes remaining direct callers.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
    );
  }

  return createClient(url, key, {
    auth: {
      // Disable auto session refresh — this client is stateless per-request
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Service-role Supabase client with audit tagging.
 *
 * Every construction logs `{callerId, reason}` to the structured logger so
 * RLS-bypass usage is queryable in Sentry. The audit trail is the durable
 * fix for call-site drift: as new service-role usages land, they self-document
 * in the logs.
 *
 * @param callerId Stable identifier for the caller. Use the route path,
 *   module name, or `feature:operation` pair. Examples: `"api/admin/submissions"`,
 *   `"cron:aging-ready"`, `"stripe:webhook"`. Must be stable across deploys
 *   so log queries don't break.
 * @param reason One short sentence explaining WHY service-role is required
 *   (i.e. why a regular RLS-respecting client wouldn't work). Examples:
 *   `"fan-out push notifications across all users — RLS would scope to self"`,
 *   `"webhook from external service — no authenticated user context"`,
 *   `"admin moderation queue — admin gate runs before this call"`.
 *
 * @example
 *   const supabase = createServiceClientFor(
 *     "cron:aging-ready",
 *     "fan-out aging-ready push notifications across users"
 *   );
 */
export function createServiceClientFor(callerId: string, reason: string) {
  log.info({
    scope: "service-role:construct",
    message: `Service-role client constructed by ${callerId}`,
    callerId,
    reason,
  });
  return createServiceClient();
}
