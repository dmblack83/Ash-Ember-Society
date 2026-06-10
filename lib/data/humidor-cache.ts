"use client";

import { mutate } from "swr";
import { keyFor } from "./keys";
import { fetchHumidorItems, fetchHasWishlistItems } from "./humidor-fetchers";

/* Re-pull the Humidor list + wishlist-count into the shared SWR cache.
   Call after any write to humidor_items that happens OUTSIDE the Humidor
   list (item detail, add sheet, cigar actions, burn report). The list
   uses revalidateOnMount:false, so without this it stays stale until a
   manual refresh.

   We pass fresh data (the fetcher's promise), not a bare mutate(key),
   because the list component is unmounted at these call sites and has no
   key-bound fetcher registered. revalidate:false — the data we pass IS
   fresh, no extra round-trip.

   Fire-and-forget after an already-successful write: the helper swallows
   its own errors. A failed background refresh leaves the prior cache in
   place; SWR's revalidateOnReconnect + the manual refresh button recover
   it. Never block the user's flow or surface an error here. */
export async function revalidateHumidor(userId: string): Promise<void> {
  /* allSettled (not all) so a failure refreshing one key doesn't abort
     the other — best-effort refresh of both. It never rejects, so the
     fire-and-forget contract holds with no try/catch: a failed branch
     just leaves that key's prior cache in place, and SWR's
     revalidateOnReconnect + the manual refresh button recover it. */
  await Promise.allSettled([
    mutate(keyFor.humidorItems(userId), fetchHumidorItems(userId),     { revalidate: false }),
    mutate(keyFor.hasWishlist(userId),  fetchHasWishlistItems(userId), { revalidate: false }),
  ]);
}
