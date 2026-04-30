import { headers } from "next/headers";

export interface ServerUser {
  id:                  string;
  email:               string | null;
  onboardingCompleted: boolean;
}

/**
 * Read the current user from forwarded proxy headers.
 *
 * The root proxy (`proxy.ts`) validates the Supabase session once per request
 * and forwards the verified user via `x-ae-*` headers. Server components and
 * route handlers should call this instead of `supabase.auth.getUser()` to
 * avoid a per-page round-trip to the Supabase auth API.
 *
 * Returns null when the proxy did not authenticate a user (public route or
 * unauthenticated request). The proxy itself already redirects unauthenticated
 * requests away from protected routes, so a null return on a protected page
 * indicates either a misconfigured matcher or a Server Function — both should
 * fall back to `supabase.auth.getUser()` for safety.
 */
export async function getServerUser(): Promise<ServerUser | null> {
  const h  = await headers();
  const id = h.get("x-ae-user-id");
  if (!id) return null;
  return {
    id,
    email:               h.get("x-ae-user-email"),
    onboardingCompleted: h.get("x-ae-onboarding-completed") === "1",
  };
}
