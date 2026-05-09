"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Toast } from "@/components/ui/toast";

const RESEND_COOLDOWN_SECONDS = 60;

/* ------------------------------------------------------------------
   Email OTP verify form

   Reached after a successful email/password signUp() while Supabase
   "Confirm email" is enabled. The user has a 6-digit code waiting in
   their inbox; verifyOtp({ type: "email" }) consumes it and creates
   the session, after which the proxy will route on through to
   /onboarding.

   Must be wrapped in <Suspense> so useSearchParams() works under
   Next 16's static generation (same pattern as login/page.tsx).
   ------------------------------------------------------------------ */
function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // No email in URL → bounce back to /signup so we don't render a
  // verify form that can never succeed.
  useEffect(() => {
    if (!email) router.replace("/signup");
  }, [email, router]);

  // Resend cooldown ticker
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => {
      setResendCooldown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  async function verify(token: string) {
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "email",
      });

      if (verifyError) {
        // If the email is already confirmed (e.g. user re-submits an old
        // code or arrived here on a stale link), treat as success.
        if (verifyError.message.toLowerCase().includes("already")) {
          router.refresh();
          router.push("/onboarding");
          return;
        }
        setError("That code didn't work. Try again or request a new one.");
        setCode("");
        inputRef.current?.focus();
        return;
      }

      router.refresh();
      router.push("/onboarding");
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function onCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(next);
    if (error) setError(null);
    if (next.length === 6) verify(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length === 6) verify(code);
  }

  async function handleResend() {
    if (resendCooldown > 0 || !email) return;
    try {
      const supabase = createClient();
      const { error: resendError } = await supabase.auth.resend({
        email,
        type: "signup",
      });
      if (resendError) {
        setToast("Couldn't send a new code. Try again in a moment.");
        return;
      }
      setToast("New code sent");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setToast("Couldn't send a new code. Try again in a moment.");
    }
  }

  if (!email) return null;

  return (
    <>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      <div className="card animate-fade-in">
        <div className="mb-8">
          <h1
            style={{ fontFamily: "var(--font-serif)" }}
            className="text-2xl font-bold text-foreground mb-1"
          >
            Check your email
          </h1>
          <p className="text-sm text-muted-foreground">
            We sent a 6-digit code to{" "}
            <span className="text-foreground font-medium">{email}</span>. Enter
            it below to finish creating your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="code"
              className="text-xs uppercase tracking-widest text-muted-foreground font-medium"
            >
              Verification code
            </label>
            <input
              id="code"
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="one-time-code"
              autoFocus
              className="input text-center"
              style={{
                letterSpacing: "0.5rem",
                paddingLeft: "0.875rem",
                fontFamily: "var(--font-mono)",
              }}
              value={code}
              onChange={onCodeChange}
              disabled={loading}
              aria-label="Verification code"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="text-sm text-destructive animate-fade-in -mt-1"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full mt-1"
            disabled={loading || code.length !== 6}
          >
            {loading ? "Verifying…" : "Verify"}
          </button>
        </form>

        <div className="mt-6 flex flex-col gap-3 text-center text-sm">
          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="text-primary hover:text-accent transition-colors duration-150 font-medium disabled:text-muted-foreground disabled:cursor-not-allowed"
          >
            {resendCooldown > 0
              ? `Resend code in ${resendCooldown}s`
              : "Resend code"}
          </button>

          <Link
            href="/signup"
            className="text-muted-foreground hover:text-foreground transition-colors duration-150"
          >
            Wrong email? Go back
          </Link>
        </div>
      </div>
    </>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  );
}
