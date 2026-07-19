"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import useSWR from "swr";
import dynamic from "next/dynamic";
import Link from "next/link";
import { IntentLink } from "@/components/ui/IntentLink";
import { CigarImage } from "@/components/ui/CigarImage";
import { AddCigarOptions } from "@/components/humidor/AddCigarOptions";
import { HumidorConditions } from "@/components/govee/HumidorConditions";
import { HumidorSheet } from "@/components/humidor/HumidorSheet";
import { useHumidors } from "@/components/humidor/useHumidors";
import { humidorsTitle } from "@/lib/humidor/overview";
import type { Humidor } from "@/lib/data/humidors";
import { Toast } from "@/components/ui/toast";
import { keyFor } from "@/lib/data/keys";
import { agingDays } from "@/lib/format";
import { fetchProfileLite } from "@/lib/data/profile-client";
import { getMembershipTier } from "@/lib/membership";
import {
  fetchHumidorItems,
  fetchHasWishlistItems,
} from "@/lib/data/humidor-fetchers";

/* AddCigarSheet (873 lines) and CigarBandScanner (579 lines) are
   only mounted after user interaction. Lazy-loading shaves their
   chunks off the Humidor route's initial bundle. ssr:false because
   neither sheet has any meaningful server-render output. */
const AddCigarSheet = dynamic(
  () => import("@/components/humidor/AddCigarSheet").then((m) => ({ default: m.AddCigarSheet })),
  { ssr: false },
);
const CigarBandScanner = dynamic(
  () => import("@/components/humidor/CigarBandScanner").then((m) => ({ default: m.CigarBandScanner })),
  { ssr: false },
);
import { SkeletonGridCard, SkeletonListRow } from "@/components/ui/skeleton-card";
import { ViewToggle, ViewMode } from "@/components/ui/view-toggle";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface Cigar {
  id: string;
  brand: string | null;
  series: string | null;
  format: string | null;
  wrapper: string | null;
  wrapper_country: string | null;
  ring_gauge: number | null;
  length_inches: number | null;
  image_url: string | null;
}

export interface HumidorItem {
  id: string;
  cigar_id: string;
  quantity: number;
  purchase_date: string | null;
  price_paid_cents: number | null;
  aging_start_date: string | null;
  notes: string | null;
  created_at: string;
  cigar: Cigar;
  /* Optional until Task 9 adds it to the fetcher select; treat missing
     as unassigned (null) everywhere it's consumed below. */
  humidor_id?: string | null;
}

// ViewMode is imported from @/components/ui/view-toggle
type SortOption =
  | "date_newest"
  | "date_oldest"
  | "brand_asc"
  | "brand_desc"
  | "aging_longest"
  | "price_highest";

/* ------------------------------------------------------------------
   Constants
   ------------------------------------------------------------------ */

/* Stable reference so SWR's `data = initialItems ?? EMPTY_ITEMS`
   default doesn't create a new array each render (which would break
   downstream useMemo deps). */
const EMPTY_ITEMS: HumidorItem[] = [];

const SORT_LABELS: Record<SortOption, string> = {
  date_newest:   "Date Added (newest)",
  date_oldest:   "Date Added (oldest)",
  brand_asc:     "Brand A–Z",
  brand_desc:    "Brand Z–A",
  aging_longest: "Aging (longest)",
  price_highest: "Price (highest)",
};

/* Humidor filter chips — mirrors HumidorSheet's chipStyle. */
const chipStyle = (active: boolean): React.CSSProperties => ({
  fontSize: 13,
  padding: "8px 14px",
  borderRadius: 999,
  border: `1px solid ${active ? "var(--gold)" : "var(--border)"}`,
  background: active ? "var(--secondary)" : "transparent",
  color: active ? "var(--foreground)" : "var(--muted-foreground)",
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
});
const dashedChipStyle: React.CSSProperties = {
  ...chipStyle(false),
  borderStyle: "dashed",
  color: "var(--gold)",
};

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

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
      return arr.sort((a, b) => (a.cigar.brand ?? "").localeCompare(b.cigar.brand ?? ""));
    case "brand_desc":
      return arr.sort((a, b) => (b.cigar.brand ?? "").localeCompare(a.cigar.brand ?? ""));
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
   Grid card
   ------------------------------------------------------------------ */

