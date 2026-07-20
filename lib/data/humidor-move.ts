"use client";

/* Cigar move data layer: relocate humidor_items between a user's
   humidors (single item or bulk), plus a shared human-readable
   mapper for write-path network errors. Mirrors lib/data/humidors.ts
   conventions — client-side writes under own-row RLS. */

import { createClient } from "@/utils/supabase/client";
import { isLikelyOfflineError } from "@/lib/offline-outbox";

export async function moveItemsToHumidor(
  itemIds: string[],
  humidorId: string,
): Promise<void> {
  if (itemIds.length === 0) return;

  const supabase = createClient();
  const { error } = await supabase
    .from("humidor_items")
    .update({ humidor_id: humidorId })
    .in("id", itemIds);
  if (error) throw new Error(error.message);
}

/** Maps a write-path error to a message safe to show the user. No
    auto-retry lives here (double-add risk) — this is display-only;
    the call site still requires a manual retry tap. */
export function friendlyWriteError(err: unknown): string {
  if (isLikelyOfflineError(err)) {
    return "Connection hiccup. Nothing was saved. Try again.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong.";
}
