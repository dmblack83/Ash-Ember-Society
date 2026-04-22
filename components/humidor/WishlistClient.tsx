"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { CatalogResult, Highlight } from "@/components/cigar-search";
import { AddToHumidorSheet } from "@/components/cigars/AddToHumidorSheet";
import { Toast } from "@/components/ui/toast";
import { ViewToggle, ViewMode } from "@/components/ui/view-toggle";
import { getCigarImage } from "@/lib/cigar-default-image";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

export interface WishlistItem {
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
   Add Wishlist Sheet
   ------------------------------------------------------------------ */

const CATALOG_SELECT_WL =
  "id, brand, series, format, ring_gauge, length_inches, wrapper, wrapper_country, usage_count, image_url";

function WishlistCaret({ dir }: { dir: "up" | "down" }) {
  return (
    <svg
      width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"
      style={{ color: "var(--muted-foreground)", opacity: 0.65 }}
    >
      {dir === "up"
        ? <path d="M4.5 11.5L9 7L13.5 11.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        : <path d="M4.5 6.5L9 11L13.5 6.5"  stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

function AddWishlistSheet({
  open,
  onClose,
  onAdded,
}: {
  open:    boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  /* Search state */
  const [query,     setQuery]     = useState("");
  const [results,   setResults]   = useState<CatalogResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [isPopular, setIsPopular] = useState(true);

  /* Selection state */
  const [selected,        setSelected]        = useState<CatalogResult | null>(null);
  const [isManual,        setIsManual]        = useState(false);
  const [manual,          setManual]          = useState<ManualFields>({
    brand: "", series: "", format: "", ringGauge: "", lengthInches: "", wrapper: "", wrapperCountry: "",
  });
  const [submitToCatalog, setSubmitToCatalog] = useState(true);
  const [notes,           setNotes]           = useState("");
  const [submitting,      setSubmitting]      = useState(false);
  const [submitError,     setSubmitError]     = useState<string | null>(null);

  /* Layout state */
  const [isDesktop,       setIsDesktop]       = useState(false);
  const [showTopCaret,    setShowTopCaret]    = useState(false);
  const [showBottomCaret, setShowBottomCaret] = useState(false);

  const bodyRef     = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Desktop detection */
  useEffect(() => {
    const mq      = window.matchMedia("(min-width: 640px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  /* Body scroll lock */
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top      = `-${scrollY}px`;
    document.body.style.width    = "100%";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.position = "";
      document.body.style.top      = "";
      document.body.style.width    = "";
      document.body.style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  /* Search helpers */
  function loadPopular() {
    const supabase = createClient();
    supabase
      .from("cigar_catalog")
      .select(CATALOG_SELECT_WL)
      .order("usage_count", { ascending: false })
      .limit(20)
      .then(({ data }) => { setResults(data ?? []); setIsPopular(true); });
  }

  const doSearch = useCallback(async (q: string) => {
    setSearching(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("cigar_catalog")
      .select(CATALOG_SELECT_WL)
      .or(`brand.ilike.%${q}%,series.ilike.%${q}%,format.ilike.%${q}%`)
      .limit(8);
    setResults(data ?? []);
    setIsPopular(false);
    setSearching(false);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      loadPopular();
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query.trim()), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  /* Reset on open */
  useEffect(() => {
    if (!open) return;
    setSelected(null); setIsManual(false); setQuery("");
    setManual({ brand: "", series: "", format: "", ringGauge: "", lengthInches: "", wrapper: "", wrapperCountry: "" });
    setSubmitToCatalog(true);
    setNotes(""); setSubmitError(null);
    loadPopular();
    setTimeout(() => inputRef.current?.focus(), 120);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* Scroll caret tracking */
  function updateCarets() {
    const el = bodyRef.current;
    if (!el) return;
    setShowTopCaret(el.scrollTop > 4);
    setShowBottomCaret(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }

  useEffect(() => {
    const id = requestAnimationFrame(updateCarets);
    return () => cancelAnimationFrame(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, selected, isManual, open]);

  function handleClear() {
    setSelected(null);
    setIsManual(false);
    setTimeout(() => inputRef.current?.focus(), 80);
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

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSubmitError("Not authenticated."); return; }

      const { error: insertErr } = await supabase.from("humidor_items").insert({
        user_id:     user.id,
        cigar_id:    cigarId,
        quantity:    1,
        notes:       notes.trim() || null,
        is_wishlist: true,
      });

      if (insertErr) { setSubmitError(insertErr.message); return; }

      if (selected) {
        await supabase
          .from("cigar_catalog")
          .update({ usage_count: selected.usage_count + 1 })
          .eq("id", selected.id);
      }

      if (isManual && submitToCatalog && brand) {
        await supabase.from("cigar_catalog_suggestions").insert({
          suggested_by:    user.id,
          brand,
          series:          series          || null,
          name:            [brand, series, format].filter(Boolean).join(" - "),
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
        className="fixed inset-0 z-40"
        style={{
          backgroundColor: "rgba(0,0,0,0.65)",
          opacity:         open ? 1 : 0,
          visibility:      open ? "visible" : "hidden",
          pointerEvents:   open ? "auto" : "none",
          transition:      open
            ? "opacity 300ms ease"
            : "opacity 300ms ease, visibility 0ms 300ms",
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add to wishlist"
        className="fixed z-50 flex flex-col"
        style={isDesktop ? {
          top:             "50%",
          left:            "50%",
          transform:       open ? "translate(-50%, -50%)" : "translate(-50%, calc(-50% + 24px))",
          opacity:         open ? 1 : 0,
          visibility:      open ? "visible" : "hidden",
          transition:      open
            ? "transform 300ms cubic-bezier(0.32,0.72,0,1), opacity 300ms ease"
            : "transform 300ms cubic-bezier(0.32,0.72,0,1), opacity 300ms ease, visibility 0ms 300ms",
          pointerEvents:   open ? "auto" : "none",
          width:           "min(90vw, 640px)",
          height:          "80dvh",
          backgroundColor: "var(--background)",
          borderRadius:    20,
          border:          "1px solid var(--border)",
          overflow:        "hidden",
        } : {
          left:                 0,
          right:                0,
          bottom:               0,
          transform:            open ? "translateY(0)" : "translateY(100%)",
          visibility:           open ? "visible" : "hidden",
          transition:           open
            ? "transform 320ms cubic-bezier(0.32,0.72,0,1)"
            : "transform 320ms cubic-bezier(0.32,0.72,0,1), visibility 0ms 320ms",
          height:               "calc(100dvh - 48px)",
          backgroundColor:      "var(--background)",
          borderTopLeftRadius:  20,
          borderTopRightRadius: 20,
          borderTop:            "1px solid var(--border)",
          overflow:             "hidden",
        }}
      >
        {/* Drag handle — mobile only */}
        {!isDesktop && (
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--border)" }} />
          </div>
        )}

        {/* Fixed header: title */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
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

        {/* Fixed search bar */}
        {!hasSelection && (
          <div
            className="px-5 py-3 flex-shrink-0"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="relative">
              <svg
                className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--muted-foreground)" }}
                width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true"
              >
                <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M12 12l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search cigars…"
                className="input w-full pl-11 pr-4 text-base"
                style={{ minHeight: 48 }}
                autoComplete="off"
              />
              {searching && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2">
                  <span
                    className="rounded-full border animate-spin block"
                    style={{ width: 16, height: 16, borderColor: "rgba(193,120,23,0.3)", borderTopColor: "var(--primary)" }}
                  />
                </span>
              )}
            </div>
          </div>
        )}

        {/* Scrollable body */}
        <div className="relative flex-1 min-h-0">

          <div
            ref={bodyRef}
            className="h-full overflow-y-auto overscroll-contain"
            onScroll={updateCarets}
          >
            {/* Results list */}
            {!hasSelection && (
              <div className="pb-4">
                {isPopular && results.length > 0 && (
                  <div className="px-5 pt-4 pb-2">
                    <span
                      className="text-[10px] font-bold tracking-widest uppercase"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Popular Cigars
                    </span>
                  </div>
                )}

                {results.map((r, i) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => { setSelected(r); setQuery(""); }}
                    className="w-full text-left px-5 flex flex-col justify-center transition-colors active:opacity-70"
                    style={{
                      minHeight:    56,
                      borderBottom: i < results.length - 1 ? "1px solid var(--border)" : "none",
                    }}
                  >
                    <span className="text-sm font-semibold text-foreground leading-snug">
                      <Highlight text={r.brand ?? ""} query={query} />
                      {r.series && (
                        <span className="font-normal text-muted-foreground">
                          {" · "}<Highlight text={r.series} query={query} />
                        </span>
                      )}
                    </span>
                    {(r.format || r.wrapper || r.ring_gauge) && (
                      <span className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                        {[
                          r.format,
                          r.wrapper,
                          r.ring_gauge    ? `${r.ring_gauge} ring` : null,
                          r.length_inches ? `${r.length_inches}"`  : null,
                        ].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </button>
                ))}

                {!searching && query.trim() && results.length === 0 && (
                  <div className="px-5 py-6 text-center">
                    <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                      No results for &ldquo;{query}&rdquo;
                    </p>
                  </div>
                )}

                <div style={{ borderTop: results.length > 0 ? "1px solid var(--border)" : undefined }}>
                  <button
                    type="button"
                    onClick={() => setIsManual(true)}
                    className="w-full text-sm text-center transition-colors active:opacity-70"
                    style={{ minHeight: 48, color: "var(--muted-foreground)" }}
                  >
                    Can&apos;t find it? Add manually
                  </button>
                </div>
              </div>
            )}

            {/* Selection + form */}
            {hasSelection && (
              <div className="px-5 pt-5 pb-8 space-y-5">

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
                          {selected.series ?? selected.format}
                        </p>
                        {(selected.format || selected.wrapper || selected.ring_gauge) && (
                          <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                            {[
                              selected.format,
                              selected.wrapper,
                              selected.ring_gauge    ? `${selected.ring_gauge} ring` : null,
                              selected.length_inches ? `${selected.length_inches}"` : null,
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

                {/* Manual entry fields */}
                {isManual && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">Cigar Details</h3>
                      <button onClick={handleClear} className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        Back to search
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
                        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>Series / Name</label>
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
                        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>Format / Vitola</label>
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
                        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>Ring Gauge</label>
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
                        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>Length (inches)</label>
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
                        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>Wrapper</label>
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
                        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>Wrapper Country</label>
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

                    <label className="flex items-start gap-3 cursor-pointer select-none">
                      <div
                        className="flex-shrink-0 mt-0.5 flex items-center justify-center rounded transition-colors"
                        style={{
                          width:           20,
                          height:          20,
                          backgroundColor: submitToCatalog ? "var(--primary)" : "transparent",
                          border:          `1.5px solid ${submitToCatalog ? "var(--primary)" : "var(--border)"}`,
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
                          Help the community - we&apos;ll review and add it.
                        </p>
                      </div>
                    </label>
                  </div>
                )}

                {/* Notes + submit */}
                <div
                  className="space-y-4 pt-5"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>Notes</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Why you want to try this one..."
                      rows={3}
                      className="input w-full resize-none text-sm py-3"
                    />
                  </div>

                  {submitError && (
                    <p className="text-sm text-center" style={{ color: "var(--destructive)" }}>{submitError}</p>
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
                        Adding...
                      </span>
                    ) : "Add to Wishlist"}
                  </button>
                </div>

              </div>
            )}
          </div>

          {/* Top scroll caret */}
          {showTopCaret && (
            <div
              aria-hidden="true"
              style={{
                position:       "absolute",
                top:            0,
                left:           0,
                right:          0,
                height:         44,
                background:     "linear-gradient(to bottom, var(--background) 30%, transparent)",
                display:        "flex",
                alignItems:     "flex-start",
                justifyContent: "center",
                paddingTop:     8,
                pointerEvents:  "none",
              }}
            >
              <WishlistCaret dir="up" />
            </div>
          )}

          {/* Bottom scroll caret */}
          {showBottomCaret && (
            <div
              aria-hidden="true"
              style={{
                position:       "absolute",
                bottom:         0,
                left:           0,
                right:          0,
                height:         44,
                background:     "linear-gradient(to top, var(--background) 30%, transparent)",
                display:        "flex",
                alignItems:     "flex-end",
                justifyContent: "center",
                paddingBottom:  8,
                pointerEvents:  "none",
              }}
            >
              <WishlistCaret dir="down" />
            </div>
          )}

        </div>
      </div>
    </>
  );
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

      <div className="flex flex-col gap-3 flex-1">
        <div className="w-full aspect-[16/9] rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
          <img
            src={getCigarImage(c.image_url, c.wrapper)}
            alt={c.series ?? c.format ?? ""}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        </div>

        <div className="flex flex-col gap-1 min-w-0 pr-8">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground truncate">{c.brand}</p>
          <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{c.series ?? c.format}</h3>
          {c.format && <p className="text-xs text-muted-foreground">{c.format}</p>}
          {(c.wrapper || c.ring_gauge) && (
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {[c.wrapper, c.ring_gauge ? `${c.ring_gauge} ring` : null, c.length_inches ? `${c.length_inches}"` : null].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>
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

  return (
    <div className="card flex items-center gap-3 p-3 relative">
      <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
        <img
          src={getCigarImage(c.image_url, c.wrapper)}
          alt={c.series ?? c.format ?? ""}
          className="w-full h-full object-contain"
        />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{c.brand}</p>
        <p className="text-sm font-semibold text-foreground truncate">{c.series ?? c.format}</p>
        {(c.format || c.wrapper) && (
          <p className="text-xs text-muted-foreground truncate">
            {[c.format, c.wrapper].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

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
  const [items,      setItems]      = useState<WishlistItem[]>(initialItems);
  const [error,      setError]      = useState<string | null>(null);
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

  /* Persist view preference */
  useEffect(() => {
    const saved = localStorage.getItem("wishlist-view") as ViewMode | null;
    if (saved === "list" || saved === "grid") setView(saved);
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

  const fetchWishlist = useCallback(async () => {
    setError(null);
    const supabase = createClient();
    const { data, error: fetchError } = await supabase
      .from("humidor_items")
      .select("id, cigar_id, created_at, cigar:cigar_catalog(id, brand, series, format, ring_gauge, length_inches, wrapper, wrapper_country, usage_count, image_url)")
      .eq("user_id", userId)
      .eq("is_wishlist", true)
      .order("created_at", { ascending: false });

    if (fetchError) { setError("Failed to load wishlist. Please try again."); return; }

    const merged: WishlistItem[] = (data ?? [])
      .map((row) => {
        const cigar = Array.isArray(row.cigar) ? row.cigar[0] ?? null : row.cigar ?? null;
        if (!cigar) return null;
        return { id: row.id, cigar_id: row.cigar_id, created_at: row.created_at, cigar: cigar as CatalogResult };
      })
      .filter((x): x is WishlistItem => x !== null);

    setItems(merged);
  }, [userId]);

  async function handleRemove(itemId: string) {
    const prev = items;
    setItems((cur) => cur.filter((i) => i.id !== itemId));
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("humidor_items").delete().eq("id", itemId);
    if (deleteError) { setItems(prev); setToast("Failed to remove. Please try again."); }
  }

  async function handleMoveSuccess() {
    if (!moveItem) return;
    setToast("Moved to your humidor!");
    setItems((cur) => cur.filter((i) => i.id !== moveItem.id));
    const supabase = createClient();
    await supabase.from("humidor_items").delete().eq("id", moveItem.id);
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
          top:             0,
          left:            0,
          right:           0,
          zIndex:          30,
          backgroundColor: "var(--background)",
          borderBottom:    "1px solid var(--border)",
          paddingTop:      "env(safe-area-inset-top)",
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
            <button type="button" className="btn btn-secondary" onClick={fetchWishlist}>Try again</button>
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

      <AddWishlistSheet
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={() => { fetchWishlist(); setToast("Added to your wishlist!"); }}
      />

      <AddToHumidorSheet
        cigarId={moveItem?.cigar_id ?? ""}
        isOpen={!!moveItem}
        onClose={() => setMoveItem(null)}
        onSuccess={handleMoveSuccess}
      />
    </>
  );
}
