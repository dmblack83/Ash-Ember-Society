"use client";

import useSWR from "swr";
import { useGatedSession } from "@/lib/auth/use-gated-session";
import { keyFor } from "@/lib/data/keys";
import { fetchWishlistItems } from "@/lib/data/humidor-fetchers";
import { WishlistClient } from "@/components/humidor/WishlistClient";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { WishlistShellSkeleton } from "./_skeletons";

/**
 * Client entry for the static /humidor/wishlist shell. Gates the
 * session, loads the wishlist via SWR, then hands the rows to
 * WishlistClient as `initialItems` — the same key WishlistClient
 * subscribes to internally, so its optimistic mutations keep writing
 * to the shared cache entry and revisits render instantly from cache.
 */
export function WishlistRoute() {
  const { allowed, session } = useGatedSession();

  const userId = session?.userId ?? null;
  const { data: items } = useSWR(
    allowed && userId ? keyFor.wishlist(userId) : null,
    () => fetchWishlistItems(userId as string),
  );

  if (!allowed || !session || items === undefined) return <WishlistShellSkeleton />;
  return (
    <PullToRefresh>
      <WishlistClient initialItems={items} userId={session.userId} />
    </PullToRefresh>
  );
}
