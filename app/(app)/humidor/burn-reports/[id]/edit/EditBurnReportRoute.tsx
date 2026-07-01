"use client";

import useSWR from "swr";
import { notFound } from "next/navigation";
import { useGatedSession } from "@/lib/auth/use-gated-session";
import { keyFor } from "@/lib/data/keys";
import { fetchBurnReportEditBundle } from "@/lib/data/burn-report-page-fetchers";
import { BurnReport } from "@/components/humidor/BurnReport";
import { BurnReportShellSkeleton } from "@/app/(app)/humidor/[id]/burn-report/_skeletons";

/**
 * Client entry for the burn-report edit wizard. Gates the session,
 * loads the edit bundle (existing report + thirds + tags + byline +
 * report number) via SWR, then mounts the untouched BurnReport wizard
 * in edit mode with the exact prop shape the server page assembled.
 */
export function EditBurnReportRoute({ smokeLogId }: { smokeLogId: string }) {
  const { allowed, session } = useGatedSession();

  const userId = session?.userId ?? null;
  const { data } = useSWR(
    allowed && userId ? keyFor.burnReportEdit(userId, smokeLogId) : null,
    () => fetchBurnReportEditBundle(userId as string, smokeLogId),
  );

  if (!allowed || !session || data === undefined) return <BurnReportShellSkeleton />;
  if (data === null) notFound();

  return (
    <BurnReport
      mode="edit"
      existing={data.existing}
      item={data.item}
      userId={session.userId}
      flavorTags={data.flavorTags}
      partnerVideos={[]}
      displayName={data.displayName}
      city={data.city}
      reportNumber={data.reportNumber}
    />
  );
}
