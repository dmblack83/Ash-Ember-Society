import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses Row Level Security.
 *
 * Use ONLY in server-side code (API routes, webhook handlers, server actions).
 * NEVER import this in client components or expose to the browser.
 *
 * Required env var: SUPABASE_SERVICE_ROLE_KEY
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
