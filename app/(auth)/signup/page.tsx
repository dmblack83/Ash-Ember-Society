"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Toast } from "@/components/ui/toast";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";

/* See login/page.tsx for the rationale. Same flag, same effect:
   button + "or" divider hidden in production until Google's OAuth
   verification completes. */
const GOOGLE_OAUTH_ENABLED =
  process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "true";

/* ------------------------------------------------------------------
   Field wrapper — label + input stacked, consistent spacing.
   ------------------------------------------------------------------ */
function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs uppercase tracking-widest text-muted-foreground font-medium"
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive animate-fade-in">
          {error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Sign-up page

   Captures account credentials only. Profile details (display name,
   DOB, avatar, zip) are collected on /onboarding after the auth
   account is created — same form for both email and Google sign-ups,
   so the 21+ DOB gate applies uniformly.
   ------------------------------------------------------------------ */
export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const passwordTooShort = password.length > 0 && password.length < 8;

  // Clear confirm-password error as user types
  useEffect(() => {
    if (confirmPassword && password && confirmPassword === password) {
      setConfirmError(null);
    }
  }, [password, confirmPassword]);

  function validateForm(): boolean {
    let valid = true;

    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      valid = false;
    } else {
      setPasswordError(null);
    }

    if (password !== confirmPassword) {
      setConfirmError("Passwords do not match.");
      valid = false;
    } else {
      setConfirmError(null);
    }

    return valid;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validateForm()) return;

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        setFormError(authError.message);
        return;
      }

      // Proxy will route to /onboarding because onboarding_completed
      // is false in user metadata.
      router.refresh();
      router.push("/onboarding");
    } catch {
      setFormError(
        "Something went wrong. Please check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      <div className="card animate-fade-in">
        <div className="mb-8">
          <h1
            style={{ fontFamily: "var(--font-serif)" }}
            className="text-2xl font-bold text-foreground mb-1"
          >
            Join the Society
          </h1>
          <p className="text-sm text-muted-foreground">
            Create your account to get started
          </p>
        </div>

        {GOOGLE_OAUTH_ENABLED && (
          <>
            <GoogleAuthButton
              label="Sign up with Google"
              onError={(msg) => setFormError(msg)}
            />

            <div className="flex items-center gap-3 my-5">
              <span className="flex-1 h-px bg-border" />
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                or
              </span>
              <span className="flex-1 h-px bg-border" />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
          <Field id="email" label="Email">
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoComplete="email"
              required
              disabled={loading}
            />
          </Field>

          <Field
            id="password"
            label="Password"
            error={passwordError}
            hint={
              <span
                className={
                  passwordTooShort
                    ? "text-destructive"
                    : password.length >= 8
                    ? "text-emerald-500/70"
                    : ""
                }
              >
                Minimum 8 characters
                {password.length >= 8 && " ✓"}
              </span>
            }
          >
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              required
              disabled={loading}
            />
          </Field>

          <Field
            id="confirm-password"
            label="Confirm password"
            error={confirmError}
          >
            <input
              id="confirm-password"
              type="password"
              className="input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              required
              disabled={loading}
            />
          </Field>

          {formError && (
            <p role="alert" className="text-sm text-destructive animate-fade-in -mt-1">
              {formError}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full mt-1"
            disabled={loading}
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-primary hover:text-accent transition-colors duration-150 font-medium"
          >
            Log in
          </Link>
        </p>
      </div>
    </>
  );
}
