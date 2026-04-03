"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { AddToHumidorSheet } from "@/components/cigars/AddToHumidorSheet";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface Cigar {
  id: string;
  brand: string;
  line: string;
  name: string;
  vitola: string;
  strength: string;
  wrapper: string;
  country: string;
  image_url: string | null;
  avg_rating: number | null;
}

interface WishlistItem {
  id: string;
  cigar_id: string;
  created_at: string;
  cigar: Cigar;
}

/* ------------------------------------------------------------------
   Strength helpers (mirrors discover/detail pages)
   ------------------------------------------------------------------ */

const STRENGTH_LABEL: Record<string, string> = {
  mild: "Mild",
  mild_medium: "Mild-Medium",
  medium: "Medium",
  medium_full: "Medium-Full",
  full: "Full",
};

function strengthStyle(s: string): { backgroundColor: string; color: string } {
  const map: Record<string, { backgroundColor: string; color: string }> = {
    mild:        { backgroundColor: "#1E3A2A", color: "#5A9A72" },
    mild_medium: { backgroundColor: "#2A2A1A", color: "#8A8A42" },
    medium:      { backgroundColor: "var(--secondary)", color: "#C17817" },
    medium_full: { backgroundColor: "#2A1A0A", color: "#C17817" },
    full:        { backgroundColor: "#2A1010", color: "#C44536" },
  };
  return map[s] ?? { backgroundColor: "var(--muted)", color: "var(--muted-foreground)" };
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
   Cigar placeholder SVG
   ------------------------------------------------------------------ */

function CigarPlaceholder() {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <svg width="96" height="28" viewBox="0 0 96 28" fill="none"
        aria-hidden="true" className="text-muted-foreground/30">
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
        <div className="flex gap-2 mt-1">
          <div className="h-4 bg-muted rounded-full w-20" />
          <div className="h-3 bg-muted rounded w-24 ml-auto self-center" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Wishlist card
   ------------------------------------------------------------------ */

function WishlistCard({
  item,
  onRemove,
  onMoveToHumidor,
  menuOpenId,
  setMenuOpenId,
}: {
  item: WishlistItem;
  onRemove: (id: string) => void;
  onMoveToHumidor: (cigarId: string) => void;
  menuOpenId: string | null;
  setMenuOpenId: (id: string | null) => void;
}) {
  const c = item.cigar;
  const badge = strengthStyle(c.strength);
  const menuOpen = menuOpenId === item.id;

  const subtitle =
    c.name && c.name !== c.line && c.name !== c.vitola
      ? `${c.line} — ${c.name}`
      : c.line;

  return (
    <div className="card card-interactive flex flex-col gap-3 relative">
      {/* Three-dot menu */}
      <div className="absolute top-3 right-3 z-10" data-menu>
        <button
          type="button"
          data-menu
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpenId(menuOpen ? null : item.id);
          }}
          className="btn btn-ghost p-1.5 rounded-lg opacity-60 hover:opacity-100"
          aria-label="Options"
          aria-expanded={menuOpen}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="3" r="1.25" fill="currentColor" />
            <circle cx="8" cy="8" r="1.25" fill="currentColor" />
            <circle cx="8" cy="13" r="1.25" fill="currentColor" />
          </svg>
        </button>

        {menuOpen && (
          <div
            data-menu
            className="absolute right-0 top-full mt-1 w-48 card shadow-xl border border-border/50 py-1 z-20"
          >
            <button
              type="button"
              data-menu
              onClick={() => {
                setMenuOpenId(null);
                onMoveToHumidor(c.id);
              }}
              className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors duration-100 flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <rect x="1" y="5" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M4 5V4a3 3 0 016 0v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Move to Humidor
            </button>
            <button
              type="button"
              data-menu
              onClick={() => {
                setMenuOpenId(null);
                onRemove(item.id);
              }}
              className="w-full text-left px-4 py-2.5 text-sm text-destructive hover:bg-muted transition-colors duration-100 flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M5 3.5l.5 8M9 3.5l-.5 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Remove from Wishlist
            </button>
          </div>
        )}
      </div>

      {/* Card link — navigates to detail */}
      <Link href={`/discover/cigars/${c.id}`} className="flex flex-col gap-3 flex-1">
        {/* Image */}
        <div className="w-full aspect-[16/9] rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
          {c.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.image_url} alt={`${c.brand} ${c.line}`}
              className="w-full h-full object-cover" />
          ) : (
            <CigarPlaceholder />
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground truncate">
            {c.brand}
          </p>
          <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
            {subtitle}
          </h3>
          <p className="text-xs text-muted-foreground">{c.vitola}</p>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span
              className="badge text-[10px] px-2.5 py-0.5 rounded-full font-medium"
              style={badge}
            >
              {STRENGTH_LABEL[c.strength] ?? c.strength}
            </span>
            {c.avg_rating != null && (
              <span className="text-xs font-medium" style={{ color: "var(--gold)" }}>
                ★ {c.avg_rating.toFixed(1)}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground ml-auto truncate max-w-[120px]">
              {c.wrapper}
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------
   Page
   ------------------------------------------------------------------ */

export default function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [sheetCigarId, setSheetCigarId] = useState<string | null>(null);

  /* Close menu when clicking outside */
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest("[data-menu]")) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const fetchWishlist = useCallback(async () => {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    /* Fetch wishlist items */
    const { data: wishlistRows, error: wishlistError } = await supabase
      .from("humidor_items")
      .select("id, cigar_id, created_at")
      .eq("user_id", user.id)
      .eq("is_wishlist", true)
      .order("created_at", { ascending: false });

    if (wishlistError) {
      setError("Failed to load wishlist. Please try again.");
      setLoading(false);
      return;
    }

    if (!wishlistRows || wishlistRows.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    /* Fetch cigar details for each wishlist item */
    const cigarIds = wishlistRows.map((r) => r.cigar_id);
    const { data: cigars, error: cigarsError } = await supabase
      .from("cigars")
      .select("id, brand, line, name, vitola, strength, wrapper, country, image_url, avg_rating")
      .in("id", cigarIds);

    if (cigarsError) {
      setError("Failed to load cigar details.");
      setLoading(false);
      return;
    }

    const cigarMap = new Map((cigars ?? []).map((c) => [c.id, c]));
    const merged: WishlistItem[] = wishlistRows
      .map((row) => {
        const cigar = cigarMap.get(row.cigar_id);
        if (!cigar) return null;
        return { id: row.id, cigar_id: row.cigar_id, created_at: row.created_at, cigar };
      })
      .filter((x): x is WishlistItem => x !== null);

    setItems(merged);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchWishlist();
  }, [fetchWishlist]);

  /* Optimistic remove */
  async function handleRemove(itemId: string) {
    const prev = items;
    setItems((cur) => cur.filter((i) => i.id !== itemId)); /* optimistic */

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("humidor_items")
      .delete()
      .eq("id", itemId);

    if (deleteError) {
      setItems(prev); /* rollback */
      setToast("Failed to remove. Please try again.");
    }
  }

  /* Open the AddToHumidorSheet for "Move to Humidor" */
  function handleMoveToHumidor(cigarId: string) {
    setSheetCigarId(cigarId);
  }

  /* After successfully adding to humidor via "Move to Humidor", remove from wishlist */
  async function handleMoveSuccess() {
    if (!sheetCigarId) return;
    setToast("Moved to your humidor!");

    /* Find and remove the wishlist item for this cigar */
    const wishlistItem = items.find((i) => i.cigar_id === sheetCigarId);
    if (wishlistItem) {
      setItems((cur) => cur.filter((i) => i.id !== wishlistItem.id)); /* optimistic */

      const supabase = createClient();
      await supabase
        .from("humidor_items")
        .delete()
        .eq("id", wishlistItem.id);
    }
  }

  return (
    <>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Tab navigation */}
        <div className="flex border-b border-border/50 -mx-4 sm:-mx-6 px-4 sm:px-6">
          <Link
            href="/humidor"
            className="px-1 pb-3 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors duration-150 mr-6"
          >
            Humidor
          </Link>
          <span
            className="px-1 pb-3 text-sm font-medium border-b-2 mr-6"
            style={{ borderColor: "var(--primary)", color: "var(--foreground)" }}
          >
            Wishlist
          </span>
          <Link
            href="/humidor/stats"
            className="px-1 pb-3 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors duration-150"
          >
            Stats
          </Link>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 style={{ fontFamily: "var(--font-serif)" }}>Wishlist</h1>
            <p className="text-sm text-muted-foreground">
              Cigars you want to try next
            </p>
          </div>
          {items.length > 0 && (
            <span className="badge text-xs px-3 py-1">
              {items.length} {items.length === 1 ? "cigar" : "cigars"}
            </span>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <button type="button" className="btn btn-secondary" onClick={fetchWishlist}>
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="text-muted-foreground/35">
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
                <path
                  d="M28 48s-20-10.4-20-24a12 12 0 0124 0 12 12 0 0124 0C56 37.6 36 48 28 48z"
                  stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <p className="text-base font-medium text-foreground">
                Your wishlist is empty
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Browse cigars to find your next smoke
              </p>
            </div>
            <Link href="/discover/cigars" className="btn btn-primary mt-2">
              Browse Cigars
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <WishlistCard
                key={item.id}
                item={item}
                onRemove={handleRemove}
                onMoveToHumidor={handleMoveToHumidor}
                menuOpenId={menuOpenId}
                setMenuOpenId={setMenuOpenId}
              />
            ))}
          </div>
        )}
      </div>

      {/* AddToHumidorSheet for "Move to Humidor" */}
      <AddToHumidorSheet
        cigarId={sheetCigarId ?? ""}
        isOpen={!!sheetCigarId}
        onClose={() => setSheetCigarId(null)}
        onSuccess={handleMoveSuccess}
      />
    </>
  );
}
