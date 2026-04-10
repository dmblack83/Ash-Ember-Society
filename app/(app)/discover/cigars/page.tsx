"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { CatalogResult } from "@/components/cigar-search";
import { AddToHumidorSheet } from "@/components/cigars/AddToHumidorSheet";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

const CATALOG_SELECT =
  "id, brand, series, name, format, ring_gauge, length_inches, wrapper, wrapper_country, usage_count";

const PAGE_SIZE = 20;

/* ------------------------------------------------------------------
   Cigar placeholder SVG
   ------------------------------------------------------------------ */

function CigarPlaceholder() {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <svg
        width="96" height="28" viewBox="0 0 96 28" fill="none"
        aria-hidden="true" className="text-muted-foreground/30"
      >
        <rect x="8" y="9" width="68" height="10" rx="5" fill="currentColor" />
        <ellipse cx="76" cy="14" rx="12" ry="6" fill="currentColor" opacity="0.65" />
        <rect x="4" y="9" width="6" height="10" rx="2" fill="currentColor" opacity="0.45" />
        <rect x="26" y="9" width="11" height="10" rx="1" fill="currentColor" opacity="0.22" />
        <ellipse cx="5" cy="14" rx="3.5" ry="3.5" fill="#E8642C" opacity="0.4" />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------
   Skeleton card
   ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div className="card animate-pulse flex flex-col gap-3">
      <div className="w-full aspect-[16/9] rounded-lg bg-muted" />
      <div className="flex flex-col gap-2">
        <div className="h-2.5 bg-muted rounded w-1/3" />
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-2.5 bg-muted rounded w-1/4" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Catalog card — tappable, opens action sheet
   ------------------------------------------------------------------ */

function CatalogCard({
  cigar,
  onTap,
}: {
  cigar: CatalogResult;
  onTap: (cigar: CatalogResult) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onTap(cigar)}
      className="card card-interactive h-full flex flex-col gap-3 text-left w-full"
    >
      {/* Placeholder image area */}
      <div className="w-full aspect-[16/9] rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
        <CigarPlaceholder />
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground truncate">
          {cigar.brand}
        </p>
        <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
          {cigar.series ?? cigar.name}
        </h3>
        {cigar.format && (
          <p className="text-xs text-muted-foreground">{cigar.format}</p>
        )}
        {(cigar.wrapper || cigar.ring_gauge) && (
          <p className="text-xs text-muted-foreground mt-auto pt-1 truncate">
            {[
              cigar.wrapper,
              cigar.ring_gauge    ? `${cigar.ring_gauge} ring`  : null,
              cigar.length_inches ? `${cigar.length_inches}"`   : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------
   Cigar action sheet — "Add to Humidor" / "Add to Wishlist"
   ------------------------------------------------------------------ */

function CigarActionSheet({
  cigar,
  onClose,
  onAddedToHumidor,
  onAddedToWishlist,
}: {
  cigar: CatalogResult | null;
  onClose: () => void;
  onAddedToHumidor: () => void;
  onAddedToWishlist: () => void;
}) {
  const [addingWishlist, setAddingWishlist] = useState(false);
  const [wishlistError, setWishlistError] = useState<string | null>(null);
  const [showHumidorSheet, setShowHumidorSheet] = useState(false);
  const open = cigar !== null;

  /* Reset when cigar changes */
  useEffect(() => {
    setAddingWishlist(false);
    setWishlistError(null);
    setShowHumidorSheet(false);
  }, [cigar]);

  async function handleAddWishlist() {
    if (!cigar) return;
    setAddingWishlist(true);
    setWishlistError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setWishlistError("Not authenticated."); setAddingWishlist(false); return; }

    const { error } = await supabase.from("humidor_items").insert({
      user_id:     user.id,
      cigar_id:    cigar.id,
      quantity:    1,
      is_wishlist: true,
    });

    if (error) {
      setWishlistError(error.message);
      setAddingWishlist(false);
      return;
    }

    /* Increment usage_count */
    await supabase
      .from("cigar_catalog")
      .update({ usage_count: cigar.usage_count + 1 })
      .eq("id", cigar.id);

    setAddingWishlist(false);
    onAddedToWishlist();
    onClose();
  }

  function handleAddHumidor() {
    setShowHumidorSheet(true);
  }

  function handleHumidorSuccess() {
    /* Increment usage_count */
    if (cigar) {
      const supabase = createClient();
      supabase
        .from("cigar_catalog")
        .update({ usage_count: cigar.usage_count + 1 })
        .eq("id", cigar.id);
    }
    onAddedToHumidor();
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          backgroundColor: "rgba(0,0,0,0.65)",
          opacity:         open && !showHumidorSheet ? 1 : 0,
          pointerEvents:   open && !showHumidorSheet ? "auto" : "none",
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Action sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cigar actions"
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col"
        style={{
          backgroundColor:      "var(--background)",
          borderTopLeftRadius:  20,
          borderTopRightRadius: 20,
          borderTop:            "1px solid var(--border)",
          transform:            open && !showHumidorSheet ? "translateY(0)" : "translateY(100%)",
          transition:           "transform 320ms cubic-bezier(0.32,0.72,0,1)",
          paddingBottom:        "env(safe-area-inset-bottom, 24px)",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--border)" }} />
        </div>

        {cigar && (
          <div className="px-5 pb-6 space-y-4">
            {/* Cigar info */}
            <div
              className="rounded-2xl p-4"
              style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
            >
              {cigar.brand && (
                <p
                  className="text-[11px] font-bold tracking-widest uppercase mb-1"
                  style={{ color: "var(--primary)" }}
                >
                  {cigar.brand}
                </p>
              )}
              <p
                className="text-base font-semibold text-foreground leading-snug"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {cigar.series ?? cigar.name}
              </p>
              {(cigar.format || cigar.wrapper || cigar.ring_gauge) && (
                <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                  {[
                    cigar.format,
                    cigar.wrapper,
                    cigar.ring_gauge    ? `${cigar.ring_gauge} ring`  : null,
                    cigar.length_inches ? `${cigar.length_inches}"`   : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>

            {/* Actions */}
            <button
              type="button"
              onClick={handleAddHumidor}
              className="btn btn-primary w-full"
              style={{ minHeight: 52 }}
            >
              Add to Humidor
            </button>
            <button
              type="button"
              onClick={handleAddWishlist}
              disabled={addingWishlist}
              className="btn btn-secondary w-full disabled:opacity-40"
              style={{ minHeight: 52 }}
            >
              {addingWishlist ? (
                <span className="flex items-center justify-center gap-2">
                  <span
                    className="rounded-full border animate-spin"
                    style={{ width: 16, height: 16, borderColor: "rgba(193,120,23,0.3)", borderTopColor: "var(--primary)" }}
                  />
                  Adding…
                </span>
              ) : (
                "Add to Wishlist"
              )}
            </button>
            {wishlistError && (
              <p className="text-sm text-center" style={{ color: "var(--destructive)" }}>
                {wishlistError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* AddToHumidorSheet (stacks on top) */}
      <AddToHumidorSheet
        cigarId={cigar?.id ?? ""}
        isOpen={showHumidorSheet}
        onClose={() => setShowHumidorSheet(false)}
        onSuccess={handleHumidorSuccess}
      />
    </>
  );
}

/* ------------------------------------------------------------------
   Toast
   ------------------------------------------------------------------ */

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className="fixed bottom-6 right-6 z-[60] card animate-slide-up flex items-center gap-3 max-w-xs"
      style={{ borderLeft: "4px solid var(--primary)" }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
        className="flex-shrink-0" style={{ color: "var(--primary)" }} aria-hidden="true">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 8L7 10L11 6" stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="text-sm text-foreground">{message}</p>
    </div>
  );
}

/* ------------------------------------------------------------------
   Page
   ------------------------------------------------------------------ */

export default function DiscoverCigarsPage() {
  const [query,       setQuery]       = useState("");
  const [debouncedQ,  setDebouncedQ]  = useState("");
  const [cigars,      setCigars]      = useState<CatalogResult[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,     setHasMore]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [isPopular,   setIsPopular]   = useState(true);

  const [activeCigar, setActiveCigar] = useState<CatalogResult | null>(null);
  const [toast,       setToast]       = useState<string | null>(null);

  const offsetRef = useRef(0);

  /* 300 ms debounce on query */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const fetchCigars = useCallback(
    async (reset: boolean) => {
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
    [debouncedQ]
  );

  useEffect(() => {
    fetchCigars(true);
  }, [fetchCigars]);

  return (
    <>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <div className="space-y-1">
          <h1 style={{ fontFamily: "var(--font-serif)" }}>Discover Cigars</h1>
          <p className="text-sm text-muted-foreground">
            Browse our curated catalog of premium cigars
          </p>
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
            placeholder="Search brand, series, wrapper…"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
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
              <p className="text-sm text-muted-foreground mt-1">
                Try a different search
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {cigars.map((c) => (
                <CatalogCard key={c.id} cigar={c} onTap={setActiveCigar} />
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center pt-4 pb-8">
                <button
                  type="button"
                  className="btn btn-secondary min-w-[120px]"
                  onClick={() => fetchCigars(false)}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Action sheet */}
      <CigarActionSheet
        cigar={activeCigar}
        onClose={() => setActiveCigar(null)}
        onAddedToHumidor={() => setToast("Added to your humidor!")}
        onAddedToWishlist={() => setToast("Added to your wishlist!")}
      />
    </>
  );
}
