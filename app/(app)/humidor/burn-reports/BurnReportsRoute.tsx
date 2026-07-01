"use client";

import useSWR from "swr";
import { useGatedSession } from "@/lib/auth/use-gated-session";
import { keyFor } from "@/lib/data/keys";
import { fetchBurnReportsBundle } from "@/lib/data/burn-reports-fetchers";
import { BurnReportsClient } from "@/components/humidor/BurnReportsClient";
import BurnReportsLoading from "./loading";

/**
 * Client entry for the static /humidor/burn-reports shell. Gates the
 * session, loads the full reports bundle (reports + flavor tags +
 * byline) via SWR, then renders BurnReportsClient with the exact prop
 * shape the server page used to assemble. Revisits render instantly
 * from cache while a background revalidation runs.
 */
export function BurnReportsRoute() {
  const { allowed, session } = useGatedSession();

  const userId = session?.userId ?? null;
  const { data } = useSWR(
    allowed && userId ? keyFor.burnReports(userId) : null,
    () => fetchBurnReportsBundle(userId as string),
  );

  if (!allowed || !session || data === undefined) return <BurnReportsLoading />;
  return (
    <BurnReportsClient
      reports={data.reports}
      flavorTags={data.flavorTags}
      displayName={data.displayName}
      city={data.city}
    />
  );
}
