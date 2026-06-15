import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

/*
 * Email OTP confirmation route — verifies a token_hash and establishes a
 * session, all on our own domain.
 *
 * Used by transactional auth emails (currently password recovery) whose
 * templates link to {{ .SiteURL }}/auth/confirm?token_hash=…&type=…&next=…
 * instead of Supabase's default {{ .ConfirmationURL }}. Two wins over the
 * supabase.co verify link:
 *   1. The link domain matches the sender domain (ashember.vip), removing
 *      the phishing-shaped mismatch that pushed reset emails to spam.
 *   2. verifyOtp(token_hash) needs no PKCE code_verifier, so the link works
 *      even when opened on a different device than the one that requested it.
 *
 * /auth/callback remains for the PKCE code-exchange flows (OAuth, magic
 * link, signup confirmation) that do round-trip through Supabase.
 */

/*
 * Only allow `next` values that are unambiguously same-origin relative
 * paths. Mirrors the guard in /auth/callback. Rejects protocol-relative
 * URLs, backslash tricks, and absolute URLs of any scheme.
 */
function safeNext(raw: string | null): string {
  if (!raw) return "/home";
  if (!raw.startsWith("/")) return "/home";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/home";
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_confirm_failed`);
}
