"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { validateNewPassword } from "@/lib/auth/password";

/* This page is reached from a recovery email link, via /auth/callback,
   which establishes a session before redirecting here. The proxy gates
   the route behind that session, so an unauthenticated visitor is sent
   to /login before this component ever renders. We therefore assume a
   live session and let supabase.auth.updateUser() set the new password
   against it (same browser-client path the account page uses). */

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validationError = validateNewPassword(password, confirm);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateErr } = await supabase.auth.updateUser({ password });

      if (updateErr) {
        // The recovery session is short-lived; an expired one surfaces here.
        const expired = /session|expired|jwt|token/i.test(updateErr.message);
        setError(
          expired
            ? "This reset link has expired. Request a new one and try again."
            : updateErr.message,
        );
        setLoading(false);
        return;
      }

      setDone(true);
      // Keep loading true through navigation: the component unmounts before
      // a reset could fire. router.refresh() flushes server-component cache
      // so the proxy sees the refreshed session on the next navigation.
      router.refresh();
      router.push("/home");
    } catch {
      setError("Something went wrong. Please check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <div className="card animate-fade-in">
      <div className="mb-8">
        <h1
          style={{ fontFamily: "var(--font-serif)" }}
          className="text-2xl font-bold text-foreground mb-1"
        >
          Set a new password
        </h1>
        <p className="text-sm text-muted-foreground">
          Choose a password you have not used here before.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="new-password"
            className="text-xs uppercase tracking-widest text-muted-foreground font-medium"
          >
            New password
          </label>
          <input
            id="new-password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            required
            disabled={loading || done}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="confirm-password"
            className="text-xs uppercase tracking-widest text-muted-foreground font-medium"
          >
            Confirm password
          </label>
          <input
            id="confirm-password"
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            required
            disabled={loading || done}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive animate-fade-in -mt-1">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn btn-primary w-full mt-1 flex items-center justify-center gap-2"
          disabled={loading || done || !password || !confirm}
        >
          {(loading || done) && <Loader2 size={16} className="animate-spin" />}
          {done ? "Signing you in…" : loading ? "Saving…" : "Update password"}
        </button>
      </form>

      <p className="mt-7 text-center text-sm text-muted-foreground">
        Need a new link?{" "}
        <Link
          href="/forgot-password"
          className="text-primary hover:text-accent transition-colors duration-150 font-medium"
        >
          Start over
        </Link>
      </p>
    </div>
  );
}
