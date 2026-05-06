"use client";

import { useState, useEffect, useRef } from "react";
import useSWRInfinite from "swr/infinite";
import { mutate as globalMutate } from "swr";
import dynamic from "next/dynamic";
import { CigarImage } from "@/components/ui/CigarImage";
import { createClient } from "@/utils/supabase/client";
import { CatalogResult } from "@/components/cigar-search";
import { keyFor } from "@/lib/data/keys";
import { fetchCigarPage } from "@/lib/data/cigar-fetchers";
import type { CigarPage } from "@/lib/data/cigar-fetchers";

/* AddToHumidorSheet (462 lines) is always mounted but lazy-loaded
   so its chunk fetches in parallel with the main bundle. */
const AddToHumidorSheet = dynamic(
  () => import("@/components/cigars/AddToHumidorSheet").then((m) => ({ default: m.AddToHumidorSheet })),
  { ssr: false },
);
import { Toast } from "@/components/ui/toast";
import { SkeletonGridCard, SkeletonListRow } from "@/components/ui/skeleton-card";
import { ViewToggle, ViewMode } from "@/components/ui/view-toggle";

/* ------------------------------------------------------------------
   Constants
   ------------------------------------------------------------------ */

/* CATALOG_SELECT moved to lib/data/cigar-fetchers.ts alongside the
   client-side fetcher. */

const PAGE_SIZE = 20;
const LS_KEY    = "discover-cigars-view";

/* ------------------------------------------------------------------
   Action button icons
   ------------------------------------------------------------------ */

function HumidorIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <rect x="1.5" y="4.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.5 7.5h12" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 3V4.5M10 3V4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="7.5" cy="10" r="1" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

function WishlistIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path
        d="M3 2.5h9a1 1 0 011 1v10l-5.5-2.5L2 13.5v-10a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------
   Grid card
   ------------------------------------------------------------------ */

