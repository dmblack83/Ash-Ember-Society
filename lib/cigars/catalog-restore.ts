/**
 * Catalog list-state restoration.
 *
 * Tapping a cigar card navigates to /discover/cigars/[id]; coming back
 * must land on the same list — search query or brand drill-down, page
 * count, and scroll position — not a fresh brands landing. The list
 * saves its state when a card is tapped and restores it once on the
 * next mount (take-once, short TTL so stale detours don't resurrect an
 * old search). Same shape as lib/discover/news-restore.ts.
 *
 * serialize/parse are pure (injected clock) for unit tests; the client
 * component owns storage access and the restore choreography.
 */

export const CATALOG_RESTORE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface CatalogRestoreState {
  query:       string;         // search box contents ("" = none)
  brand:       string | null;  // brand drill-down selection
  brandsShown: number;         // brand index Load-more depth
  size:        number;         // useSWRInfinite loaded page count
  y:           number;         // window scroll position
}

export function serializeCatalogRestore(state: CatalogRestoreState, now: number): string {
  return JSON.stringify({ ...state, savedAt: now });
}

export function parseCatalogRestore(json: string | null, now: number): CatalogRestoreState | null {
  if (!json) return null;
  try {
    const obj = JSON.parse(json) as {
      query?: unknown; brand?: unknown; brandsShown?: unknown;
      size?: unknown; y?: unknown; savedAt?: unknown;
    };
    if (
      typeof obj.savedAt !== "number" ||
      now - obj.savedAt > CATALOG_RESTORE_TTL_MS ||
      typeof obj.query !== "string" ||
      (obj.brand !== null && typeof obj.brand !== "string") ||
      typeof obj.brandsShown !== "number" || obj.brandsShown < 1 ||
      typeof obj.size !== "number" || obj.size < 1 ||
      typeof obj.y !== "number" || obj.y < 0
    ) {
      return null;
    }
    return {
      query:       obj.query,
      brand:       obj.brand as string | null,
      brandsShown: Math.floor(obj.brandsShown),
      size:        Math.floor(obj.size),
      y:           obj.y,
    };
  } catch {
    return null;
  }
}
