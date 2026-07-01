"use client";

import useSWR from "swr";
import { notFound } from "next/navigation";
import { useGatedSession } from "@/lib/auth/use-gated-session";
import { keyFor } from "@/lib/data/keys";
import { fetchBurnReportCreateBundle } from "@/lib/data/burn-report-page-fetchers";
import { BurnReport } from "@/components/humidor/BurnReport";
import { BurnReportShellSkeleton } from "./_skeletons";

/**
 * Client entry for the burn-report create wizard. Gates the session,
 * loads the create bundle (item + tags + byline + report number +
 * partner videos) via SWR, then mounts the untouched BurnReport
 * wizard with the exact prop shape the server page used to assemble.
 */
export function BurnReportCreateRoute({ itemId }: { itemId: string }) {
  const { allowed, session } = useGatedSession();

  const userId = session?.userId ?? null;
  const { data } = useSWR(
    allowed && userId ? keyFor.burnReportCreate(userId, itemId) : null,
    () => fetchBurnReportCreateBundle(userId as string, itemId),
  );

  if (!allowed || !session || data === undefined) return <BurnReportShellSkeleton />;
  if (data === null) notFound();

  return (
    <BurnReport
      item={data.item}
      userId={session.userId}
      flavorTags={data.flavorTags}
      partnerVideos={data.partnerVideos}
      displayName={data.displayName}
      city={data.city}
      reportNumber={data.nextReportNumber}
    />
  );
}
