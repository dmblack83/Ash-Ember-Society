"use client";

/*
 * Client-side flavor tags fetch — public reference data, same
 * projection as the server `getFlavorTags` (lib/data/flavor-tags.ts).
 * Callers cache via SWR; the table is admin-managed and near-static,
 * so any SWR entry is effectively as durable as the server's 24h
 * unstable_cache.
 */

import { createClient } from "@/utils/supabase/client";
import type { FlavorTag } from "@/lib/data/flavor-tags";

export async function fetchFlavorTags(): Promise<FlavorTag[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("flavor_tags")
    .select("id, name, category")
    .order("category")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as FlavorTag[];
}
