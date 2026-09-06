"use client";

/*
 * Client-side cigar catalog fetchers.
 *
 * The Discover Cigars surface combines two access patterns:
 * - "Popular" view (no search query): top results by usage_count
 * - Search: every typed word must ILIKE the generated search_text column
 *   (tokens ANDed) — see lib/cigar-search-query.ts.
 *
 * Both share one fetcher signature so useSWRInfinite can switch
 * between them by changing only the query string in the cache key.
 * Empty query string is a valid signal for "popular".
 */

import { createClient }     from "@/utils/supabase/client";
import type { CatalogResult } from "@/components/cigar-search";
import { tokenizeSearch, toLikePattern } from "@/lib/cigar-search-query";

const CATALOG_SELECT =
  "id, brand, series, format, ring_gauge, length_inches, wrapper, wrapper_country, shade, usage_count, image_url";

export interface CigarPage {
  results: CatalogResult[];
  hasMore: boolean;
}

interface FetchArgs {
  query:     string;
  pageIndex: number;
  pageSize:  number;
  /* Exact brand filter — the catalog landing's brand drill-down. */
  brand?:    string;
}

export async function fetchCigarPage({
  query,
  pageIndex,
  pageSize,
  brand,
}: FetchArgs): Promise<CigarPage> {
  const supabase = createClient();
  const offset   = pageIndex * pageSize;
  const tokens   = tokenizeSearch(query);

  let q = supabase.from("cigar_catalog").select(CATALOG_SELECT);

  if (brand) q = q.eq("brand", brand);

  // Each token must appear somewhere in the row. Chained PostgREST
  // filters are ANDed, so every token narrows the result set.
  for (const token of tokens) {
    q = q.ilike("search_text", toLikePattern(token));
  }

  q = q
    .order("usage_count", { ascending: false })
    .order("id",          { ascending: true })
    .range(offset, offset + pageSize - 1);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const results = (data ?? []) as unknown as CatalogResult[];
  return {
    results,
    hasMore: results.length === pageSize,
  };
}

/* ── Brand index (catalog landing) ──────────────────────────────── */

/* Popularity-ranked brands via the get_catalog_brands RPC (ordering =
   summed usage_count; only the cigar count is returned/displayed).
   Pairs with keyFor.catalogBrands. */
export interface CatalogBrand {
  brand:       string;
  cigar_count: number;
}

export async function fetchCatalogBrands(): Promise<CatalogBrand[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_catalog_brands");
  if (error) throw new Error(error.message);
  return (data ?? []) as CatalogBrand[];
}

/* ── Cigar detail (public catalog row) ──────────────────────────── */

/* Same projection as the server getCigarById (lib/data/cigar-catalog.ts).
   Pairs with keyFor.cigar(cigarId); null = not found. */
export interface CigarDetailRow {
  id: string;
  brand: string | null;
  series: string | null;
  format: string | null;
  wrapper: string | null;
  wrapper_country: string | null;
  shade: string | null;
  binder_country: string | null;
  filler_countries: string[] | null;
  ring_gauge: number | null;
  length_inches: number | null;
  community_added: boolean;
  approved: boolean;
  image_url: string | null;
}

export async function fetchCigarDetail(id: string): Promise<CigarDetailRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cigar_catalog")
    .select("id, brand, series, format, wrapper, wrapper_country, shade, binder_country, filler_countries, ring_gauge, length_inches, community_added, approved, image_url")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CigarDetailRow | null) ?? null;
}

/* Per-user wishlist flag for the cigar detail page. Pairs with
   keyFor.cigarWishlisted(userId, cigarId). */
/* Pending edit-suggestion flag for the catalog detail page. RLS on
   cigar_edit_suggestions scopes the read to the caller's own rows, so
   no user filter is needed beyond auth. */
export async function fetchCigarPendingEdit(cigarId: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cigar_edit_suggestions")
    .select("status")
    .eq("cigar_id", cigarId)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

export async function fetchCigarWishlisted(userId: string, cigarId: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("humidor_items")
    .select("id")
    .eq("user_id", userId)
    .eq("cigar_id", cigarId)
    .eq("is_wishlist", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}
