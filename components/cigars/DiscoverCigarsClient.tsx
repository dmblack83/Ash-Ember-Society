"use client";

import { useState, useEffect, useRef } from "react";
import useSWRInfinite from "swr/infinite";
import { useRefreshSignal } from "@/lib/hooks/use-refresh-signal";
import { CigarImage } from "@/components/ui/CigarImage";
import { keyFor } from "@/lib/data/keys";
import useSWR from "swr";
import { IntentLink } from "@/components/ui/IntentLink";
import { fetchCatalogLines, fetchCatalogBrands } from "@/lib/data/cigar-fetchers";
import { parseCatalogRestore, serializeCatalogRestore } from "@/lib/cigars/catalog-restore";
import type { CatalogLinePage, CatalogBrand } from "@/lib/data/cigar-fetchers";
import type { CatalogLine } from "@/lib/cigars/line-group";
import { SkeletonGridCard, SkeletonListRow } from "@/components/ui/skeleton-card";
import { ViewToggle, ViewMode } from "@/components/ui/view-toggle";

/* ------------------------------------------------------------------
   Constants
   ------------------------------------------------------------------ */

/* CATALOG_SELECT moved to lib/data/cigar-fetchers.ts alongside the
   client-side fetcher. */

const PAGE_SIZE = 20;
const LS_KEY    = "discover-cigars-view";
const RESTORE_KEY = "ae:catalog-restore";

/* ------------------------------------------------------------------
   Line cards (one card per brand + series line)
   ------------------------------------------------------------------ */

function vitolaChip(count: number) {
  if (count < 1) return null;
  return (
    <span
      className="inline-block self-start text-[10px] font-semibold px-2.5 py-1 rounded-full mt-1.5"
      style={{ backgroundColor: "rgba(212,160,74,0.12)", color: "var(--gold, #D4A04A)" }}
    >
      {count} vitola{count !== 1 ? "s" : ""}
    </span>
  );
}

function LineGridCard({ line, onCardNav }: { line: CatalogLine; onCardNav: () => void }) {
  return (
    <IntentLink
      href={`/discover/cigars/${line.repId}`}
      onClick={onCardNav}
      className="card flex flex-col gap-2 h-full p-0 overflow-hidden cursor-pointer"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div className="w-full aspect-[4/3] bg-muted overflow-hidden flex-shrink-0 relative">
        <CigarImage
          imageUrl={line.imageUrl}
          wrapper={line.wrapper}
          alt={line.series ?? line.brand ?? ""}
          fill
          sizes="(min-width: 768px) 25vw, 50vw"
          quality={60}
          className="object-contain"
        />
      </div>
      <div className="px-3 pt-1 pb-3 flex flex-col gap-1 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground truncate">
          {line.brand}
        </p>
        <p
          className="text-sm font-semibold text-foreground leading-snug line-clamp-2"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {line.series ?? line.brand}
        </p>
        {line.wrapper && (
          <p className="text-xs text-muted-foreground truncate">{line.wrapper}</p>
        )}
        {vitolaChip(line.sizeCount)}
      </div>
    </IntentLink>
  );
}

function LineListRow({ line, onCardNav }: { line: CatalogLine; onCardNav: () => void }) {
  return (
    <IntentLink
      href={`/discover/cigars/${line.repId}`}
      onClick={onCardNav}
      className="card flex items-center gap-3 p-3 cursor-pointer"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0 relative">
        <CigarImage
          imageUrl={line.imageUrl}
          wrapper={line.wrapper}
          alt={line.series ?? line.brand ?? ""}
          fill
          sizes="48px"
          quality={70}
          className="object-contain"
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
          {line.brand}
        </p>
        <p
          className="text-sm font-semibold text-foreground truncate"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {line.series ?? line.brand}
        </p>
        {line.wrapper && (
          <p className="text-xs text-muted-foreground truncate">{line.wrapper}</p>
        )}
      </div>
      {line.sizeCount >= 1 && (
        <span
          className="flex-shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full"
          style={{ backgroundColor: "rgba(212,160,74,0.12)", color: "var(--gold, #D4A04A)" }}
        >
          {line.sizeCount} vitola{line.sizeCount !== 1 ? "s" : ""}
        </span>
      )}
    </IntentLink>
  );
}

/* ------------------------------------------------------------------
   DiscoverCigarsClient

   Receives server-fetched initial results as a prop; renders immediately.
   When query === "": displays initialResults with no DB fetch.
   When user types: client-side debounced Supabase queries take over.
   When user clears: restores initialResults immediately, no fetch.
   ------------------------------------------------------------------ */

