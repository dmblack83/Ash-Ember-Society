"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { CatalogResult } from "@/components/cigar-search";
import { AddToHumidorSheet } from "@/components/cigars/AddToHumidorSheet";
import { Toast } from "@/components/ui/toast";
import { CigarPlaceholder, BrandPlaceholder } from "@/components/ui/cigar-placeholder";
import { SkeletonGridCard, SkeletonListRow } from "@/components/ui/skeleton-card";
import { ViewToggle, ViewMode } from "@/components/ui/view-toggle";

/* ------------------------------------------------------------------
   Constants
   ------------------------------------------------------------------ */

const CATALOG_SELECT =
  "id, brand, series, name, format, ring_gauge, length_inches, wrapper, wrapper_country, usage_count, image_url";

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
      <div className="w-full aspect-[4/3] bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center">
        {cigar.image_url ? (
          <img
            src={cigar.image_url}
            alt={cigar.series ?? cigar.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <BrandPlaceholder brand={cigar.brand ?? "?"} />
        )}
      </div>

      {/* Info */}
      <div className="px-3 pt-1 flex flex-col gap-1 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground truncate">
          {cigar.brand}
        </p>
        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
          {cigar.series ?? cigar.name}
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
          aria-label={`Add ${cigar.series ?? cigar.name} to humidor`}
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
          aria-label={`Add ${cigar.series ?? cigar.name} to wishlist`}
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
      <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
        {cigar.image_url ? (
          <img
            src={cigar.image_url}
            alt={cigar.series ?? cigar.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <CigarPlaceholder />
        )}
      </div>

      {/* Brand + series */}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
          {cigar.brand}
        </p>
        <p className="text-sm font-semibold text-foreground truncate">
          {cigar.series ?? cigar.name}
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
          aria-label={`Add ${cigar.series ?? cigar.name} to humidor`}
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
          aria-label={`Add ${cigar.series ?? cigar.name} to wishlist`}
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
  const [query,       setQuery]       = useState("");
  const [debouncedQ,  setDebouncedQ]  = useState("");
  const [cigars,      setCigars]      = useState<CatalogResult[]>(initialResults);
  const [loading,     setLoading]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,     setHasMore]     = useState(initialResults.length === PAGE_SIZE);
  const [error,       setError]       = useState<string | null>(null);
  const [isPopular,   setIsPopular]   = useState(true);

  // View mode -- default grid, persisted to localStorage
  const [view,        setView]        = useState<ViewMode>("grid");
  const viewMounted = useRef(false);

  // Humidor sheet
  const [humidorCigar, setHumidorCigar] = useState<CatalogResult | null>(null);

  // Wishlist pending set -- tracks cigar IDs being inserted
  const [wishlistPending, setWishlistPending] = useState<Set<string>>(new Set());

  const [toast, setToast] = useState<string | null>(null);

  // offsetRef tracks how many results are loaded for pagination
  const offsetRef = useRef(initialResults.length);

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

  /* 300 ms debounce on query */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const fetchCigars = useCallback(
    async (reset: boolean) => {
      // Query cleared -- restore server-fetched initial results immediately, no DB call
      if (!debouncedQ && reset) {
        setCigars(initialResults);
        offsetRef.current = initialResults.length;
        setIsPopular(true);
        setHasMore(initialResults.length === PAGE_SIZE);
        setLoading(false);
        setError(null);
        return;
      }

      const supabase = createClient();
      const offset   = reset ? 0 : offsetRef.current;

      if (reset) {
        setLoading(true);
        setCigars([]);
        offsetRef.current = 0;
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const isSearch = !!debouncedQ;
        setIsPopular(!isSearch);

        let q = supabase
          .from("cigar_catalog")
          .select(CATALOG_SELECT)
          .range(offset, offset + PAGE_SIZE - 1);

        if (isSearch) {
          q = q.or(
            `name.ilike.%${debouncedQ}%,brand.ilike.%${debouncedQ}%,series.ilike.%${debouncedQ}%`
          );
        } else {
          q = q.order("usage_count", { ascending: false });
        }

        const { data, error: fetchErr } = await q;
        if (fetchErr) throw fetchErr;

        const results = data ?? [];
        setCigars((prev) => (reset ? results : [...prev, ...results]));
        offsetRef.current = offset + results.length;
        setHasMore(results.length === PAGE_SIZE);
      } catch (e) {
        console.error(e);
        setError("Failed to load cigars. Please try again.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedQ, initialResults]
  );

  useEffect(() => {
    fetchCigars(true);
  }, [fetchCigars]);

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
    }

    setWishlistPending((prev) => { const s = new Set(prev); s.delete(cigar.id); return s; });
  }

  function handleHumidorSuccess() {
    if (humidorCigar) {
      const supabase = createClient();
      supabase
        .from("cigar_catalog")
        .update({ usage_count: (humidorCigar.usage_count ?? 0) + 1 })
        .eq("id", humidorCigar.id);
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
            <button type="button" className="btn btn-secondary" onClick={() => fetchCigars(true)}>
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
                  onClick={() => fetchCigars(false)}
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
