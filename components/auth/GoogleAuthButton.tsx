"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

/* ------------------------------------------------------------------
   "Continue with Google" button — used on /login and /signup.

   Triggers a full-page redirect through Google's OAuth flow.
   Supabase issues a one-time code, redirects back to /auth/callback,
   which exchanges it for a session via the existing PKCE handler.

   The button explicitly does NOT specify `next` in the redirect.
   The callback defaults to `/home`, and the proxy then redirects to
   `/onboarding` if `onboarding_completed` is false in user metadata.
   This means the same button works for first-time sign-ups and for
   returning sign-ins; the proxy decides where to land.
   ------------------------------------------------------------------ */

type Props = {
  label?: string;
  onError?: (msg: string) => void;
};

export function GoogleAuthButton({
  label = "Continue with Google",
  onError,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        onError?.(error.message);
        setLoading(false);
      }
      /* Successful start: browser navigates away to Google.
         No state cleanup needed — page is unloading. */
    } catch {
      onError?.("Could not start Google sign-in. Please try again.");
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg border border-border bg-card text-foreground text-sm font-medium hover:border-primary/40 transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <GoogleGlyph />
      <span>{loading ? "Redirecting…" : label}</span>
    </button>
  );
}

/* Google "G" mark — official 4-color logo, kept inline so the
   button has no external asset dependency. Sized to 18px to match
   common OAuth button conventions. */
function GoogleGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
