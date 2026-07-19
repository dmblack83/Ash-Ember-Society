"use client";

import useSWR from "swr";
import { keyFor, jsonFetcher } from "@/lib/data/keys";
import { fetchProfileLite } from "@/lib/data/profile-client";
import { isPaidMember } from "@/lib/membership";
import type { GoveeStatusResponse } from "@/lib/govee/types";

/* One SWR entry shared by every surface. Member-gated at the hook
   level: free-tier users never fire the /api/govee/connection fetch
   (the route would 403 it), so /home and /humidor stay request-free
   for the majority tier. The profile read reuses the keyFor.profile
   cache entry already fetched (and persisted) for Masthead/LocalShops. */
export function useGoveeStatus(userId: string | null) {
  const { data: profile } = useSWR(
    userId ? keyFor.profile(userId) : null,
    () => fetchProfileLite(userId as string),
  );
  const paid = profile != null && isPaidMember(profile);
  const { data, mutate } = useSWR(
    userId && paid ? keyFor.goveeStatus(userId) : null,
    () => jsonFetcher<GoveeStatusResponse>("/api/govee/connection"),
  );
  return { status: data, mutate };
}
