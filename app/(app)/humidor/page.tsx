"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

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
  image_url: string | null;
  avg_rating: number | null;
}

interface HumidorItem {
  id: string;
  cigar_id: string;
  quantity: number;
  purchase_date: string | null;
  price_paid_cents: number | null;
  aging_start_date: string | null;
  notes: string | null;
  created_at: string;
  cigar: Cigar;
}

type ViewMode = "grid" | "list";
type SortOption =
  | "date_newest"
  | "date_oldest"
  | "brand_asc"
  | "brand_desc"
  | "rating_highest"
  | "aging_longest"
  | "price_highest";
type StrengthFilter =
  | "all"
  | "mild"
  | "mild_medium"
  | "medium"
  | "medium_full"
  | "full";

/* ------------------------------------------------------------------
   Constants
   ------------------------------------------------------------------ */

const SORT_LABELS: Record<SortOption, string> = {
  date_newest:    "Date Added (newest)",
  date_oldest:    "Date Added (oldest)",
  brand_asc:      "Brand A–Z",
  brand_desc:     "Brand Z–A",
  rating_highest: "Rating (highest)",
  aging_longest:  "Aging (longest)",
  price_highest:  "Price (highest)",
};

const STRENGTH_FILTER_LABELS: Record<StrengthFilter, string> = {
  all:         "All strengths",
  mild:        "Mild",
  mild_medium: "Mild-Medium",
  medium:      "Medium",
  medium_full: "Medium-Full",
  full:        "Full",
};

const STRENGTH_LABEL: Record<string, string> = {
  mild:        "Mild",
  mild_medium: "Mild-Medium",
  medium:      "Medium",
  medium_full: "Medium-Full",
  full:        "Full",
};

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

function agingDays(startDate: string | null): number {
  if (!startDate) return 0;
  return Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(startDate).getTime()) / 86_400_000
    )
  );
}

function sortItems(items: HumidorItem[], sort: SortOption): HumidorItem[] {
  const arr = [...items];
  switch (sort) {
    case "date_newest":
      return arr.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    case "date_oldest":
      return arr.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    case "brand_asc":
      return arr.sort((a, b) => a.cigar.brand.localeCompare(b.cigar.brand));
    case "brand_desc":
      return arr.sort((a, b) => b.cigar.brand.localeCompare(a.cigar.brand));
    case "rating_highest":
      return arr.sort(
        (a, b) => (b.cigar.avg_rating ?? 0) - (a.cigar.avg_rating ?? 0)
      );
    case "aging_longest":
      return arr.sort(
        (a, b) => agingDays(b.aging_start_date) - agingDays(a.aging_start_date)
      );
    case "price_highest":
      return arr.sort(
        (a, b) => (b.price_paid_cents ?? 0) - (a.price_paid_cents ?? 0)
      );
  }
}

function filterItems(items: HumidorItem[], filter: StrengthFilter): HumidorItem[] {
  if (filter === "all") return items;
  return items.filter((i) => i.cigar.strength === filter);
}

/* ------------------------------------------------------------------
   Brand-initial placeholder (deterministic muted color per brand)
   ------------------------------------------------------------------ */

