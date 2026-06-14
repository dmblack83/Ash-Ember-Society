"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppSession } from "@/components/system/app-session";
import { resolveSessionGate } from "@/lib/auth/session-gate";
import { HumidorClient } from "@/components/humidor/HumidorClient";
import { HumidorShellSkeleton } from "./_skeletons";

/**
 * Client entry for the static /humidor shell. Reads the session from
 * AppSessionProvider, applies the same gate the proxy applies, and
 * renders HumidorClient (which fetches its own data via SWR). While the
 * session is resolving or a redirect is pending, it shows the neutral
 * shell skeleton — never authed data.
 */
export function HumidorRoute() {
  const { ready, session } = useAppSession();
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;
    const gate = resolveSessionGate({
      hasSession:          session !== null,
      onboardingCompleted: session?.onboardingCompleted ?? false,
      pathname,
    });
    if (gate === "login") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (gate === "onboarding") {
      router.replace("/onboarding");
    }
  }, [ready, session, pathname, router]);

  if (!ready || !session) return <HumidorShellSkeleton />;
  return <HumidorClient userId={session.userId} />;
}
