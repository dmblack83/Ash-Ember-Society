"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, MailCheck } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

/* Where the recovery link lands. Supabase sends the user to its verify
   endpoint, which redirects here with a one-time `code`. /auth/callback
   exchanges that code for a session, then forwards to `next`. The
   reset-password page is proxy-gated, so it is only reachable once that
   session cookie exists. */
const RESET_REDIRECT_NEXT = "/reset-password";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
        RESET_REDIRECT_NEXT,
      )}`;
      // Supabase resolves successfully whether or not the address has an
      // account, by design, so we never reveal which emails are registered.
      await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    } catch {
      // Swallow: surfacing transport errors here would also leak timing
      // signal. The neutral confirmation below is shown regardless.
    } finally {
      setLoading(false);
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div className="card animate-fade-in">
        <div className="flex flex-col items-center text-center gap-4">
          <span
            className="flex items-center justify-center rounded-full"
            style={{
              width: 56,
              height: 56,
              background: "rgba(212,160,74,0.15)",
              color: "var(--gold, #D4A04A)",
            }}
          >
            <MailCheck size={26} />
          </span>
          <h1
            style={{ fontFamily: "var(--font-serif)" }}
            className="text-2xl font-bold text-foreground"
          >
            Check your email
          </h1>
          <p className="text-sm text-muted-foreground">
            If an account exists for that address, we just sent a link to
            reset your password. It expires in one hour.
          </p>
          <Link
            href="/login"
            className="btn btn-primary w-full mt-2 flex items-center justify-center"
          >
            Back to log in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card animate-fade-in">
      <div className="mb-8">
        <h1
          style={{ fontFamily: "var(--font-serif)" }}
          className="text-2xl font-bold text-foreground mb-1"
        >
          Reset your password
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter your email and we will send you a link to set a new one.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="email"
            className="text-xs uppercase tracking-widest text-muted-foreground font-medium"
          >
            Email
          </label>
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
        </div>

        <button
          type="submit"
          className="btn btn-primary w-full mt-1 flex items-center justify-center gap-2"
          disabled={loading || !email}
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-7 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link
          href="/login"
          className="text-primary hover:text-accent transition-colors duration-150 font-medium"
        >
          Back to log in
        </Link>
      </p>
    </div>
  );
}
