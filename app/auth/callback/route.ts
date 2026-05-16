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

/*
 * Only allow `next` values that are unambiguously same-origin relative
 * paths. Rejects:
 *   - protocol-relative URLs (`//evil.com`, `/\evil.com`)
 *   - userinfo tricks (`@evil.com` → resolves to evil.com when concat'd to origin)
 *   - absolute URLs of any scheme
 * Falls back to `/home` on anything suspicious.
 */
function safeNext(raw: string | null): string {
  if (!raw) return "/home";
  if (!raw.startsWith("/")) return "/home";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/home";
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
