"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppSession } from "@/components/system/app-session";
import { resolveSessionGate } from "@/lib/auth/session-gate";

/**
 * Client auth gate for the static /home shell. Reads the session from
 * AppSessionProvider and applies the same rule the proxy applies
 * (resolveSessionGate), redirecting to /login or /onboarding when needed.
 * Renders nothing — the user-data islands each show their own skeleton until
 * the session is ready, and the public News server island renders regardless.
 */
export function HomeAuthGate() {
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

  return null;
}
