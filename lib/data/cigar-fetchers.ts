"use client";

/*
 * Client-side cigar catalog fetchers.
 *
 * The Discover Cigars surface combines two access patterns:
 * - "Popular" view (no search query): top results by usage_count
 * - Search: ilike across brand / series / format
 *
 * Both share one fetcher signature so useSWRInfinite can switch
 * between them by changing only the query string in the cache key.
 * Empty query string is a valid signal for "popular".
 */

import { createClient }     from "@/utils/supabase/client";
import type { CatalogResult } from "@/components/cigar-search";

const CATALOG_SELECT =
  "id, brand, series, format, ring_gauge, length_inches, wrapper, wrapper_country, usage_count, image_url";

export interface CigarPage {
  results: CatalogResult[];
  hasMore: boolean;
}

interface FetchArgs {
  query:     string;
  pageIndex: number;
  pageSize:  number;
}

export async function fetchCigarPage({
  query,
  pageIndex,
  pageSize,
}: FetchArgs): Promise<CigarPage> {
  const supabase = createClient();
  const offset   = pageIndex * pageSize;

  let q = supabase
    .from("cigar_catalog")
    .select(CATALOG_SELECT)
    .range(offset, offset + pageSize - 1);

  if (query) {
    q = q.or(`brand.ilike.%${query}%,series.ilike.%${query}%,format.ilike.%${query}%`);
  } else {
    q = q.order("usage_count", { ascending: false });
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const results = (data ?? []) as unknown as CatalogResult[];
  return {
    results,
    hasMore: results.length === pageSize,
  };
}
