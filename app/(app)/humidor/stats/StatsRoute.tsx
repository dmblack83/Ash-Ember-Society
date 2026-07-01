"use client";

import useSWR from "swr";
import { useGatedSession } from "@/lib/auth/use-gated-session";
import { keyFor } from "@/lib/data/keys";
import { fetchStatsData } from "@/lib/data/stats-fetchers";
import { StatsClientLazy } from "@/components/humidor/StatsClientLazy";
import { StatsShellSkeleton } from "./_skeletons";

/**
 * Client entry for the static /humidor/stats shell. Gates the session,
 * fetches raw rows and assembles chart data client-side via SWR
 * (shared pure builder in lib/stats/build-stats.ts), then renders the
 * lazy-loaded recharts client. Revisits render instantly from cache.
 */
export function StatsRoute() {
  const { allowed, session } = useGatedSession();

  const userId = session?.userId ?? null;
  const { data } = useSWR(
    allowed && userId ? keyFor.humidorStats(userId) : null,
    () => fetchStatsData(userId as string),
  );

  if (!allowed || !session || data === undefined) return <StatsShellSkeleton />;
  return <StatsClientLazy data={data} />;
}