export function DiscoverCigarsClient() {
  const [query,      setQuery]      = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  /* Brand drill-down — landing shows the brand index; selecting one
     shows that brand's cigars. Typing a search clears the selection
     so clearing the search always returns to the brand index. */
  const [brandSel, setBrandSel] = useState<string | null>(null);
  /* Brand index pagination — top 20 first, Load more reveals the rest
     (the full list arrives in one small RPC payload; slicing is
     display-only). */
  const [brandsShown, setBrandsShown] = useState(PAGE_SIZE);

  // View mode -- default grid, persisted to localStorage
  const [view, setView] = useState<ViewMode>("grid");
  const viewMounted = useRef(false);

  /* Restore view preference */
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY) as ViewMode | null;
     
    if (saved === "grid" || saved === "list") setView(saved);
    viewMounted.current = true;
  }, []);

  /* Persist view preference */
  useEffect(() => {
    if (!viewMounted.current) return;
    localStorage.setItem(LS_KEY, view);
  }, [view]);

  /* ── Back-from-detail restore ─────────────────────────────────
     Tapping a card saves { query, brand, brandsShown, size, y } (see
     saveListState below); the next mount takes it once and rebuilds
     the exact list — no fresh brands landing. TTL + take-once live in
     lib/cigars/catalog-restore.ts. */
  const restoreRef = useRef<{ y: number; size: number } | null>(null);

  useEffect(() => {
    let saved: ReturnType<typeof parseCatalogRestore> = null;
    try {
      saved = parseCatalogRestore(sessionStorage.getItem(RESTORE_KEY), Date.now());
      sessionStorage.removeItem(RESTORE_KEY);
    } catch { /* storage unavailable */ }
    if (!saved) return;
     
    setQuery(saved.query);
    setDebouncedQ(saved.query.trim());
    setBrandSel(saved.brand);
    setBrandsShown(saved.brandsShown);
     
    restoreRef.current = { y: saved.y, size: saved.size };
   
  }, []);

  /* 300 ms debounce on query — drives the SWR cache key. */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  /*
   * SWR-driven catalog data. Each (debouncedQ, pageIndex) tuple is a
   * cache entry. For the EMPTY-query case at first render, fallbackData
   * seeds page 0 with the server-fetched initialResults; pages 1+ for
   * the same empty query fetch from Supabase. As soon as the user
   * types something, the key family changes, fallbackData no longer
   * matches, and SWR fetches the search results.
   *
   * revalidateOnMount/FirstPage: false — we don't want a redundant
   * Supabase call on first render of the empty-query case. The 30s
   * dedupingInterval (set globally in SWRProvider) covers warm-cache
   * navigation (e.g. /discover/cigars → /home → /discover/cigars).
   */
  /* Cigar pages exist for a search or a brand drill-down; the plain
     landing (no query, no brand) renders the brand index instead, so
     the key is null there and no cigar fetch happens. */
  const showBrandIndex = debouncedQ === "" && brandSel === null;

  const {
    data,
    size,
    setSize,
    isValidating,
    isLoading,
    error: fetchError,
    mutate: mutateCigars,
  } = useSWRInfinite<CatalogLinePage>(
    (pageIndex, prev) => {
      if (prev && !prev.hasMore) return null;
      if (showBrandIndex) return null;
      return keyFor.catalogLines(debouncedQ, pageIndex, brandSel ?? "");
    },
    ([, q, brand, pageIndex]) =>
      fetchCatalogLines({
        query:     q as string,
        brand:     (brand as string) || undefined,
        pageIndex: pageIndex as number,
        pageSize:  PAGE_SIZE,
      }),
    { revalidateFirstPage: false },
  );

  /* Brand index — fetched only while the landing shows it. */
  const {
    data:  brands,
    error: brandsError,
    isLoading: brandsLoading,
    mutate: mutateBrands,
  } = useSWR<CatalogBrand[]>(
    showBrandIndex ? keyFor.catalogBrands : null,
    fetchCatalogBrands,
  );

  /* Restore step 2: re-grow the page count, then jump back once the
     restored rows (or the brand index) have rendered. */
  useEffect(() => {
    const r = restoreRef.current;
    if (!r) return;
    if (r.size > 1 && size < r.size) {
      void setSize(r.size);
      return;
    }
    const contentReady = showBrandIndex
      ? (brands?.length ?? 0) > 0
      : (data?.length ?? 0) >= r.size;
    if (!contentReady) return;
    restoreRef.current = null;
    /* rAF lets the freshly grown list paint before the jump. */
    requestAnimationFrame(() => window.scrollTo(0, r.y));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, brands, size, showBrandIndex]);

  /* Save-on-navigate — called from every card's IntentLink onClick. */
  function saveListState() {
    try {
      sessionStorage.setItem(
        RESTORE_KEY,
        serializeCatalogRestore(
          { query, brand: brandSel, brandsShown, size, y: window.scrollY },
          Date.now(),
        ),
      );
    } catch { /* storage unavailable */ }
  }

  /* Global refresh (pull-to-refresh, resume) needs the BOUND mutate —
     revalidateFirstPage:false means a global SWR broadcast refetches
     none of this feed's cached pages. */
  useRefreshSignal(() => mutateCigars());

  /* Derive flat views. `size === 1 && isLoading` distinguishes initial
     fetch from a load-more (which keeps prior pages on screen). */
  const lines       = (data ?? []).flatMap((p) => p.lines);
  const hasMore     = data?.[data.length - 1]?.hasMore ?? false;
  const loading     = isLoading;
  const loadingMore = isValidating && !isLoading && size > 1;
  const error       = fetchError ? "Failed to load cigars. Please try again." : null;

  /* ── Render ───────────────────────────────────────────────────── */

  return (
    <>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 style={{ fontFamily: "var(--font-serif)" }}>Cigar Catalog</h1>
            <p className="text-sm text-muted-foreground">
              Search the catalog or browse by brand
            </p>
          </div>
          <ViewToggle view={view} onChange={setView} />
        </div>

        {/* Search bar */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"
          >
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
            <line x1="10.5" y1="10.5" x2="14" y2="14"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            className="input pl-9"
            placeholder="Search brand, series, wrapper..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim() !== "") setBrandSel(null);
            }}
          />
        </div>

        {/* Brand crumb — back to the brand index from a drill-down */}
        {brandSel !== null && debouncedQ === "" && (
          <button
            type="button"
            onClick={() => setBrandSel(null)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M9 11L5 7L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            All brands
          </button>
        )}

        {/* Section label */}
        {showBrandIndex ? (
          !brandsLoading && (brands?.length ?? 0) > 0 && (
            <p className="text-[11px] font-bold tracking-widest uppercase" style={{ color: "var(--muted-foreground)" }}>
              Popular Brands
            </p>
          )
        ) : (
          !loading && lines.length > 0 && (
            <p className="text-[11px] font-bold tracking-widest uppercase" style={{ color: "var(--muted-foreground)" }}>
              {brandSel !== null && debouncedQ === ""
                ? `${brandSel} · ${lines.length}${hasMore ? "+" : ""} cigar${lines.length !== 1 ? "s" : ""}`
                : `${lines.length} result${lines.length !== 1 ? "s" : ""}`}
            </p>
          )
        )}

        {/* Brand index (landing) */}
        {showBrandIndex ? (
          brandsLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 8 }).map((_, i) => <SkeletonListRow key={i} />)}
            </div>
          ) : brandsError ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <p className="text-sm text-destructive">Failed to load brands. Please try again.</p>
              <button type="button" className="btn btn-secondary" onClick={() => mutateBrands()}>
                Try again
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              {(brands ?? []).slice(0, brandsShown).map((b, i) => (
                <button
                  key={b.brand}
                  type="button"
                  onClick={() => { setBrandSel(b.brand); window.scrollTo({ top: 0 }); }}
                  className="card flex items-center gap-3 p-3.5 text-left transition-colors duration-150 hover:border-[rgba(212,160,74,0.4)]"
                  style={{ cursor: "pointer" }}
                >
                  <span
                    className="w-6 flex-shrink-0 text-center"
                    style={{ fontFamily: "var(--font-serif)", fontSize: 15, color: "var(--gold, #D4A04A)", opacity: 0.85 }}
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold truncate" style={{ fontFamily: "var(--font-serif)", fontSize: 16, color: "var(--foreground)" }}>
                      {b.brand}
                    </span>
                    <span className="block text-[11px] text-muted-foreground mt-0.5">
                      {b.cigar_count} cigar{b.cigar_count !== 1 ? "s" : ""}
                    </span>
                  </span>
                  <span className="text-muted-foreground" aria-hidden="true">›</span>
                </button>
              ))}
              {(brands?.length ?? 0) > brandsShown && (
                <div className="lg:col-span-2 flex justify-center pt-2 pb-4">
                  <button
                    type="button"
                    className="btn btn-secondary min-w-[120px]"
                    onClick={() => setBrandsShown((n) => n + PAGE_SIZE)}
                  >
                    Load more
                  </button>
                </div>
              )}
            </div>
          )
        ) : loading ? (
          view === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => <SkeletonGridCard key={i} />)}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonListRow key={i} />)}
            </div>
          )
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <button type="button" className="btn btn-secondary" onClick={() => mutateCigars()}>
              Try again
            </button>
          </div>
        ) : lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="text-muted-foreground/35">
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
                <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="2.5" />
                <line x1="36" y1="36" x2="51" y2="51"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <rect x="16" y="21" width="16" height="6" rx="3" fill="currentColor" opacity="0.5" />
              </svg>
            </div>
            <div>
              <p className="text-base font-medium text-foreground">No cigars found</p>
              <p className="text-sm text-muted-foreground mt-1">Try a different search</p>
            </div>
          </div>
        ) : (
          <>
            {view === "grid" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {lines.map((line) => (
                  <LineGridCard
                    key={line.repId}
                    line={line}
                    onCardNav={saveListState}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {lines.map((line) => (
                  <LineListRow
                    key={line.repId}
                    line={line}
                    onCardNav={saveListState}
                  />
                ))}
              </div>
            )}

            {hasMore && (
              <div className="flex justify-center pt-4 pb-8">
                <button
                  type="button"
                  className="btn btn-secondary min-w-[120px]"
                  onClick={() => setSize(size + 1)}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
