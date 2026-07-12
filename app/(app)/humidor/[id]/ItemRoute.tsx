"use client";

import useSWR from "swr";
import { notFound } from "next/navigation";
import { useGatedSession } from "@/lib/auth/use-gated-session";
import { keyFor } from "@/lib/data/keys";
import { fetchHumidorItemBundle } from "@/lib/data/humidor-item-fetchers";
import { HumidorItemClient } from "@/components/humidor/HumidorItemClient";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { ItemShellSkeleton } from "./_skeletons";

/**
 * Client entry for the /humidor/[id] shell. Gates the session, loads
 * the full item bundle via SWR (ownership enforced by RLS + explicit
 * eq in the fetcher), and renders HumidorItemClient with the exact
 * prop shape the server page used to assemble. Tapping an item from
 * the humidor list now paints this skeleton instantly instead of
 * waiting on a server render; revisits render from the SWR cache.
 */
export function ItemRoute({ itemId }: { itemId: string }) {
  const { allowed, session } = useGatedSession();

  const userId = session?.userId ?? null;
  const { data } = useSWR(
    allowed && userId ? keyFor.humidorItemBundle(userId, itemId) : null,
    () => fetchHumidorItemBundle(userId as string, itemId),
  );

  if (!allowed || !session || data === undefined) return <ItemShellSkeleton />;
  if (data === null) notFound();

  return (
    <PullToRefresh>
      <HumidorItemClient
        item={data.item}
        initialSmokeLogs={data.smokeLogs}
        userId={session.userId}
        hasPending={data.hasPending}
        hasApproved={data.hasApproved}
        hasPendingEdit={data.hasPendingEdit}
      />
    </PullToRefresh>
  );
}
