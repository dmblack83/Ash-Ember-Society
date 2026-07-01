"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppSession, type AppSession } from "@/components/system/app-session";
import { resolveSessionGate } from "@/lib/auth/session-gate";

/**
 * Session gate for static-shell routes, extracted from HumidorRoute so
 * every converted route shares one copy instead of re-implementing the
 * gate + redirect effect.
 *
 * Reads the session from AppSessionProvider, applies the same rule the
 * proxy applies (resolveSessionGate), and redirects to /login or
 * /onboarding when needed.
 *
 * `allowed` is true only when the session is ready AND the gate passed —
 * callers render their skeleton until then, and authed content after:
 *
 *   const { allowed, session } = useGatedSession();
 *   if (!allowed || !session) return <ShellSkeleton />;
 *   return <Client userId={session.userId} />;
 */
export function useGatedSession(): {
  ready:   boolean;
  session: AppSession | null;
  allowed: boolean;
} {
  const { ready, session } = useAppSession();
  const router   = useRouter();
  const pathname = usePathname();

  const gate = resolveSessionGate({
    hasSession:          session !== null,
    onboardingCompleted: session?.onboardingCompleted ?? false,
    pathname,
  });

  useEffect(() => {
    if (!ready) return;
    if (gate === "login") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (gate === "onboarding") {
      router.replace("/onboarding");
    }
  }, [ready, gate, pathname, router]);

  return { ready, session, allowed: ready && gate === "allow" && session !== null };
}