function GridCard({ item, tagName }: { item: HumidorItem; tagName?: string }) {
  const c = item.cigar;
  const days = agingDays(item.aging_start_date);
  const displayName = c.series ?? c.format;

  return (
    // IntentLink — humidor grids can contain 50+ cards. Auto-prefetch
    // would fire an RSC fetch for every visible card on render, burning
    // edge requests + bandwidth on items the user may never tap. Intent-
    // based prefetch (hover / first touch) gives a route-transition head
    // start on the cards the user actually engages with.
    <IntentLink
      href={`/humidor/${item.id}`}
      className="block"
      /* content-visibility: auto skips layout/paint for cards outside
         the viewport. containIntrinsicSize reserves a height so the
         scroll position stays stable until the card scrolls in.
         Saves INP on scroll and on SWR list re-renders (large humidors
         no longer pay the full mount cost for off-screen cards). */
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 320px" }}
    >
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

        {/* Cigar image */}
        <div className="w-full aspect-[4/3] bg-muted overflow-hidden flex-shrink-0 relative">
          <CigarImage
            imageUrl={c.image_url}
            wrapper={c.wrapper}
            alt={c.series ?? c.format ?? ""}
            fill
            sizes="(min-width: 768px) 25vw, 50vw"
            quality={60}
            className="object-contain"
          />
        </div>

        {/* Info */}
        <div className="px-3 pb-3 flex flex-col gap-1 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground truncate">
            {c.brand}
          </p>
          <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
            {displayName}
          </p>
          {tagName && (
            <p
              className="truncate"
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--gold)" }}
            >
              {tagName}
            </p>
          )}
          {c.format && (
            <p className="text-xs text-muted-foreground">{c.format}</p>
          )}

          <div className="flex items-center justify-between mt-auto pt-1.5 flex-wrap gap-1">
            <AgingBadge days={days} />
            {c.wrapper && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                {c.wrapper}
              </span>
            )}
          </div>
        </div>
      </div>
    </IntentLink>
  );
}

/* ------------------------------------------------------------------
   List row
   ------------------------------------------------------------------ */

