"use client";

import useSWR from "swr";
import { keyFor, jsonFetcher } from "@/lib/data/keys";
import type { GoveeStatusResponse } from "@/lib/govee/types";

/* One SWR entry shared by every surface. SWR's provider defaults
   handle focus/reconnect revalidation; no bespoke visibility code. */
export function useGoveeStatus(userId: string | null) {
  const { data, mutate } = useSWR(
    userId ? keyFor.goveeStatus(userId) : null,
    () => jsonFetcher<GoveeStatusResponse>("/api/govee/connection"),
  );
  return { status: data, mutate };
}
