"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface CatalogResult {
  id:              string;
  brand:           string | null;
  series:          string | null;
  name:            string;
  format:          string | null;
  ring_gauge:      number | null;
  length_inches:   number | null;
  wrapper:         string | null;
  wrapper_country: string | null;
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
   Highlight matched text in gold
   ------------------------------------------------------------------ */

function Highlight({ text, query }: { text: string; query: string }) {
  if (!text || !query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts   = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <span key={i} style={{ color: "var(--gold)", fontWeight: 600 }}>{part}</span>
        ) : (
          part
        )
      )}
    </>
  );
}

/* ------------------------------------------------------------------
   Component
   ------------------------------------------------------------------ */

export interface AddCigarSheetProps {
  open:    boolean;
  onClose: () => void;
  onAdded: () => void;
}

export function AddCigarSheet({ open, onClose, onAdded }: AddCigarSheetProps) {
  /* Search */
  const [query,        setQuery]        = useState("");
  const [results,      setResults]      = useState<CatalogResult[]>([]);
  const [searching,    setSearching]    = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  /* Selection */
  const [selected,         setSelected]         = useState<CatalogResult | null>(null);
  const [isManual,         setIsManual]          = useState(false);
  const [manual,           setManual]            = useState<ManualFields>({
    brand: "", series: "", format: "", ringGauge: "", lengthInches: "", wrapper: "", wrapperCountry: "",
  });
  const [submitToCatalog,  setSubmitToCatalog]   = useState(true);

  /* Humidor form */
  const [quantity,      setQuantity]      = useState(1);
  const [purchaseDate,  setPurchaseDate]  = useState("");
  const [priceStr,      setPriceStr]      = useState("");
  const [source,        setSource]        = useState("");
  const [agingStart,    setAgingStart]    = useState("");
  const [notes,         setNotes]         = useState("");

  /* Submit */
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState<string | null>(null);

  const searchRef    = useRef<HTMLInputElement>(null);
  const dropdownRef  = useRef<HTMLDivElement>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase     = createClient();

  /* ── Reset when sheet opens ────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    setQuery(""); setResults([]); setShowDropdown(false);
    setSelected(null); setIsManual(false);
    setManual({ brand: "", series: "", format: "", ringGauge: "", lengthInches: "", wrapper: "", wrapperCountry: "" });
    setSubmitToCatalog(true);
    setQuantity(1); setPurchaseDate(""); setPriceStr("");
    setSource(""); setAgingStart(""); setNotes("");
    setSubmitError(null);
    setTimeout(() => searchRef.current?.focus(), 120);
  }, [open]);

  /* ── Debounced catalog search ──────────────────────────────── */
  const doSearch = useCallback(async (q: string) => {
    setSearching(true);
    const { data } = await supabase
      .from("cigar_catalog")
      .select("id, brand, series, name, format, ring_gauge, length_inches, wrapper, wrapper_country")
      .or(`name.ilike.%${q}%,brand.ilike.%${q}%,series.ilike.%${q}%`)
      .limit(8);
    setResults(data ?? []);
    setShowDropdown(true);
    setSearching(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!query.trim()) { setResults([]); setShowDropdown(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query.trim()), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  /* ── Dismiss dropdown on outside tap ─────────────────────── */
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  /* ── Handlers ────────────────────────────────────────────── */
  function handleSelect(r: CatalogResult) {
    setSelected(r);
    setIsManual(false);
    setShowDropdown(false);
    setQuery(r.name);
  }

  function handleManualMode() {
    setSelected(null);
    setIsManual(true);
    setShowDropdown(false);
  }

  function handleClear() {
    setSelected(null);
    setIsManual(false);
    setQuery("");
    setResults([]);
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  async function handleSubmit() {
    const brand          = isManual ? manual.brand.trim()          : (selected?.brand           ?? "Unknown");
    const series         = isManual ? manual.series.trim()         : (selected?.series          ?? "");
    const format         = isManual ? manual.format.trim()         : (selected?.format          ?? "");
    const wrapper        = isManual ? manual.wrapper.trim()        : (selected?.wrapper         ?? null);
    const wrapperCountry = isManual ? manual.wrapperCountry.trim() : (selected?.wrapper_country ?? null);
    const ringGauge      = isManual ? (parseFloat(manual.ringGauge)      || null) : (selected?.ring_gauge    ?? null);
    const lengthInches   = isManual ? (parseFloat(manual.lengthInches)   || null) : (selected?.length_inches ?? null);

    if (!brand) { setSubmitError("Brand is required."); return; }

    setSubmitting(true);
    setSubmitError(null);

    try {
      /* 1 — Find or create the cigar row */
      const { data: cigarId, error: rpcErr } = await supabase.rpc("find_or_create_cigar", {
        p_brand:           brand,
        p_line:            series          || null,
        p_vitola:          format          || null,
        p_wrapper:         wrapper         || null,
        p_wrapper_country: wrapperCountry  || null,
        p_ring_gauge:      ringGauge,
        p_length_inches:   lengthInches,
      });

      if (rpcErr || !cigarId) {
        setSubmitError(rpcErr?.message ?? "Failed to find or create cigar.");
        return;
      }

      /* 2 — Current user */
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSubmitError("Not authenticated."); return; }

      /* 3 — Insert humidor item */
      const priceCents = priceStr ? Math.round(parseFloat(priceStr) * 100) : null;
      const { error: insertErr } = await supabase.from("humidor_items").insert({
        user_id:          user.id,
        cigar_id:         cigarId,
        quantity,
        purchase_date:    purchaseDate    || null,
        price_paid_cents: isNaN(priceCents ?? NaN) ? null : priceCents,
        source:           source.trim()   || null,
        aging_start_date: agingStart      || null,
        notes:            notes.trim()    || null,
        is_wishlist:      false,
      });

      if (insertErr) { setSubmitError(insertErr.message); return; }

      /* 4 — Optionally submit catalog suggestion */
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
      console.error("AddCigarSheet submit error:", err);
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const hasSelection = selected !== null || isManual;

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          backgroundColor:  "rgba(0,0,0,0.65)",
          opacity:          open ? 1 : 0,
          pointerEvents:    open ? "auto" : "none",
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add cigar to humidor"
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col"
        style={{
          height:                  "calc(100dvh - 48px)",
          backgroundColor:         "var(--background)",
          borderTopLeftRadius:     20,
          borderTopRightRadius:    20,
          borderTop:               "1px solid var(--border)",
          transform:               open ? "translateY(0)" : "translateY(100%)",
          transition:              "transform 320ms cubic-bezier(0.32,0.72,0,1)",
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
            Add Cigar
          </h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-xl text-muted-foreground transition-colors"
            style={{ width: 40, height: 40 }}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-8 space-y-5">

          {/* ── Search field + dropdown ─────────────────────────── */}
          {!hasSelection && (
            <div className="relative" ref={dropdownRef}>
              <div className="relative">
                <svg
                  className="absolute left-4 top-1/2 -translate-y-1/2 flex-shrink-0"
                  style={{ color: "var(--muted-foreground)" }}
                  width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true"
                >
                  <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M12 12l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search cigars..."
                  className="input w-full pl-11 pr-4 text-base"
                  style={{ minHeight: 52 }}
                  autoComplete="off"
                />
                {searching && (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
                    <span
                      className="rounded-full border animate-spin"
                      style={{ width: 16, height: 16, borderColor: "rgba(193,120,23,0.3)", borderTopColor: "var(--primary)" }}
                    />
                  </span>
                )}
              </div>

              {/* Dropdown results */}
              {showDropdown && (
                <div
                  className="absolute left-0 right-0 z-10 mt-2 rounded-2xl overflow-hidden glass animate-fade-in"
                  style={{ border: "1px solid var(--border)" }}
                >
                  {results.length === 0 ? (
                    <div className="px-4 py-5 space-y-3 text-center">
                      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                        No results for &ldquo;{query}&rdquo;
                      </p>
                      <button
                        onClick={handleManualMode}
                        className="w-full text-sm font-semibold rounded-xl transition-colors"
                        style={{
                          minHeight: 44,
                          color: "var(--primary)",
                          backgroundColor: "rgba(193,120,23,0.10)",
                        }}
                      >
                        Can&apos;t find it? Add manually
                      </button>
                    </div>
                  ) : (
                    <>
                      {results.map((r, i) => (
                        <button
                          key={r.id}
                          onClick={() => handleSelect(r)}
                          className="w-full text-left px-4 flex flex-col justify-center transition-colors active:opacity-70"
                          style={{
                            minHeight: 56,
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
                                r.ring_gauge ? `${r.ring_gauge} ring` : null,
                                r.length_inches ? `${r.length_inches}"` : null,
                              ].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </button>
                      ))}
                      <button
                        onClick={handleManualMode}
                        className="w-full text-sm text-center transition-colors active:opacity-70"
                        style={{ minHeight: 48, color: "var(--muted-foreground)", borderTop: "1px solid var(--border)" }}
                      >
                        Can&apos;t find it? Add manually
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Selected cigar card ─────────────────────────────── */}
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
                        selected.ring_gauge   ? `${selected.ring_gauge} ring`    : null,
                        selected.length_inches ? `${selected.length_inches}"`    : null,
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

          {/* ── Manual entry fields ─────────────────────────────── */}
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
                    border:          `1.5px solid ${submitToCatalog ? "var(--primary)" : "var(--border)"}`,
                  }}
                  onClick={() => setSubmitToCatalog((v) => !v)}
                >
                  {submitToCatalog && (
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                      <path d="M2 5.5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
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

          {/* ── Humidor details ─────────────────────────────────── */}
          {hasSelection && (
            <div
              className="space-y-4 pt-5 animate-slide-up"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <h3 className="text-sm font-semibold text-foreground">Humidor Details</h3>

              {/* Quantity stepper */}
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: "var(--muted-foreground)" }}>
                  Quantity
                </label>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="flex items-center justify-center rounded-xl text-xl font-light transition-colors active:opacity-70"
                    style={{ width: 48, height: 48, backgroundColor: "var(--muted)", color: "var(--foreground)" }}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="text-xl font-semibold text-foreground w-10 text-center tabular-nums">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity((q) => q + 1)}
                    className="flex items-center justify-center rounded-xl text-xl font-light transition-colors active:opacity-70"
                    style={{ width: 48, height: 48, backgroundColor: "var(--muted)", color: "var(--foreground)" }}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Purchase date */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                  Purchase Date
                </label>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="input w-full text-sm"
                  style={{ minHeight: 48 }}
                />
              </div>

              {/* Price per cigar */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                  Price Per Cigar
                </label>
                <div className="relative">
                  <span
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-sm"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={priceStr}
                    onChange={(e) => setPriceStr(e.target.value)}
                    placeholder="0.00"
                    className="input w-full pl-8 text-sm"
                    style={{ minHeight: 48 }}
                  />
                </div>
              </div>

              {/* Source */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                  Source / Retailer
                </label>
                <input
                  type="text"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="e.g. Famous Smoke Shop"
                  className="input w-full text-sm"
                  style={{ minHeight: 48 }}
                />
              </div>

              {/* Aging start date */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                  Start Aging
                </label>
                <input
                  type="date"
                  value={agingStart}
                  onChange={(e) => setAgingStart(e.target.value)}
                  className="input w-full text-sm"
                  style={{ minHeight: 48 }}
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Storage location, thoughts…"
                  rows={3}
                  className="input w-full resize-none text-sm py-3"
                />
              </div>

              {/* Error */}
              {submitError && (
                <p className="text-sm text-center" style={{ color: "var(--destructive)" }}>
                  {submitError}
                </p>
              )}

              {/* Submit */}
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
                  `Add ${quantity > 1 ? `${quantity} ` : ""}to Humidor`
                )}
              </button>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
