"use client";

import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import Link from "next/link";
import dynamic from "next/dynamic";
import { createClient } from "@/utils/supabase/client";
import type { CatalogResult } from "@/lib/data/cigar-fetchers";
import { keyFor } from "@/lib/data/keys";
import { fetchWishlistItems } from "@/lib/data/humidor-fetchers";
import { revalidateHumidor } from "@/lib/data/humidor-cache";
import { loadCigarDraft } from "@/lib/cigars/cigar-draft";
import { cigarDisplayName } from "@/lib/cigars/line-group";

/* AddFlowSheet is always mounted but lazy-loaded so its chunk fetches
   in parallel with the main bundle. */
const AddFlowSheet = dynamic(
  () => import("@/components/cigars/add-flow/AddFlowSheet").then((m) => ({ default: m.AddFlowSheet })),
  { ssr: false },
);
import { Toast } from "@/components/ui/toast";
import { ViewToggle, ViewMode } from "@/components/ui/view-toggle";
import { CigarTitle } from "@/components/cigars/CigarTitle";
import { CigarImage } from "@/components/ui/CigarImage";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

export interface WishlistItem {
  id:         string;
  cigar_id:   string;
  created_at: string;
  notes:      string | null;
  cigar:      CatalogResult;
}

/* ------------------------------------------------------------------
   Wishlist grid card
   ------------------------------------------------------------------ */