function ListRow({ item, tagName }: { item: HumidorItem; tagName?: string }) {
  const c = item.cigar;
  const days = agingDays(item.aging_start_date);
  const displayName = c.series ?? c.format;

  return (
    <IntentLink
      href={`/humidor/${item.id}`}
      className="block"
      /* See GridCard for rationale. List rows are denser and fixed-
         height, so the reserved intrinsic size is much smaller. */
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 72px" }}
    >
      <div className="card card-interactive flex items-center gap-3 p-3">
        {/* Thumbnail */}
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0 relative">
          <CigarImage
            imageUrl={c.image_url}
            wrapper={c.wrapper}
            alt={c.series ?? c.format ?? ""}
            fill
            sizes="48px"
            quality={70}
            className="object-contain"
          />
        </div>

        {/* Brand + name + aging.
            Aging lives inside the text column (not as a separate row
            item) so it's visible on every viewport width, including
            narrow mobile. AgingBadge returns null when days === 0,
            so cigars without an aging start show nothing extra. */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
            {c.brand}
          </p>
          <p className="text-sm font-semibold text-foreground truncate">
            {displayName}
          </p>
          {tagName && (
            <p
              className="truncate"
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--gold)" }}
            >
              {tagName}
            </p>
          )}
          {c.format && (
            <p className="text-xs text-muted-foreground">{c.format}</p>
          )}
          {days > 0 && (
            <div className="mt-0.5">
              <AgingBadge days={days} />
            </div>
          )}
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

        {/* Wrapper (hidden on mobile) */}
        {c.wrapper && (
          <span className="flex-shrink-0 text-[10px] font-medium hidden md:block text-muted-foreground">
            {c.wrapper}
          </span>
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
    </IntentLink>
  );
}

/* ------------------------------------------------------------------
   Empty state
   ------------------------------------------------------------------ */

function EmptyState({ hasWishlist, onAdd }: { hasWishlist: boolean; onAdd: () => void }) {
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
        <button type="button" onClick={onAdd} className="btn btn-primary">
          Add your first cigar
        </button>
        {hasWishlist && (
          <Link href="/humidor/wishlist" className="btn btn-ghost text-sm">
            Or add from wishlist
          </Link>
        )}
      </div>
    </div>
  );
}

/* ViewToggle and its icons are imported from @/components/ui/view-toggle */

/* ------------------------------------------------------------------
   HumidorClient
   ─────────────────────────────────────────────────────────────────
   Receives server-fetched data as props so the cigar grid renders
   immediately with the page — no loading skeleton on initial render.
   Manual refresh is the route-level pull-to-refresh gesture; the
   internal refresh() below re-fetches client-side after add/scan
   flows.
   ------------------------------------------------------------------ */

interface HumidorClientProps {
  /** Server-seeded data. Omitted on the client-shell route — the
      component then fetches on mount. */
  initialItems?:       HumidorItem[];
  initialHasWishlist?: boolean;
  userId:              string;
}

export function HumidorClient({
  initialItems,
  initialHasWishlist,
  userId,
}: HumidorClientProps) {
  /*
   * SWR-managed humidor list. Keyed on userId so a sign-in-as-different-
   * user produces a fresh cache entry, not stale data from User A.
   * fallbackData seeds the cache from the server's initial render —
   * SWR uses it on the very first render, then takes over on subsequent
   * renders of the same key. revalidateOnMount: false because the
   * server already provided fresh data; we don't want a redundant
   * Supabase round-trip on every navigation TO /humidor.
   */
  const {
    data:       items     = initialItems ?? EMPTY_ITEMS,
    isLoading,
    isValidating: loading,
    error:      itemsError,
    mutate:     mutateItems,
  } = useSWR(
    keyFor.humidorItems(userId),
    () => fetchHumidorItems(userId),
    {
      fallbackData:      initialItems,
      /* When unseeded (client-shell route) fetch on mount; when the
         server seeded us (legacy path) skip the redundant round-trip. */
      revalidateOnMount: initialItems === undefined,
    },
  );

  /*
   * Wishlist boolean — small HEAD count query. Mirrors humidor list
   * cache behaviour (SWR-cached, refresh on demand) so adding an item
   * to the wishlist via another surface invalidates the empty-state
   * "Or add from wishlist" CTA correctly.
   */
  const {
    data:   hasWishlist = initialHasWishlist ?? false,
    mutate: mutateHasWishlist,
  } = useSWR(
    keyFor.hasWishlist(userId),
    () => fetchHasWishlistItems(userId),
    {
      fallbackData:      initialHasWishlist,
      revalidateOnMount: initialHasWishlist === undefined,
    },
  );

  /*
   * Refresh both keys together after add/scan flows complete. Returns
   * a Promise so callers can await the refetch if needed. (User-
   * initiated refresh is the route-level pull-to-refresh gesture.)
   */
  const refresh = () =>
    Promise.all([mutateItems(), mutateHasWishlist()]);

  const error = itemsError ? "Failed to load your humidor. Please try again." : null;
  /* List is the default for visitors with no saved preference — it's
     denser per row, surfaces aging inline, and matches the route-
     prefetch skeleton. Returning users' saved preference (localStorage
     `humidor_view`) is honoured by the mount-time effect below, so
     anyone who explicitly picked grid keeps grid. */
  const [view,         setView]         = useState<ViewMode>("list");
  const [sort,         setSort]         = useState<SortOption>("date_newest");
  const [showOptions,  setShowOptions]  = useState(false);
  const [showScanner,  setShowScanner]  = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);

  /* Multi-humidor filter + sheet state. `selected` resets to "all" in
     the HumidorSheet onChanged callback below if the selected humidor
     is deleted. */
  const [selected,       setSelected]       = useState<string>("all");
  const [sheetOpen,      setSheetOpen]      = useState(false);
  const [editingHumidor, setEditingHumidor] = useState<Humidor | null>(null);
  const [toast,          setToast]          = useState<string | null>(null);

  const hasMounted = useRef(false);

  const { humidors, mutate: mutateHumidors } = useHumidors(userId);
  const multi = (humidors?.length ?? 0) >= 2;

  /* Tier — read the same way useGoveeStatus's caller does: profile via
     SWR, membership derived from it. Default "free" until it loads so
     HumidorSheet renders its free-tier upsell rather than a flash of
     the member form. */
  const { data: profile } = useSWR(
    keyFor.profile(userId),
    () => fetchProfileLite(userId),
  );
  const tier = profile ? getMembershipTier(profile) : "free";

  /* Fixed header height tracking */
  const headerRef    = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setHeaderHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /*
   * Persist view preference + auto-open add sheet from ?add=true.
   *
   * Reading localStorage via lazy useState init would cause a hydration
   * mismatch (server renders "list", client may rehydrate as "grid"
   * for a returning user who picked grid before). Standard pattern:
   * render SSR-safe default, then sync preference after mount. The
   * react-hooks/set-state-in-effect rule doesn't model this case —
   * disabled per-line with rationale.
   */
  useEffect(() => {
    const saved = localStorage.getItem("humidor_view") as ViewMode | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "list" || saved === "grid") setView(saved);
    hasMounted.current = true;
    if (new URLSearchParams(window.location.search).get("add") === "true") {
      setShowOptions(true);
    }
  }, []);

  useEffect(() => {
    if (hasMounted.current) localStorage.setItem("humidor_view", view);
  }, [view]);

  /* Humidor id → name, used for the "All" view tag on cards and the
     count/value line's " in {name}" suffix. */
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of humidors ?? []) m.set(h.id, h.name);
    return m;
  }, [humidors]);

  /* Cigar counts per humidor (quantity-summed), fed to HumidorConditions'
     expanded row and the delete-confirmation copy in HumidorSheet. */
  const countsByHumidor = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) {
      if (i.humidor_id) m.set(i.humidor_id, (m.get(i.humidor_id) ?? 0) + i.quantity);
    }
    return m;
  }, [items]);

  /* Derived — filtered by selected humidor, then sorted */
  const visible = useMemo(
    () => (selected === "all" ? items : items.filter((i) => i.humidor_id === selected)),
    [items, selected],
  );
  const displayed = useMemo(() => sortItems(visible, sort), [visible, sort]);

  /* Stats — computed over the visible (filtered) set so a per-humidor
     view reads "8 cigars in Tupperdor" rather than the whole-collection
     total. */
  const totalCount = visible.reduce((s, i) => s + i.quantity, 0);
  const totalValueCents = visible.reduce((s, i) => {
    if (i.price_paid_cents == null) return s;
    return s + i.quantity * i.price_paid_cents;
  }, 0);
  const hasValue = totalValueCents > 0;
  const selectedHumidorName = selected !== "all" ? nameById.get(selected) : undefined;

  return (
    <>
      {/* ── Fixed header ─────────────────────────────────────────── */}
      <div
        ref={headerRef}
        style={{
          position: "fixed",
          top: 0,
          left: "var(--app-content-left)",
          right: 0,
          zIndex: 30,
          backgroundColor: "var(--background)",
          borderBottom: "1px solid var(--border)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">

          {/* Row 1: Tab navigation */}
          <div className="flex border-b border-border/50">
            <span
              className="px-1 pb-3 pt-4 text-sm font-medium border-b-2 mr-6"
              style={{ borderColor: "var(--ember, #E8642C)", color: "var(--foreground)" }}
            >
              Humidor
            </span>
            <Link
              href="/humidor/wishlist"
              className="px-1 pb-3 pt-4 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors duration-150 mr-6"
            >
              Wishlist
            </Link>
            <Link
              href="/humidor/burn-reports"
              className="px-1 pb-3 pt-4 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors duration-150 mr-6"
            >
              Burn Reports
            </Link>
            <Link
              href="/humidor/stats"
              className="px-1 pb-3 pt-4 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors duration-150"
            >
              Stats
            </Link>
          </div>

          {/* Row 2: Title + Add Cigar */}
          <div className="flex items-start justify-between gap-4 pt-4 pb-3">
            <div className="space-y-0.5">
              <h1 style={{ fontFamily: "var(--font-serif)" }}>
                {humidorsTitle(humidors?.length ?? 1)}
              </h1>
              {!loading && visible.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {totalCount} {totalCount === 1 ? "cigar" : "cigars"}
                  {selectedHumidorName ? ` in ${selectedHumidorName}` : ""}
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
            <button
              onClick={() => setShowOptions(true)}
              className="btn btn-primary flex-shrink-0"
            >
              Add Cigar
            </button>
          </div>

          {/* Row 2.5: Humidor chips */}
          <div
            className="flex items-center gap-2 overflow-x-auto pb-3"
            style={{ scrollbarWidth: "none" }}
          >
            {multi ? (
              <>
                <button
                  type="button"
                  onClick={() => setSelected("all")}
                  style={chipStyle(selected === "all")}
                >
                  All
                </button>
                {(humidors ?? []).map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setSelected(h.id)}
                    style={chipStyle(selected === h.id)}
                  >
                    {h.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setEditingHumidor(null); setSheetOpen(true); }}
                  style={dashedChipStyle}
                >
                  + New
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => { setEditingHumidor(null); setSheetOpen(true); }}
                style={dashedChipStyle}
              >
                + New Humidor
              </button>
            )}
          </div>

        </div>
      </div>

      {/* ── Spacer so content starts below fixed header ──────────── */}
      <div style={{ height: headerHeight }} aria-hidden="true" />

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
        <div className="empty:hidden" style={{ marginBottom: 12 }}>
          <HumidorConditions
            userId={userId}
            humidorId={selected === "all" ? null : selected}
            counts={countsByHumidor}
            onSelect={(id) => setSelected(id)}
            onEdit={(id) => {
              const h = humidors?.find((x) => x.id === id) ?? null;
              setEditingHumidor(h);
              setSheetOpen(true);
            }}
          />
        </div>

        {/* Row 3: Sort + View toggle (only when there is/may be content) */}
        {(loading || items.length > 0) && (
          <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
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

            {/* View toggle pushed to the right */}
            <div className="ml-auto flex items-center gap-2">
              <ViewToggle view={view} onChange={setView} />
            </div>
          </div>
        )}

        {(isLoading || loading) ? (
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
            <button type="button" className="btn btn-secondary" onClick={() => refresh()}>
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState hasWishlist={hasWishlist} onAdd={() => setShowOptions(true)} />
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-16">
            No cigars in this humidor yet.
          </p>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {displayed.map((item) => (
              <GridCard
                key={item.id}
                item={item}
                tagName={multi && selected === "all" ? nameById.get(item.humidor_id ?? "") : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {displayed.map((item) => (
              <ListRow
                key={item.id}
                item={item}
                tagName={multi && selected === "all" ? nameById.get(item.humidor_id ?? "") : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {showOptions && (
        <AddCigarOptions
          onScan={() => { setShowOptions(false); setShowScanner(true); }}
          onSearch={() => { setShowOptions(false); setShowAddSheet(true); }}
          onClose={() => setShowOptions(false)}
        />
      )}

      {showScanner && (
        <CigarBandScanner
          onClose={() => setShowScanner(false)}
          onAdded={() => { setShowScanner(false); refresh(); }}
          onSearch={() => { setShowScanner(false); setShowAddSheet(true); }}
        />
      )}

      <AddCigarSheet
        open={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        onAdded={() => { refresh(); }}
      />

      <HumidorSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        userId={userId}
        tier={tier}
        humidors={humidors ?? []}
        editing={editingHumidor}
        deleteCount={editingHumidor ? (countsByHumidor.get(editingHumidor.id) ?? 0) : 0}
        onChanged={async () => {
          await mutateHumidors();
          if (selected !== "all" && !(humidors ?? []).some((h) => h.id === selected)) {
            setSelected("all");
          }
        }}
        onToast={setToast}
      />

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}
