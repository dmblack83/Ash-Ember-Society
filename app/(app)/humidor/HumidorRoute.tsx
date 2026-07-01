"use client";

import { useGatedSession } from "@/lib/auth/use-gated-session";
import { HumidorClient } from "@/components/humidor/HumidorClient";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { HumidorShellSkeleton } from "./_skeletons";

/**
 * Client entry for the static /humidor shell. Gates the session via
 * the shared useGatedSession hook (same rule the proxy applies) and
 * renders HumidorClient (which fetches its own data via SWR). While
 * the session is resolving or a redirect is pending, it shows the
 * neutral shell skeleton — never authed data.
 */
export function HumidorRoute() {
  const { allowed, session } = useGatedSession();

  if (!allowed || !session) return <HumidorShellSkeleton />;
  return (
    <PullToRefresh>
      <HumidorClient userId={session.userId} />
    </PullToRefresh>
  );
}