function CatalogGridCard({
  cigar,
  onAddHumidor,
  onAddWishlist,
  wishlistPending,
}: {
  cigar:           CatalogResult;
  onAddHumidor:    (c: CatalogResult) => void;
  onAddWishlist:   (c: CatalogResult) => void;
  wishlistPending: boolean;
}) {
  return (
    <div className="card flex flex-col gap-2 h-full p-0 overflow-hidden">
      {/* Cigar image */}
      <div className="w-full aspect-[4/3] bg-muted overflow-hidden flex-shrink-0 relative">
        <CigarImage
          imageUrl={cigar.image_url}
          wrapper={cigar.wrapper}
          alt={cigar.series ?? cigar.format ?? ""}
          fill
          sizes="(min-width: 768px) 25vw, 50vw"
          quality={75}
          className="object-contain"
        />
      </div>

      {/* Info */}
      <div className="px-3 pt-1 flex flex-col gap-1 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground truncate">
          {cigar.brand}
        </p>
        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
          {cigar.series ?? cigar.format}
        </p>
        {cigar.format && (
          <p className="text-xs text-muted-foreground">
            {cigar.format}{cigar.ring_gauge ? ` · ${cigar.ring_gauge}` : ""}
          </p>
        )}
        {cigar.wrapper && (
          <p className="text-xs text-muted-foreground truncate mt-auto pt-1">
            {cigar.wrapper}
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-3 pb-3 flex items-center gap-2 mt-auto pt-1">
        <button
          type="button"
          onClick={() => onAddHumidor(cigar)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors duration-150"
          style={{
            backgroundColor: "var(--secondary)",
            color:           "var(--foreground)",
            minHeight:       36,
          }}
          aria-label={`Add ${cigar.series ?? cigar.format} to humidor`}
        >
          <HumidorIcon />
          <span>Humidor</span>
        </button>
        <button
          type="button"
          onClick={() => onAddWishlist(cigar)}
          disabled={wishlistPending}
          className="flex items-center justify-center rounded-lg transition-colors duration-150 disabled:opacity-40"
          style={{
            backgroundColor: "var(--secondary)",
            color:           "var(--foreground)",
            width:           36,
            height:          36,
            flexShrink:      0,
          }}
          aria-label={`Add ${cigar.series ?? cigar.format} to wishlist`}
        >
          <WishlistIcon />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   List row
   ------------------------------------------------------------------ */

function CatalogListRow({
  cigar,
  onAddHumidor,
  onAddWishlist,
  wishlistPending,
}: {
  cigar:           CatalogResult;
  onAddHumidor:    (c: CatalogResult) => void;
  onAddWishlist:   (c: CatalogResult) => void;
  wishlistPending: boolean;
}) {
  const meta = [
    cigar.format,
    cigar.ring_gauge    ? `${cigar.ring_gauge} ring` : null,
    cigar.length_inches ? `${cigar.length_inches}"`  : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="card flex items-center gap-3 p-3">
      {/* Thumbnail */}
      <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0 relative">
        <CigarImage
          imageUrl={cigar.image_url}
          wrapper={cigar.wrapper}
          alt={cigar.series ?? cigar.format ?? ""}
          fill
          sizes="48px"
          quality={70}
          className="object-contain"
        />
      </div>

      {/* Brand + series */}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
          {cigar.brand}
        </p>
        <p className="text-sm font-semibold text-foreground truncate">
          {cigar.series ?? cigar.format}
        </p>
        {cigar.wrapper && (
          <p className="text-xs text-muted-foreground truncate">{cigar.wrapper}</p>
        )}
      </div>

      {/* Format + ring gauge -- hidden on small mobile */}
      {meta && (
        <span className="hidden sm:block flex-shrink-0 text-xs text-muted-foreground text-right max-w-[100px] truncate">
          {meta}
        </span>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={() => onAddHumidor(cigar)}
          className="flex items-center justify-center rounded-lg transition-colors duration-150"
          style={{
            backgroundColor: "var(--secondary)",
            color:           "var(--foreground)",
            width:           36,
            height:          36,
          }}
          aria-label={`Add ${cigar.series ?? cigar.format} to humidor`}
        >
          <HumidorIcon />
        </button>
        <button
          type="button"
          onClick={() => onAddWishlist(cigar)}
          disabled={wishlistPending}
          className="flex items-center justify-center rounded-lg transition-colors duration-150 disabled:opacity-40"
          style={{
            backgroundColor: "var(--secondary)",
            color:           "var(--foreground)",
            width:           36,
            height:          36,
          }}
          aria-label={`Add ${cigar.series ?? cigar.format} to wishlist`}
        >
          <WishlistIcon />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   DiscoverCigarsClient

   Receives server-fetched initial results as a prop; renders immediately.
   When query === "": displays initialResults with no DB fetch.
   When user types: client-side debounced Supabase queries take over.
   When user clears: restores initialResults immediately, no fetch.
   ------------------------------------------------------------------ */

interface DiscoverCigarsClientProps {
  initialResults: CatalogResult[];
}

export function DiscoverCigarsClient({ initialResults }: DiscoverCigarsClientProps) {
  const [query,      setQuery]      = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  // View mode -- default grid, persisted to localStorage
  const [view, setView] = useState<ViewMode>("grid");
  const viewMounted = useRef(false);

  // Humidor sheet
  const [humidorCigar, setHumidorCigar] = useState<CatalogResult | null>(null);

  // Wishlist pending set -- tracks cigar IDs being inserted
  const [wishlistPending, setWishlistPending] = useState<Set<string>>(new Set());

  const [toast, setToast] = useState<string | null>(null);

  /* Restore view preference */
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY) as ViewMode | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "grid" || saved === "list") setView(saved);
    viewMounted.current = true;
  }, []);

  /* Persist view preference */
  useEffect(() => {
    if (!viewMounted.current) return;
    localStorage.setItem(LS_KEY, view);
  }, [view]);

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
  const seedPage: CigarPage = {
    results: initialResults,
    hasMore: initialResults.length === PAGE_SIZE,
  };

  const {
    data,
    size,
    setSize,
    isValidating,
    isLoading,
    error: fetchError,
    mutate: mutateCigars,
  } = useSWRInfinite<CigarPage>(
    (pageIndex, prev) => {
      if (prev && !prev.hasMore) return null;
      return keyFor.cigarSearch(debouncedQ, pageIndex);
    },
    ([, q, pageIndex]) =>
      fetchCigarPage({
        query:     q as string,
        pageIndex: pageIndex as number,
        pageSize:  PAGE_SIZE,
      }),
    {
      // fallbackData only matches the empty-query key. SWR ignores it
      // for any other key — exactly the behaviour we want.
      fallbackData:        debouncedQ === "" ? [seedPage] : undefined,
      revalidateOnMount:   false,
      revalidateFirstPage: false,
    },
  );

  /* Derive flat views. `size === 1 && isLoading` distinguishes initial
     fetch from a load-more (which keeps prior pages on screen). */
  const cigars      = (data ?? []).flatMap((p) => p.results);
  const hasMore     = data?.[data.length - 1]?.hasMore ?? false;
  const loading     = isLoading;
  const loadingMore = isValidating && !isLoading && size > 1;
  const isPopular   = debouncedQ === "";
  const error       = fetchError ? "Failed to load cigars. Please try again." : null;

  /* ── Action handlers ──────────────────────────────────────────── */

  function handleAddHumidor(cigar: CatalogResult) {
    setHumidorCigar(cigar);
  }

  async function handleAddWishlist(cigar: CatalogResult) {
    if (wishlistPending.has(cigar.id)) return;

    setWishlistPending((prev) => new Set(prev).add(cigar.id));

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setToast("You must be signed in.");
      setWishlistPending((prev) => { const s = new Set(prev); s.delete(cigar.id); return s; });
      return;
    }

    const { error: insertErr } = await supabase.from("humidor_items").insert({
      user_id:     user.id,
      cigar_id:    cigar.id,
      quantity:    1,
      is_wishlist: true,
    });

    if (insertErr) {
      setToast(insertErr.message);
    } else {
      // Increment usage_count (best-effort)
      supabase
        .from("cigar_catalog")
        .update({ usage_count: (cigar.usage_count ?? 0) + 1 })
        .eq("id", cigar.id);
      setToast("Added to your wishlist!");
      // Invalidate any wishlist SWR caches so /humidor/wishlist sees
      // the new item on next visit instead of a 30s-stale cached list.
      globalMutate(keyFor.wishlist(user.id));
      globalMutate(["wishlist-has", user.id]);
    }

    setWishlistPending((prev) => { const s = new Set(prev); s.delete(cigar.id); return s; });
  }

  async function handleHumidorSuccess() {
    if (humidorCigar) {
      const supabase = createClient();
      supabase
        .from("cigar_catalog")
        .update({ usage_count: (humidorCigar.usage_count ?? 0) + 1 })
        .eq("id", humidorCigar.id);
      // Invalidate the user's humidor SWR cache so the new item shows
      // up immediately on /humidor.
      const { data: { user } } = await supabase.auth.getUser();
      if (user) globalMutate(keyFor.humidorItems(user.id));
    }
    setToast("Added to your humidor!");
    setHumidorCigar(null);
  }

  /* ── Render ───────────────────────────────────────────────────── */

  return (
    <>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 style={{ fontFamily: "var(--font-serif)" }}>Discover Cigars</h1>
            <p className="text-sm text-muted-foreground">
              Browse our curated catalog of premium cigars
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
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Section label */}
        {!loading && cigars.length > 0 && (
          <p className="text-[11px] font-bold tracking-widest uppercase" style={{ color: "var(--muted-foreground)" }}>
            {isPopular ? "Popular Cigars" : `${cigars.length} result${cigars.length !== 1 ? "s" : ""}`}
          </p>
        )}

        {/* Results */}
        {loading ? (
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
        ) : cigars.length === 0 ? (
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
                {cigars.map((c) => (
                  <CatalogGridCard
                    key={c.id}
                    cigar={c}
                    onAddHumidor={handleAddHumidor}
                    onAddWishlist={handleAddWishlist}
                    wishlistPending={wishlistPending.has(c.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {cigars.map((c) => (
                  <CatalogListRow
                    key={c.id}
                    cigar={c}
                    onAddHumidor={handleAddHumidor}
                    onAddWishlist={handleAddWishlist}
                    wishlistPending={wishlistPending.has(c.id)}
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

      {/* Add to Humidor sheet */}
      <AddToHumidorSheet
        cigarId={humidorCigar?.id ?? ""}
        isOpen={humidorCigar !== null}
        onClose={() => setHumidorCigar(null)}
        onSuccess={handleHumidorSuccess}
      />
    </>
  );
}
