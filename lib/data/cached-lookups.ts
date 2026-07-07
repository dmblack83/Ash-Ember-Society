"use client";

/*
 * Session-scoped TTL caches for small, effectively-static lookup
 * tables read client-side.
 *
 * Before the lounge static-shell conversion (#557) these reads were
 * server-side behind unstable_cache (categories 1h, flavor tags 24h)
 * on the anon client — shared and effectively free. Client-side they
 * became raw per-call queries; these helpers restore the caching at
 * the JS-session level with the same TTLs. A hard reload starts
 * fresh, which is at worst the pre-#557 first-hit cost.
 *
 * Failures are never cached: a rejected load clears the slot so the
 * next call retries.
 */

import { createClient } from "@/utils/supabase/client";
import type { ForumCategory } from "@/lib/data/forum";

const HOUR_MS = 60 * 60 * 1000;

export function ttlCache<T>(ttlMs: number, load: () => Promise<T>): () => Promise<T> {
  let slot: Promise<T> | null = null;
  let loadedAt = 0;
  return () => {
    if (!slot || Date.now() - loadedAt > ttlMs) {
      loadedAt = Date.now();
      const p = load();
      slot = p;
      p.catch(() => {
        /* Don't cache rejections — retry on next call. Only clear if
           this promise is still the active slot (a newer load may
           already have replaced it). */
        if (slot === p) slot = null;
      });
    }
    return slot;
  };
}

/* Forum categories — mirrors the server-side getAllForumCategories
   field set (lib/data/forum.ts) and its 1h revalidate. */
export const getCachedForumCategories = ttlCache<ForumCategory[]>(HOUR_MS, async () => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("forum_categories")
    .select("id, name, slug, description, sort_order, is_locked, is_gate, is_feedback")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as ForumCategory[];
});

/* Flavor tag id → name map — mirrors the server-side getFlavorTags
   24h cache (lib/data/flavor-tags.ts). Small static table. */
export const getCachedFlavorTagMap = ttlCache<Record<string, string>>(24 * HOUR_MS, async () => {
  const supabase = createClient();
  const { data, error } = await supabase.from("flavor_tags").select("id, name");
  if (error) throw new Error(error.message);
  const map: Record<string, string> = {};
  for (const t of (data ?? []) as { id: string; name: string }[]) map[t.id] = t.name;
  return map;
});
