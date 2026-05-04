"use client";

import { SWRConfig } from "swr";

/*
 * App-wide SWR provider.
 *
 * Conservative defaults — chosen to NOT inflate Supabase usage while
 * still giving us instant warm-cache reads on repeat navigations.
 *
 *   revalidateOnFocus       false   No background refetch when the
 *                                    user tabs back in. The PWA is
 *                                    long-lived; this would fire
 *                                    constantly on mobile.
 *
 *   revalidateOnReconnect   true    Refresh when the network comes
 *                                    back — covers the offline →
 *                                    online transition.
 *
 *   revalidateIfStale       true    On read, if the cached entry is
 *                                    older than `dedupingInterval`,
 *                                    fire a background refresh.
 *
 *   dedupingInterval        30000   Calls within 30s of each other
 *                                    for the same key are deduped.
 *                                    This is the dial that controls
 *                                    Supabase request volume — raise
 *                                    if usage spikes, lower if data
 *                                    feels stale.
 *
 *   keepPreviousData        true    During a key change, render the
 *                                    previous data while the next is
 *                                    loading. Eliminates the spinner
 *                                    flash on filter/page transitions.
 *
 *   shouldRetryOnError      true    Default — retry on network errors.
 *   errorRetryCount         2       Cap retries to avoid hammering
 *                                    Supabase during outages.
 *   errorRetryInterval      5000    5s between retries.
 *
 * Per-call overrides at the `useSWR` site take precedence over
 * these defaults — use them sparingly and document why.
 */
export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus:     false,
        revalidateOnReconnect: true,
        revalidateIfStale:     true,
        dedupingInterval:      30_000,
        keepPreviousData:      true,
        shouldRetryOnError:    true,
        errorRetryCount:       2,
        errorRetryInterval:    5_000,
      }}
    >
      {children}
    </SWRConfig>
  );
}
