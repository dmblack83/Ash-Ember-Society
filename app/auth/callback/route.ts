import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

/*
 * Auth callback route — exchanges a one-time code for a session.
 *
 * Supabase redirects here after:
 *  - Email confirmation links
 *  - Magic link sign-ins
 *  - OAuth provider flows
 *
 * The `code` search param is a short-lived PKCE verifier. We exchange
 * it server-side so the session is written into a secure HttpOnly cookie
 * by the Supabase SSR client, never exposed to the browser directly.
 *
 * The optional `next` param lets the caller specify a post-auth redirect.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Redirect to the intended destination (or /dashboard by default).
      // Using `origin` keeps the redirect on the same domain.
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Exchange failed — redirect to login with a descriptive error param.
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