function BrandPlaceholder({ brand }: { brand: string }) {
  let hash = 0;
  for (let i = 0; i < brand.length; i++) {
    hash = (hash << 5) - hash + brand.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return (
    <div
      className="flex items-center justify-center w-full h-full text-2xl font-semibold select-none"
      style={{
        backgroundColor: `hsl(${hue}, 18%, 16%)`,
        color: `hsl(${hue}, 35%, 60%)`,
        fontFamily: "var(--font-serif)",
      }}
    >
      {brand.charAt(0).toUpperCase()}
    </div>
  );
}

/* ------------------------------------------------------------------
   Aging indicator
   ------------------------------------------------------------------ */

function AgingBadge({ days }: { days: number }) {
  if (days === 0) return null;

  if (days < 30) {
    return (
      <span className="text-[11px] text-muted-foreground">
        Aging: {days}d
      </span>
    );
  }
  if (days < 90) {
    return (
      <span
        className="text-[11px] px-1.5 py-0.5 rounded font-medium"
        style={{ backgroundColor: "var(--secondary)", color: "var(--foreground)" }}
      >
        Aging: {days}d
      </span>
    );
  }
  if (days < 180) {
    return (
      <span className="text-[11px] font-medium" style={{ color: "var(--primary)" }}>
        Aging: {days}d
      </span>
    );
  }
  return (
    <span
      className="text-[11px] font-medium"
      style={{ color: "var(--accent)" }}
      title="Well rested"
    >
      Aging: {days}d ✦
    </span>
  );
}

/* ------------------------------------------------------------------
   Rating stars
   ------------------------------------------------------------------ */

function RatingStars({ rating }: { rating: number }) {
  const filled = Math.round(rating / 2); // 0–10 → 0–5
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating.toFixed(1)} out of 10`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill={i < filled ? "var(--primary)" : "none"}
          stroke="var(--primary)"
          strokeWidth="0.8"
          aria-hidden="true"
        >
          <polygon points="5,1 6.2,3.8 9.5,3.8 7,5.8 7.9,9 5,7.2 2.1,9 3,5.8 0.5,3.8 3.8,3.8" />
        </svg>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------
   Skeletons
   ------------------------------------------------------------------ */

function SkeletonGridCard() {
  return (
    <div className="card animate-pulse flex flex-col gap-3">
      <div className="w-full aspect-[4/3] rounded-lg bg-muted" />
      <div className="flex flex-col gap-2">
        <div className="h-2.5 bg-muted rounded w-1/3" />
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-2.5 bg-muted rounded w-1/4" />
        <div className="h-3 bg-muted rounded w-1/2 mt-1" />
      </div>
    </div>
  );
}

function SkeletonListRow() {
  return (
    <div className="card animate-pulse flex items-center gap-4 py-3">
      <div className="w-12 h-12 rounded-lg bg-muted flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-2.5 bg-muted rounded w-1/4" />
        <div className="h-4 bg-muted rounded w-1/2" />
      </div>
      <div className="h-3 bg-muted rounded w-12 hidden sm:block" />
      <div className="h-3 bg-muted rounded w-16 hidden sm:block" />
    </div>
  );
}

/* ------------------------------------------------------------------
   Grid card
   ------------------------------------------------------------------ */

function GridCard({ item }: { item: HumidorItem }) {
  const c = item.cigar;
  const days = agingDays(item.aging_start_date);
  const displayName =
    c.name && c.name !== c.line ? `${c.line} — ${c.name}` : c.line;

  return (
    <Link href={`/discover/cigars/${c.id}`} className="block">
      <div className="card card-interactive relative flex flex-col gap-2 h-full p-0 overflow-hidden">
        {/* Quantity badge */}
        {item.quantity > 1 && (
          <div
            className="absolute top-2 right-2 z-10 text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: "var(--secondary)",
              color: "var(--foreground)",
            }}
          >
            ×{item.quantity}
          </div>
        )}

        {/* Image / brand placeholder */}
        <div className="w-full aspect-[4/3] bg-muted overflow-hidden flex-shrink-0">
          {c.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.image_url}
              alt={`${c.brand} ${c.line}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <BrandPlaceholder brand={c.brand} />
          )}
        </div>

        {/* Info */}
        <div className="px-3 pb-3 flex flex-col gap-1 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground truncate">
            {c.brand}
          </p>
          <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
            {displayName}
          </p>
          <p className="text-xs text-muted-foreground">{c.vitola}</p>

          <div className="flex items-center justify-between mt-auto pt-1.5 flex-wrap gap-1">
            <AgingBadge days={days} />
            {c.avg_rating != null && (
              <RatingStars rating={c.avg_rating} />
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------
   List row
   ------------------------------------------------------------------ */

function ListRow({ item }: { item: HumidorItem }) {
  const c = item.cigar;
  const days = agingDays(item.aging_start_date);
  const displayName =
    c.name && c.name !== c.line ? `${c.line} — ${c.name}` : c.line;

  return (
    <Link href={`/discover/cigars/${c.id}`} className="block">
      <div className="card card-interactive flex items-center gap-3 p-3">
        {/* Thumbnail */}
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
          {c.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.image_url}
              alt={`${c.brand} ${c.line}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <BrandPlaceholder brand={c.brand} />
          )}
        </div>

        {/* Brand + name */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
            {c.brand}
          </p>
          <p className="text-sm font-semibold text-foreground truncate">
            {displayName}
          </p>
          <p className="text-xs text-muted-foreground">{c.vitola}</p>
        </div>

        {/* Quantity */}
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{
            backgroundColor: "var(--secondary)",
            color: "var(--foreground)",
          }}
        >
          ×{item.quantity}
        </span>

        {/* Aging (hidden on small mobile) */}
        <div className="flex-shrink-0 hidden sm:block">
          <AgingBadge days={days} />
        </div>

        {/* Strength badge (hidden on mobile) */}
        <span className="flex-shrink-0 text-[10px] font-medium hidden md:block text-muted-foreground">
          {STRENGTH_LABEL[c.strength] ?? c.strength}
        </span>

        {/* Rating */}
        {c.avg_rating != null && (
          <div className="flex-shrink-0 hidden sm:block">
            <RatingStars rating={c.avg_rating} />
          </div>
        )}

        {/* Chevron */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="flex-shrink-0 text-muted-foreground/50"
          aria-hidden="true"
        >
          <path
            d="M5 3L9 7L5 11"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------
   Empty state
   ------------------------------------------------------------------ */

function EmptyState({ hasWishlist }: { hasWishlist: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div className="text-muted-foreground/30">
        <svg
          width="72"
          height="72"
          viewBox="0 0 72 72"
          fill="none"
          aria-hidden="true"
        >
          {/* Humidor box */}
          <rect
            x="8"
            y="24"
            width="56"
            height="36"
            rx="4"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M8 36h56"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          {/* Latch */}
          <rect
            x="30"
            y="33"
            width="12"
            height="6"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          {/* Cigar slots (hint) */}
          <line x1="20" y1="44" x2="52" y2="44" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
          <line x1="20" y1="50" x2="52" y2="50" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
          {/* Lid handle */}
          <path
            d="M28 24V16a8 8 0 0116 0v8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.4"
          />
        </svg>
      </div>
      <div>
        <h2
          className="text-xl text-foreground"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Your humidor is empty
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Start building your collection
        </p>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
        <Link href="/discover/cigars" className="btn btn-primary">
          Add your first cigar
        </Link>
        {hasWishlist && (
          <Link href="/humidor/wishlist" className="btn btn-ghost text-sm">
            Or add from wishlist
          </Link>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   View toggle icons
   ------------------------------------------------------------------ */

function GridIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      style={{ color: active ? "var(--foreground)" : "var(--muted-foreground)" }}
      aria-hidden="true"
    >
      <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function ListIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      style={{ color: active ? "var(--foreground)" : "var(--muted-foreground)" }}
      aria-hidden="true"
    >
      <line x1="1" y1="4" x2="15" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="1" y1="12" x2="15" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------
   Page
   ------------------------------------------------------------------ */

export default function HumidorPage() {
  const [items, setItems] = useState<HumidorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasWishlist, setHasWishlist] = useState(false);
  const [view, setView] = useState<ViewMode>("grid");
  const [sort, setSort] = useState<SortOption>("date_newest");
  const [strengthFilter, setStrengthFilter] = useState<StrengthFilter>("all");
  const hasMounted = useRef(false);

  /* Persist view preference */
  useEffect(() => {
    const saved = localStorage.getItem("humidor_view") as ViewMode | null;
    if (saved === "list" || saved === "grid") setView(saved);
    hasMounted.current = true;
  }, []);

  useEffect(() => {
    if (hasMounted.current) localStorage.setItem("humidor_view", view);
  }, [view]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    /* Fetch humidor items with embedded cigar data */
    const { data, error: fetchError } = await supabase
      .from("humidor_items")
      .select("*, cigar:cigars(*)")
      .eq("user_id", user.id)
      .eq("is_wishlist", false)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError("Failed to load your humidor. Please try again.");
      setLoading(false);
      return;
    }

    setItems((data as HumidorItem[]) ?? []);

    /* Check for wishlist items (for empty state CTA) */
    const { count } = await supabase
      .from("humidor_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_wishlist", true);

    setHasWishlist((count ?? 0) > 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  /* Derived — sort then filter */
  const displayed = filterItems(sortItems(items, sort), strengthFilter);

  /* Stats */
  const totalCount = items.reduce((s, i) => s + i.quantity, 0);
  const totalValueCents = items.reduce((s, i) => {
    if (i.price_paid_cents == null) return s;
    return s + i.quantity * i.price_paid_cents;
  }, 0);
  const hasValue = totalValueCents > 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

      {/* ── Tab navigation ──────────────────────────────────────── */}
      <div className="flex border-b border-border/50 -mx-4 sm:-mx-6 px-4 sm:px-6">
        <span
          className="px-1 pb-3 text-sm font-medium border-b-2 mr-6"
          style={{ borderColor: "var(--primary)", color: "var(--foreground)" }}
        >
          Humidor
        </span>
        <Link
          href="/humidor/wishlist"
          className="px-1 pb-3 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors duration-150"
        >
          Wishlist
        </Link>
      </div>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 style={{ fontFamily: "var(--font-serif)" }}>My Humidor</h1>
          {!loading && items.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {totalCount} {totalCount === 1 ? "cigar" : "cigars"}
              {hasValue && (
                <>
                  {" · "}Est.{" "}
                  <span style={{ color: "var(--gold)" }}>
                    ${(totalValueCents / 100).toLocaleString("en-US", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </>
              )}
            </p>
          )}
        </div>
        <Link href="/discover/cigars" className="btn btn-primary flex-shrink-0">
          Add Cigar
        </Link>
      </div>

      {/* ── Controls row ────────────────────────────────────────── */}
      {(loading || items.length > 0) && (
        <div className="flex flex-wrap items-center gap-3">
          {/* View toggle */}
          <div
            className="flex items-center rounded-lg overflow-hidden border border-border/50 flex-shrink-0"
            role="group"
            aria-label="View mode"
          >
            <button
              type="button"
              onClick={() => setView("grid")}
              className="px-3 py-2 transition-colors duration-150"
              style={{
                backgroundColor:
                  view === "grid" ? "var(--secondary)" : "transparent",
              }}
              aria-pressed={view === "grid"}
              aria-label="Grid view"
            >
              <GridIcon active={view === "grid"} />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className="px-3 py-2 transition-colors duration-150"
              style={{
                backgroundColor:
                  view === "list" ? "var(--secondary)" : "transparent",
              }}
              aria-pressed={view === "list"}
              aria-label="List view"
            >
              <ListIcon active={view === "list"} />
            </button>
          </div>

          {/* Sort */}
          <select
            className="input py-2 text-sm flex-1 sm:flex-none sm:w-52"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            aria-label="Sort by"
          >
            {(Object.keys(SORT_LABELS) as SortOption[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>

          {/* Strength filter */}
          <select
            className="input py-2 text-sm flex-1 sm:flex-none sm:w-44"
            value={strengthFilter}
            onChange={(e) => setStrengthFilter(e.target.value as StrengthFilter)}
            aria-label="Filter by strength"
          >
            {(Object.keys(STRENGTH_FILTER_LABELS) as StrengthFilter[]).map(
              (key) => (
                <option key={key} value={key}>
                  {STRENGTH_FILTER_LABELS[key]}
                </option>
              )
            )}
          </select>

          {/* Refresh */}
          <button
            type="button"
            onClick={fetchItems}
            disabled={loading}
            className="btn btn-ghost p-2 flex-shrink-0 ml-auto"
            aria-label="Refresh"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              className={loading ? "animate-spin" : ""}
            >
              <path
                d="M14 8A6 6 0 112 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M14 4v4h-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────────── */}
      {loading ? (
        view === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonGridCard key={i} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonListRow key={i} />
            ))}
          </div>
        )
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <button type="button" className="btn btn-secondary" onClick={fetchItems}>
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState hasWishlist={hasWishlist} />
      ) : displayed.length === 0 ? (
        /* No results after filtering */
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <p className="text-base font-medium text-foreground">
            No {STRENGTH_FILTER_LABELS[strengthFilter]} cigars in your humidor
          </p>
          <button
            type="button"
            className="text-sm text-muted-foreground underline underline-offset-2"
            onClick={() => setStrengthFilter("all")}
          >
            Clear filter
          </button>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {displayed.map((item) => (
            <GridCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {displayed.map((item) => (
            <ListRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
