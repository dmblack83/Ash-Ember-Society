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
import { childToLine, type CatalogLine, type SizeChild } from "@/lib/cigars/line-group";

const CATALOG_SELECT =
  "id, brand, series, name, format, ring_gauge, length_inches, wrapper, wrapper_country, shade, usage_count, image_url";

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
  name: string | null;
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
  /* Parent line link — null until the cigar_lines backfill ran or
     for null-brand rows. Drives the admin line editor. */
  line_id: string | null;
}

export async function fetchCigarDetail(id: string): Promise<CigarDetailRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cigar_catalog")
    .select("id, brand, series, name, format, wrapper, wrapper_country, shade, binder_country, filler_countries, ring_gauge, length_inches, community_added, approved, image_url, line_id")
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

/* ── Line-grouped browse (consolidated catalog) ─────────────────── */

export interface CatalogLinePage {
  lines:   CatalogLine[];
  hasMore: boolean;
  /* false = the get_catalog_lines RPC is missing (migration not yet
     applied) and this page fell back to ungrouped child rows. */
  grouped: boolean;
}

interface CatalogLineRpcRow {
  brand: string | null; series: string | null;
  wrapper: string | null; shade: string | null;
  size_count: number; rep_id: string; image_url: string | null;
  total_usage: number;
}

/* PostgREST "function not found" — the manual-apply migration hasn't
   run yet. Every new RPC caller degrades on this. */
function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || /function .* does not exist|not find the function/i.test(error.message ?? "");
}

export async function fetchCatalogLines({
  query,
  brand,
  pageIndex,
  pageSize,
}: {
  query: string; brand?: string; pageIndex: number; pageSize: number;
}): Promise<CatalogLinePage> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_catalog_lines", {
    p_search: query || null,
    p_brand:  brand || null,
    p_offset: pageIndex * pageSize,
    p_limit:  pageSize,
  });

  if (error) {
    if (!isMissingFunction(error)) throw new Error(error.message);
    /* Fallback: ungrouped child rows, one card each (today's list). */
    const page = await fetchCigarPage({ query, brand, pageIndex, pageSize });
    return { lines: page.results.map(childToLine), hasMore: page.hasMore, grouped: false };
  }

  const rows = (data ?? []) as CatalogLineRpcRow[];
  return {
    lines: rows.map((r) => ({
      brand: r.brand, series: r.series, wrapper: r.wrapper, shade: r.shade,
      sizeCount: Number(r.size_count), repId: r.rep_id, imageUrl: r.image_url,
    })),
    hasMore: rows.length === pageSize,
    grouped: true,
  };
}

/* ── Line siblings (detail size picker) ─────────────────────────── */

/* All size rows of the tapped child's line, via (brand, series)
   equality — identical to line grouping post-backfill and correct
   before any migration runs. */
export async function fetchLineSiblings(
  brand:  string,
  series: string | null,
): Promise<SizeChild[]> {
  const supabase = createClient();
  let q = supabase
    .from("cigar_catalog")
    .select("id, name, format, ring_gauge, length_inches, image_url, shade, wrapper, wrapper_country, binder_country, filler_countries, community_added, approved")
    .eq("brand", brand);
  q = series === null ? q.is("series", null) : q.eq("series", series);
  const { data, error } = await q
    .order("ring_gauge", { ascending: true, nullsFirst: false })
    .order("length_inches", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SizeChild[];
}

/* ── Manual-add insert (create-or-attach RPC) ───────────────────── */

/* Calls insert_cigar_to_catalog. The v3 RPC adds p_name; while the
   migration hasn't been applied (v2 live), a named-arg call carrying
   p_name matches no signature — retry without it so manual adds never
   break on deploy order. */
export async function insertCigarToCatalog(
  args: Record<string, unknown>,
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("insert_cigar_to_catalog", args);
  if (!error && data) return data as string;
  if (error && isMissingFunction(error) && "p_name" in args) {
    const v2Args = { ...args };
    delete v2Args.p_name;
    const retry = await supabase.rpc("insert_cigar_to_catalog", v2Args);
    if (!retry.error && retry.data) return retry.data as string;
    throw new Error(retry.error?.message ?? "Failed to save cigar to catalog.");
  }
  throw new Error(error?.message ?? "Failed to save cigar to catalog.");
}

/* ── Manual-add dupe check ──────────────────────────────────────── */

export interface LineMatch {
  similarity: number;
  line: {
    brand: string; series: string | null;
    wrapper: string | null; shade: string | null;
    wrapper_country: string | null; binder_country: string | null;
    filler_countries: string[] | null;
  };
  children: SizeChild[];
}

interface MatchRpcRow {
  similarity: number; brand: string; series: string | null;
  wrapper: string | null; shade: string | null;
  wrapper_country: string | null; binder_country: string | null;
  filler_countries: string[] | null;
  child_id: string; child_format: string | null;
  child_ring_gauge: number | null; child_length_inches: number | null;
}

/* null = no match above threshold OR the RPC is missing (dupe check
   silently skipped — creation is never blocked). */
export async function matchCigarLines(
  brand:  string,
  series: string | null,
): Promise<LineMatch | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("match_cigar_lines", {
    p_brand:  brand,
    p_series: series,
  });
  if (error) {
    if (isMissingFunction(error)) return null;
    throw new Error(error.message);
  }
  const rows = (data ?? []) as MatchRpcRow[];
  if (rows.length === 0) return null;
  const first = rows[0];
  return {
    similarity: first.similarity,
    line: {
      brand: first.brand, series: first.series,
      wrapper: first.wrapper, shade: first.shade,
      wrapper_country: first.wrapper_country,
      binder_country: first.binder_country,
      filler_countries: first.filler_countries,
    },
    children: rows.map((r) => ({
      id: r.child_id, format: r.child_format,
      ring_gauge: r.child_ring_gauge, length_inches: r.child_length_inches,
    })),
  };
}
