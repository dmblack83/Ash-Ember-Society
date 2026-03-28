"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

/* ------------------------------------------------------------------
   Inline toast — appears bottom-right, auto-dismisses after 3 s.
   Lives here rather than a shared file because no toast library is
   installed yet and this is the only call site.
   ------------------------------------------------------------------ */
function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="toast fixed bottom-6 right-6 max-w-xs animate-slide-up z-50">
      <p className="text-sm text-foreground">{message}</p>
    </div>
  );
}

/* ------------------------------------------------------------------
   Field wrapper — label + input stacked, consistent spacing
   ------------------------------------------------------------------ */
function Field({
  id,
  label,
  right,
  children,
}: {
  id: string;
  label: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="text-xs uppercase tracking-widest text-muted-foreground font-medium"
        >
          {label}
        </label>
        {right}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------
   Login form — must be a separate component so useSearchParams() is
   inside a Suspense boundary (required for static generation).
   ------------------------------------------------------------------ */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Preserve intended destination across login
  const next = searchParams.get("next") ?? "/dashboard";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        // Supabase returns "Invalid login credentials" for bad email/pass.
        // Normalise to a friendlier message.
        setError(
          authError.message.toLowerCase().includes("invalid")
            ? "Invalid email or password. Please try again."
            : authError.message
        );
        return;
      }

      // router.refresh() flushes the server-component cache so the proxy
      // sees the new session cookie on the next navigation.
      router.refresh();
      router.push(next);
    } catch {
      setError("Something went wrong. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {toast && (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      )}

      <div className="card animate-fade-in">
        <div className="mb-8">
          <h1
            style={{ fontFamily: "var(--font-serif)" }}
            className="text-2xl font-bold text-foreground mb-1"
          >
            Welcome back
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to continue to your lounge
          </p>
        </div>

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
            right={
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-primary transition-colors duration-150"
                onClick={() => setToast("Coming soon")}
              >
                Forgot password?
              </button>
            }
          >
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              disabled={loading}
            />
          </Field>

          {error && (
            <p role="alert" className="text-sm text-destructive animate-fade-in -mt-1">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full mt-1"
            disabled={loading}
          >
            {loading ? "Signing in…" : "Log in"}
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-primary hover:text-accent transition-colors duration-150 font-medium"
          >
            Sign up
          </Link>
        </p>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