function WishlistCard({
  item,
  onRemove,
  onMoveToHumidor,
  menuOpenId,
  setMenuOpenId,
}: {
  item:             WishlistItem;
  onRemove:         (id: string) => void;
  onMoveToHumidor:  (item: WishlistItem) => void;
  menuOpenId:       string | null;
  setMenuOpenId:    (id: string | null) => void;
}) {
  const c        = item.cigar;
  const menuOpen = menuOpenId === item.id;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card flex flex-col gap-3 relative">
      <div className="absolute top-3 right-3 z-10" data-menu>
        <button
          type="button"
          data-menu
          onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpen ? null : item.id); }}
          className="btn btn-ghost p-1.5 rounded-lg opacity-60 hover:opacity-100"
          aria-label="Options"
          aria-expanded={menuOpen}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="3"  r="1.25" fill="currentColor" />
            <circle cx="8" cy="8"  r="1.25" fill="currentColor" />
            <circle cx="8" cy="13" r="1.25" fill="currentColor" />
          </svg>
        </button>

        {menuOpen && (
          <div data-menu className="absolute right-0 top-full mt-1 w-48 card shadow-xl border border-border/50 py-1 z-20">
            <button
              type="button"
              data-menu
              onClick={() => { setMenuOpenId(null); onMoveToHumidor(item); }}
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
              onClick={() => { setMenuOpenId(null); onRemove(item.id); }}
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

      <button
        type="button"
        onClick={() => item.notes && setExpanded((v) => !v)}
        className="flex flex-col gap-3 flex-1 text-left w-full"
        style={{
          background:              "none",
          border:                  "none",
          padding:                 0,
          cursor:                  item.notes ? "pointer" : "default",
          touchAction:             "manipulation",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <div className="w-full aspect-[16/9] rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0 relative">
          <CigarImage
            imageUrl={c.image_url}
            wrapper={c.wrapper}
            alt={cigarDisplayName(c)}
            fill
            sizes="(max-width: 640px) 100vw, 640px"
            quality={60}
            style={{ objectFit: "contain" }}
          />
        </div>

        <div className="flex flex-col gap-1 min-w-0 pr-8 w-full">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground truncate">{c.brand}</p>
          <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2"><CigarTitle cigar={c} /></h3>
          {c.format && <p className="text-xs text-muted-foreground">{c.format}</p>}
          {(c.wrapper || c.ring_gauge) && (
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {[c.wrapper, c.ring_gauge ? `${c.ring_gauge} ring` : null, c.length_inches ? `${c.length_inches}"` : null].filter(Boolean).join(" · ")}
            </p>
          )}
          {item.notes && (
            <p className="text-xs mt-1.5" style={{ color: "var(--gold, #D4A04A)", opacity: 0.8 }}>
              Notes {expanded ? "▲" : "▼"}
            </p>
          )}
        </div>
      </button>

      {expanded && item.notes && (
        <div
          className="w-full pt-3 mt-1"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
            {item.notes}
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Wishlist list row
   ------------------------------------------------------------------ */

function WishlistListRow({
  item,
  onRemove,
  onMoveToHumidor,
  menuOpenId,
  setMenuOpenId,
}: {
  item:             WishlistItem;
  onRemove:         (id: string) => void;
  onMoveToHumidor:  (item: WishlistItem) => void;
  menuOpenId:       string | null;
  setMenuOpenId:    (id: string | null) => void;
}) {
  const c        = item.cigar;
  const menuOpen = menuOpenId === item.id;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card relative" style={{ padding: 0 }}>
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => item.notes && setExpanded((v) => !v)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
          style={{
            background:              "none",
            border:                  "none",
            padding:                 0,
            cursor:                  item.notes ? "pointer" : "default",
            touchAction:             "manipulation",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
            <CigarImage
              imageUrl={c.image_url}
              wrapper={c.wrapper}
              alt={cigarDisplayName(c)}
              width={48}
              height={48}
              sizes="48px"
              quality={75}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{c.brand}</p>
            <p className="text-sm font-semibold text-foreground leading-snug"><CigarTitle cigar={c} /></p>
            {(c.format || c.wrapper) && (
              <p className="text-xs text-muted-foreground truncate">
                {[c.format, c.wrapper].filter(Boolean).join(" · ")}
              </p>
            )}
            {item.notes && (
              <p className="text-xs mt-0.5" style={{ color: "var(--gold, #D4A04A)", opacity: 0.8 }}>
                Notes {expanded ? "▲" : "▼"}
              </p>
            )}
          </div>
        </button>

      <div className="flex-shrink-0 relative" data-menu>
        <button
          type="button"
          data-menu
          onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpen ? null : item.id); }}
          className="btn btn-ghost p-1.5 rounded-lg opacity-60 hover:opacity-100"
          aria-label="Options"
          aria-expanded={menuOpen}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="3"  r="1.25" fill="currentColor" />
            <circle cx="8" cy="8"  r="1.25" fill="currentColor" />
            <circle cx="8" cy="13" r="1.25" fill="currentColor" />
          </svg>
        </button>

        {menuOpen && (
          <div data-menu className="absolute right-0 top-full mt-1 w-48 card shadow-xl border border-border/50 py-1 z-20">
            <button
              type="button"
              data-menu
              onClick={() => { setMenuOpenId(null); onMoveToHumidor(item); }}
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
              onClick={() => { setMenuOpenId(null); onRemove(item.id); }}
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
      </div>

      {expanded && item.notes && (
        <div className="px-3 pb-3" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
            {item.notes}
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   WishlistClient
   ------------------------------------------------------------------ */

interface WishlistClientProps {
  initialItems: WishlistItem[];
  userId:       string;
}

export function WishlistClient({ initialItems, userId }: WishlistClientProps) {
  /*
   * SWR-managed wishlist. `fallbackData` seeds the cache from the
   * server's initial render so the first paint matches what page.tsx
   * fetched. revalidateOnMount: false avoids a redundant Supabase
   * round-trip on every navigation TO /humidor/wishlist.
   *
   * Optimistic updates (handleRemove, handleMoveSuccess) call
   * `mutate(next, { revalidate: false })` to swap the cache without
   * triggering a refetch — same UX as the previous local-state
   * pattern, but the cached value is now visible to other surfaces
   * subscribing to the same key.
   */
  const {
    data:    items = initialItems,
    error:   wishlistError,
    mutate:  mutateItems,
  } = useSWR(
    keyFor.wishlist(userId),
    () => fetchWishlistItems(userId),
    {
      fallbackData:      initialItems,
      revalidateOnMount: false,
    },
  );

  const error = wishlistError ? "Failed to load wishlist. Please try again." : null;
  const [toast,      setToast]      = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [showAdd,    setShowAdd]    = useState(false);
  const [view,       setView]       = useState<ViewMode>("grid");
  const moveItemRef = useRef<WishlistItem | null>(null);
  const [moveItem,   setMoveItem]   = useState<WishlistItem | null>(null);

  /* Fixed header measurement */
  const headerRef                  = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setHeaderHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /*
   * Persist view preference. Lazy useState init would cause hydration
   * mismatch (server renders "grid", client may rehydrate as "list");
   * SSR-safe-default-then-sync is the accepted pattern. Lint rule
   * react-hooks/set-state-in-effect doesn't model it — disabled per-line.
   */
  useEffect(() => {
    const saved = localStorage.getItem("wishlist-view") as ViewMode | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "list" || saved === "grid") setView(saved);
    /* A live manual-entry draft means the page reloaded out from under
       an in-progress add (iOS PWA eviction after Look up / app switch).
       Reopen the sheet; its open effect restores the draft fields. */
    if (loadCigarDraft("wishlist")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowAdd(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("wishlist-view", view);
  }, [view]);

  /* Close menu on outside click */
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest("[data-menu]")) setMenuOpenId(null);
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  /* Optimistic remove — strip the row from the SWR cache, fire the
     delete, and roll back on failure. `revalidate: false` keeps the
     mutated cache without a follow-up refetch. */
  async function handleRemove(itemId: string) {
    const prev = items;
    mutateItems(prev.filter((i) => i.id !== itemId), { revalidate: false });
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("humidor_items").delete().eq("id", itemId);
    if (deleteError) {
      mutateItems(prev, { revalidate: false });
      setToast("Failed to remove. Please try again.");
    }
  }

  /* Move-to-humidor success — drop from wishlist optimistically and
     delete the old wishlist row. AddFlowSheet's finishHumidorInsert
     doesn't revalidate the Humidor SWR cache itself (unlike the old
     AddToHumidorSheet.insertEntry), so we do it explicitly here — the
     Humidor list must be fresh when the user navigates there. */
  async function handleMoveSuccess(message?: string) {
    if (!moveItem) return;
    setToast(message ?? "Moved to your humidor!");
    mutateItems(items.filter((i) => i.id !== moveItem.id), { revalidate: false });
    const supabase = createClient();
    await supabase.from("humidor_items").delete().eq("id", moveItem.id);
    void revalidateHumidor(userId);
    setMoveItem(null);
  }

  void moveItemRef; // suppress unused warning

  return (
    <>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      {/* ── Fixed header ─────────────────────────────────────────── */}
      <div
        ref={headerRef}
        style={{
          position:        "fixed",
          top:             "var(--page-top-offset)",
          left:            "var(--app-content-left)",
          right:           0,
          zIndex:          30,
          backgroundColor: "var(--background)",
          borderBottom:    "1px solid var(--border)",
          paddingTop:      "var(--page-header-safe-pad)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">

          {/* Row 1: Tabs */}
          <div className="flex border-b border-border/50">
            <Link
              href="/humidor"
              className="px-1 pb-3 pt-4 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors duration-150 mr-6"
            >
              Humidor
            </Link>
            <span
              className="px-1 pb-3 pt-4 text-sm font-medium border-b-2 mr-6"
              style={{ borderColor: "var(--ember, #E8642C)", color: "var(--foreground)" }}
            >
              Wishlist
            </span>
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
          <div className="flex items-center justify-between gap-4 pt-4 pb-3">
            <h1 style={{ fontFamily: "var(--font-serif)" }}>Wishlist</h1>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="btn btn-primary flex-shrink-0 flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              Add Cigar
            </button>
          </div>

          {/* Row 3: View toggle (only when there is content) */}
          {items.length > 0 && (
            <div className="flex items-center justify-end pb-3">
              <ViewToggle view={view} onChange={setView} />
            </div>
          )}

        </div>
      </div>

      {/* Spacer */}
      <div style={{ height: headerHeight }} aria-hidden="true" />

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
        {error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <button type="button" className="btn btn-secondary" onClick={() => mutateItems()}>Try again</button>
          </div>
        ) : items.length === 0 ? (
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
              <p className="text-base font-medium text-foreground">Your wishlist is empty</p>
              <p className="text-sm text-muted-foreground mt-1">Add cigars you want to try next</p>
            </div>
            <button type="button" onClick={() => setShowAdd(true)} className="btn btn-primary mt-2">
              Add Cigar
            </button>
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((item) => (
              <WishlistCard
                key={item.id}
                item={item}
                onRemove={handleRemove}
                onMoveToHumidor={setMoveItem}
                menuOpenId={menuOpenId}
                setMenuOpenId={setMenuOpenId}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <WishlistListRow
                key={item.id}
                item={item}
                onRemove={handleRemove}
                onMoveToHumidor={setMoveItem}
                menuOpenId={menuOpenId}
                setMenuOpenId={setMenuOpenId}
              />
            ))}
          </div>
        )}
      </div>

      <AddFlowSheet
        open={showAdd}
        entry={{ kind: "search" }}
        mode="wishlist"
        onClose={() => setShowAdd(false)}
        onAdded={(message) => { mutateItems(); setToast(message ?? "Added to your wishlist!"); }}
      />

      <AddFlowSheet
        open={!!moveItem}
        entry={{ kind: "vitola", cigarId: moveItem?.cigar_id ?? "" }}
        mode="humidor"
        onClose={() => setMoveItem(null)}
        onAdded={handleMoveSuccess}
      />
    </>
  );
}
