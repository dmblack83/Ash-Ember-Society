"use client";

import useSWR from "swr";
import { keyFor } from "@/lib/data/keys";
import { fetchHumidors } from "@/lib/data/humidors";

/* One SWR entry for the user's humidors (own-row RLS read; no API
   route, no member gate needed — free users simply have one row). */
export function useHumidors(userId: string | null) {
  const { data, mutate } = useSWR(
    userId ? keyFor.humidors(userId) : null,
    () => fetchHumidors(userId as string),
  );
  return { humidors: data, mutate };
}
