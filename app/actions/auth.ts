'use server'

import { createClient }    from '@/utils/supabase/server'
import { redirect }        from 'next/navigation'
import { checkRateLimit }  from '@/lib/rate-limit'
import { trackReliability } from '@/lib/telemetry/reliability'

const SAFE_AUTH_ERRORS: Record<string, string> = {
  "Invalid login credentials":                 "Invalid email or password.",
  "Email not confirmed":                        "Please confirm your email before signing in.",
  "User already registered":                   "An account with this email already exists.",
  "Password should be at least 6 characters":  "Password must be at least 8 characters.",
  "Signup requires a valid password":           "Please enter a valid password.",
};

function sanitizeAuthError(message: string): string {
  return SAFE_AUTH_ERRORS[message] ?? "Authentication failed. Please try again.";
}

export async function signUp(formData: FormData) {
  const email    = (formData.get('email')    as string ?? '').trim().toLowerCase();
  const password = (formData.get('password') as string ?? '');

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return redirect('/signup?error=Please+enter+a+valid+email+address.');
  }
  if (!password || password.length < 8) {
    return redirect('/signup?error=Password+must+be+at+least+8+characters.');
  }
  if (password.length > 128) {
    return redirect('/signup?error=Password+is+too+long.');
  }

  const rl = await checkRateLimit(email, { limit: 10, window: "1 h", prefix: "auth-signup" });
  if (!rl.ok && rl.reason !== "rate_limit_unavailable") {
    return redirect('/signup?error=Too+many+attempts.+Try+again+later.');
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({ email, password })

  if (error) {
    return redirect(`/signup?error=${encodeURIComponent(sanitizeAuthError(error.message))}`)
  }

  return redirect('/onboarding')
}

export async function signIn(formData: FormData) {
  const email    = (formData.get('email')    as string ?? '').trim().toLowerCase();
  const password = (formData.get('password') as string ?? '');

  if (!email || !password) {
    return redirect('/login?error=Email+and+password+are+required.');
  }
  if (email.length > 254 || password.length > 128) {
    return redirect('/login?error=Invalid+email+or+password.');
  }

  const rl = await checkRateLimit(email, { limit: 10, window: "15 m", prefix: "auth-signin" });
  if (!rl.ok && rl.reason !== "rate_limit_unavailable") {
    return redirect('/login?error=Too+many+attempts.+Try+again+later.');
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return redirect(`/login?error=${encodeURIComponent(sanitizeAuthError(error.message))}`)
  }

  return redirect('/dashboard')
}

export async function signInWithGoogle() {
  /* `||` (not `??`) so an empty-string env var also falls back. The
     canonical host is `www`; bare-host fallback used to populate the
     redirect_uri Google sends users back through, which then crossed
     the PWA's manifest scope (start_url is www, scope is www) and
     iOS bailed out of standalone mode into an in-app browser that
     hit a redirect chain. */
  const siteUrlEnv = process.env.NEXT_PUBLIC_SITE_URL
  const siteUrl    = siteUrlEnv || 'https://www.ashember.vip'
  if (!siteUrlEnv) {
    trackReliability({
      bucket:  "auth_session",
      subtype: "oauth_host_drift",
      cause:   "site_url_env_empty",
      detail:  "NEXT_PUBLIC_SITE_URL was empty; fell back to www.ashember.vip",
    })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${siteUrl}/auth/callback`,
    },
  })

  if (error || !data.url) {
    return redirect(`/login?error=${encodeURIComponent("OAuth sign-in failed. Please try again.")}`)
  }

  return redirect(data.url)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return redirect('/login')
}
