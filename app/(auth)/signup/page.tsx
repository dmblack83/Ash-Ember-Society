"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Toast } from "@/components/ui/toast";

/* ------------------------------------------------------------------
   Constants
   ------------------------------------------------------------------ */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

// Allow birth years from 120 years ago up to exactly 21 years ago.
const CURRENT_YEAR = new Date().getFullYear();
const MAX_BIRTH_YEAR = CURRENT_YEAR - 21;
const MIN_BIRTH_YEAR = CURRENT_YEAR - 120;

const YEARS = Array.from(
  { length: MAX_BIRTH_YEAR - MIN_BIRTH_YEAR + 1 },
  (_, i) => MAX_BIRTH_YEAR - i // descending: most-recent eligible year first
);

/* ------------------------------------------------------------------
   Age gate — returns age in whole years at today's date
   ------------------------------------------------------------------ */
function calcAge(year: number, month: number, day: number): number {
  const today = new Date();
  const dob = new Date(year, month - 1, day);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age;
}

/* ------------------------------------------------------------------
   Reusable sub-components
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
   Shared select style — matches .input but sized for select elements
   ------------------------------------------------------------------ */
const selectClass =
  "flex-1 input appearance-none cursor-pointer";

/* ------------------------------------------------------------------
   Sign-up page
   ------------------------------------------------------------------ */
export default function SignupPage() {
  const router = useRouter();

  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobDay, setDobDay] = useState("");
  const [dobYear, setDobYear] = useState("");

  // Per-field validation errors
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [dobError, setDobError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Inline password requirement indicator
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

    if (!dobMonth || !dobDay || !dobYear) {
      setDobError("Please enter your full date of birth.");
      valid = false;
    } else {
      const age = calcAge(Number(dobYear), Number(dobMonth), Number(dobDay));
      if (age < 21) {
        setDobError(
          "You must be 21 or older to use Ash & Ember Society."
        );
        valid = false;
      } else {
        setDobError(null);
      }
    }

    return valid;
  }

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);

      if (!validateForm()) return;

      setLoading(true);

      // ISO date string for metadata storage
      const dateOfBirth = `${dobYear}-${String(dobMonth).padStart(2, "0")}-${String(dobDay).padStart(2, "0")}`;

      try {
        const supabase = createClient();
        const { error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              date_of_birth: dateOfBirth,
            },
          },
        });

        if (authError) {
          setFormError(authError.message);
          return;
        }

        router.push("/onboarding");
      } catch {
        setFormError(
          "Something went wrong. Please check your connection and try again."
        );
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [email, password, confirmPassword, dobMonth, dobDay, dobYear, router]
  );

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

        <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
          {/* Email */}
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

          {/* Password */}
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

          {/* Confirm password */}
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

          {/* Date of birth */}
          <Field
            id="dob-month"
            label="Date of birth"
            error={dobError}
            hint="You must be 21 or older to join."
          >
            <div className="flex gap-2">
              {/* Month */}
              <select
                id="dob-month"
                className={selectClass}
                value={dobMonth}
                onChange={(e) => setDobMonth(e.target.value)}
                disabled={loading}
                style={{ color: dobMonth ? "var(--foreground)" : "var(--muted-foreground)" }}
              >
                <option value="" disabled>
                  Month
                </option>
                {MONTHS.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>

              {/* Day */}
              <select
                id="dob-day"
                className={selectClass}
                style={{
                  maxWidth: "5rem",
                  color: dobDay ? "var(--foreground)" : "var(--muted-foreground)",
                }}
                value={dobDay}
                onChange={(e) => setDobDay(e.target.value)}
                disabled={loading}
              >
                <option value="" disabled>
                  Day
                </option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              {/* Year */}
              <select
                id="dob-year"
                className={selectClass}
                style={{
                  maxWidth: "6.5rem",
                  color: dobYear ? "var(--foreground)" : "var(--muted-foreground)",
                }}
                value={dobYear}
                onChange={(e) => setDobYear(e.target.value)}
                disabled={loading}
              >
                <option value="" disabled>
                  Year
                </option>
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </Field>

          {/* Top-level form error */}
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
