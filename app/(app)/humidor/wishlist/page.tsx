"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { CigarSearch, CatalogResult } from "@/components/cigar-search";
import { AddToHumidorSheet } from "@/components/cigars/AddToHumidorSheet";
import { Toast } from "@/components/ui/toast";
import { CigarPlaceholder } from "@/components/ui/cigar-placeholder";
import { SkeletonCard } from "@/components/ui/skeleton-card";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface WishlistItem {
  id:         string;
  cigar_id:   string;
  created_at: string;
  cigar:      CatalogResult;
}

interface ManualFields {
  brand:          string;
  series:         string;
  format:         string;
  ringGauge:      string;
  lengthInches:   string;
  wrapper:        string;
  wrapperCountry: string;
}

/* ------------------------------------------------------------------
   Toast
   ------------------------------------------------------------------ */

/* ------------------------------------------------------------------
   Cigar placeholder SVG
   ------------------------------------------------------------------ */


/* ------------------------------------------------------------------
   Add Wishlist Sheet
   ------------------------------------------------------------------ */

function AddWishlistSheet({
  open,
  onClose,
  onAdded,
}: {
  open:    boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [selected,        setSelected]        = useState<CatalogResult | null>(null);
  const [isManual,        setIsManual]        = useState(false);
  const [manual,          setManual]          = useState<ManualFields>({
    brand: "", series: "", format: "", ringGauge: "", lengthInches: "", wrapper: "", wrapperCountry: "",
  });
  const [submitToCatalog, setSubmitToCatalog] = useState(true);
  const [notes,           setNotes]           = useState("");
  const [submitting,      setSubmitting]      = useState(false);
  const [submitError,     setSubmitError]     = useState<string | null>(null);

  /* Reset when sheet opens */
  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setIsManual(false);
    setManual({ brand: "", series: "", format: "", ringGauge: "", lengthInches: "", wrapper: "", wrapperCountry: "" });
    setSubmitToCatalog(true);
    setNotes("");
    setSubmitError(null);
  }, [open]);

  function handleClear() {
    setSelected(null);
    setIsManual(false);
  }

  async function handleSubmit() {
    const brand          = isManual ? manual.brand.trim()          : (selected?.brand           ?? "Unknown");
    const series         = isManual ? manual.series.trim()         : (selected?.series          ?? "");
    const format         = isManual ? manual.format.trim()         : (selected?.format          ?? "");
    const wrapper        = isManual ? manual.wrapper.trim()        : (selected?.wrapper         ?? null);
    const wrapperCountry = isManual ? manual.wrapperCountry.trim() : (selected?.wrapper_country ?? null);
    const ringGauge      = isManual ? (parseFloat(manual.ringGauge)    || null) : (selected?.ring_gauge    ?? null);
    const lengthInches   = isManual ? (parseFloat(manual.lengthInches) || null) : (selected?.length_inches ?? null);

    if (!brand) { setSubmitError("Brand is required."); return; }

    setSubmitting(true);
    setSubmitError(null);
    const supabase = createClient();

    try {
      /* 1 — Resolve cigar_catalog id */
      let cigarId: string;

      if (selected) {
        cigarId = selected.id;
      } else {
        const { data, error: rpcErr } = await supabase.rpc("insert_cigar_to_catalog", {
          p_brand:           brand,
          p_series:          series          || null,
          p_format:          format          || null,
          p_ring_gauge:      ringGauge,
          p_length_inches:   lengthInches,
          p_wrapper:         wrapper         || null,
          p_wrapper_country: wrapperCountry  || null,
        });
        if (rpcErr || !data) {
          setSubmitError(rpcErr?.message ?? "Failed to save cigar to catalog.");
          return;
        }
        cigarId = data as string;
      }

      /* 2 — Current user */
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSubmitError("Not authenticated."); return; }

      /* 3 — Insert wishlist item */
      const { error: insertErr } = await supabase.from("humidor_items").insert({
        user_id:     user.id,
        cigar_id:    cigarId,
        quantity:    1,
        notes:       notes.trim() || null,
        is_wishlist: true,
      });

      if (insertErr) { setSubmitError(insertErr.message); return; }

      /* 4 — Increment usage_count if catalog selection */
      if (selected) {
        await supabase
          .from("cigar_catalog")
          .update({ usage_count: selected.usage_count + 1 })
          .eq("id", selected.id);
      }

      /* 5 — Optionally submit catalog suggestion for manual entries */
      if (isManual && submitToCatalog && brand) {
        await supabase.from("cigar_catalog_suggestions").insert({
          suggested_by:    user.id,
          brand,
          series:          series          || null,
          name:            [brand, series, format].filter(Boolean).join(" — "),
          format:          format          || null,
          ring_gauge:      ringGauge,
          length_inches:   lengthInches,
          wrapper:         wrapper         || null,
          wrapper_country: wrapperCountry  || null,
        });
      }

      onAdded();
      onClose();
    } catch (err) {
      console.error("AddWishlistSheet submit error:", err);
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const hasSelection = selected !== null || isManual;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          backgroundColor: "rgba(0,0,0,0.65)",
          opacity:         open ? 1 : 0,
          pointerEvents:   open ? "auto" : "none",
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add to wishlist"
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col"
        style={{
          height:               "calc(100dvh - 48px)",
          backgroundColor:      "var(--background)",
          borderTopLeftRadius:  20,
          borderTopRightRadius: 20,
          borderTop:            "1px solid var(--border)",
          transform:            open ? "translateY(0)" : "translateY(100%)",
          transition:           "transform 320ms cubic-bezier(0.32,0.72,0,1)",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--border)" }} />
        </div>

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 pb-4 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2
            className="text-xl font-bold text-foreground"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Add to Wishlist
          </h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-xl text-muted-foreground transition-colors"
            style={{ width: 40, height: 40 }}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-8 space-y-5">

          {/* Search */}
          {!hasSelection && (
            <CigarSearch
              onSelect={setSelected}
              onManual={() => setIsManual(true)}
              autoFocus={open}
            />
          )}

          {/* Selected cigar card */}
          {selected && (
            <div
              className="rounded-2xl p-4 animate-fade-in"
              style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {selected.brand && (
                    <p
                      className="text-[11px] font-bold tracking-widest uppercase mb-1"
                      style={{ color: "var(--primary)" }}
                    >
                      {selected.brand}
                    </p>
                  )}
                  <p
                    className="text-base font-semibold text-foreground leading-snug"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {selected.series ?? selected.name}
                  </p>
                  {(selected.format || selected.wrapper || selected.ring_gauge) && (
                    <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                      {[
                        selected.format,
                        selected.wrapper,
                        selected.ring_gauge    ? `${selected.ring_gauge} ring`  : null,
                        selected.length_inches ? `${selected.length_inches}"`   : null,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleClear}
                  className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0 transition-colors"
                  style={{ color: "var(--muted-foreground)", backgroundColor: "var(--muted)" }}
                >
                  Change
                </button>
              </div>
            </div>
          )}

          {/* Manual entry */}
          {isManual && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Cigar Details</h3>
                <button
                  onClick={handleClear}
                  className="text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  ← Back to search
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                    Brand <span style={{ color: "var(--destructive)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={manual.brand}
                    onChange={(e) => setManual((m) => ({ ...m, brand: e.target.value }))}
                    placeholder="e.g. Arturo Fuente"
                    className="input w-full text-sm"
                    style={{ minHeight: 48 }}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                    Series / Name
                  </label>
                  <input
                    type="text"
                    value={manual.series}
                    onChange={(e) => setManual((m) => ({ ...m, series: e.target.value }))}
                    placeholder="e.g. Opus X"
                    className="input w-full text-sm"
                    style={{ minHeight: 48 }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                    Format / Vitola
                  </label>
                  <input
                    type="text"
                    value={manual.format}
                    onChange={(e) => setManual((m) => ({ ...m, format: e.target.value }))}
                    placeholder="e.g. Robusto"
                    className="input w-full text-sm"
                    style={{ minHeight: 48 }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                    Ring Gauge
                  </label>
                  <input
                    type="number"
                    value={manual.ringGauge}
                    onChange={(e) => setManual((m) => ({ ...m, ringGauge: e.target.value }))}
                    placeholder="50"
                    className="input w-full text-sm"
                    style={{ minHeight: 48 }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                    Length (inches)
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    value={manual.lengthInches}
                    onChange={(e) => setManual((m) => ({ ...m, lengthInches: e.target.value }))}
                    placeholder="5.0"
                    className="input w-full text-sm"
                    style={{ minHeight: 48 }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                    Wrapper
                  </label>
                  <input
                    type="text"
                    value={manual.wrapper}
                    onChange={(e) => setManual((m) => ({ ...m, wrapper: e.target.value }))}
                    placeholder="e.g. Colorado"
                    className="input w-full text-sm"
                    style={{ minHeight: 48 }}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                    Wrapper Country
                  </label>
                  <input
                    type="text"
                    value={manual.wrapperCountry}
                    onChange={(e) => setManual((m) => ({ ...m, wrapperCountry: e.target.value }))}
                    placeholder="e.g. Dominican Republic"
                    className="input w-full text-sm"
                    style={{ minHeight: 48 }}
                  />
                </div>
              </div>

              {/* Submit to catalog checkbox */}
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <div
                  className="flex-shrink-0 mt-0.5 flex items-center justify-center rounded transition-colors"
                  style={{
                    width: 20, height: 20,
                    backgroundColor: submitToCatalog ? "var(--primary)" : "transparent",
                    border: `1.5px solid ${submitToCatalog ? "var(--primary)" : "var(--border)"}`,
                  }}
                  onClick={() => setSubmitToCatalog((v) => !v)}
                >
                  {submitToCatalog && (
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                      <path d="M2 5.5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div onClick={() => setSubmitToCatalog((v) => !v)}>
                  <p className="text-sm font-medium text-foreground">Submit to catalog</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                    Help the community — we&apos;ll review and add it.
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Notes + submit (shown once cigar is selected or manual) */}
          {hasSelection && (
            <div
              className="space-y-4 pt-5 animate-slide-up"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Why you want to try this one…"
                  rows={3}
                  className="input w-full resize-none text-sm py-3"
                />
              </div>

              {submitError && (
                <p className="text-sm text-center" style={{ color: "var(--destructive)" }}>
                  {submitError}
                </p>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="btn btn-primary w-full disabled:opacity-40"
                style={{ minHeight: 52 }}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span
                      className="rounded-full border animate-spin"
                      style={{ width: 16, height: 16, borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }}
                    />
                    Adding…
                  </span>
                ) : (
                  "Add to Wishlist"
                )}
              </button>
            </div>
          )}

        </div>
      </div>
    </>
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
  item:         WishlistItem;
  onRemove:     (id: string) => void;
  onMoveToHumidor: (item: WishlistItem) => void;
  menuOpenId:   string | null;
  setMenuOpenId: (id: string | null) => void;
}) {
  const c        = item.cigar;
  const menuOpen = menuOpenId === item.id;

  return (
    <div className="card flex flex-col gap-3 relative">
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
                <path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M5 3.5l.5 8M9 3.5l-.5 8"
                  stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Remove from Wishlist
            </button>
          </div>
        )}
      </div>

      {/* Card content */}
      <div className="flex flex-col gap-3 flex-1">
        {/* Placeholder image */}
        <div className="w-full aspect-[16/9] rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
          <CigarPlaceholder />
        </div>

        {/* Info */}
        <div className="flex flex-col gap-1 min-w-0 pr-8">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground truncate">
            {c.brand}
          </p>
          <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
            {c.series ?? c.name}
          </h3>
          {c.format && (
            <p className="text-xs text-muted-foreground">{c.format}</p>
          )}
          {(c.wrapper || c.ring_gauge) && (
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {[
                c.wrapper,
                c.ring_gauge    ? `${c.ring_gauge} ring`  : null,
                c.length_inches ? `${c.length_inches}"`   : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Page
   ------------------------------------------------------------------ */

export default function WishlistPage() {
  const [items,       setItems]       = useState<WishlistItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [toast,       setToast]       = useState<string | null>(null);
  const [menuOpenId,  setMenuOpenId]  = useState<string | null>(null);
  const [showAdd,     setShowAdd]     = useState(false);

  /* "Move to Humidor" */
  const [moveItem, setMoveItem] = useState<WishlistItem | null>(null);

  /* Close menu on outside click */
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

    const cigarIds = wishlistRows.map((r) => r.cigar_id);
    const { data: cigars, error: cigarsError } = await supabase
      .from("cigar_catalog")
      .select("id, brand, series, name, format, ring_gauge, length_inches, wrapper, wrapper_country, usage_count")
      .in("id", cigarIds);

    if (cigarsError) {
      setError("Failed to load cigar details.");
      setLoading(false);
      return;
    }

    const cigarMap = new Map((cigars ?? []).map((c) => [c.id, c as CatalogResult]));
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
    setItems((cur) => cur.filter((i) => i.id !== itemId));
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("humidor_items")
      .delete()
      .eq("id", itemId);
    if (deleteError) {
      setItems(prev);
      setToast("Failed to remove. Please try again.");
    }
  }

  /* Move to humidor — after AddToHumidorSheet success */
  async function handleMoveSuccess() {
    if (!moveItem) return;
    setToast("Moved to your humidor!");
    setItems((cur) => cur.filter((i) => i.id !== moveItem.id));
    const supabase = createClient();
    await supabase.from("humidor_items").delete().eq("id", moveItem.id);
    setMoveItem(null);
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
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="btn btn-primary flex items-center gap-2"
            style={{ minHeight: 44 }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Add Cigar
          </button>
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
              <p className="text-sm text-muted-foreground mt-1">
                Add cigars you want to try next
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="btn btn-primary mt-2"
            >
              Add Cigar
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
        )}
      </div>

      {/* Add wishlist sheet */}
      <AddWishlistSheet
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={() => { fetchWishlist(); setToast("Added to your wishlist!"); }}
      />

      {/* Move to humidor sheet */}
      <AddToHumidorSheet
        cigarId={moveItem?.cigar_id ?? ""}
        isOpen={!!moveItem}
        onClose={() => setMoveItem(null)}
        onSuccess={handleMoveSuccess}
      />
    </>
  );
}
