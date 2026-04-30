import { createClient } from "@supabase/supabase-js";

/**
 * Anonymous Supabase client — uses the public anon key, no cookies.
 *
 * Designed for use inside `unstable_cache(fn, ...)` callbacks. The cookie-
 * based server client (`utils/supabase/server.ts`) reads `cookies()`, which
 * is a dynamic API that disqualifies a function from being memoized. This
 * client is stateless and cache-safe.
 *
 * Use ONLY for fully-public reads where Row Level Security policies allow
 * anonymous access (e.g., cigar_catalog, forum_categories, shops). For
 * user-scoped queries, keep using the cookie-based server client.
 */
export function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables"
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
    },
  });
}
