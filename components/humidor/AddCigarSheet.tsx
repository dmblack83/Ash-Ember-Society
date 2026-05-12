"use client";

import { useState, useEffect, useRef } from "react";
import { createClient }      from "@/utils/supabase/client";
import { CatalogResult, CigarSearch } from "@/components/cigar-search";
import { AgingTargetSelect } from "@/components/humidor/AgingTargetSelect";
import { useEscapeKey }      from "@/lib/hooks/use-escape-key";
import {
  SHADES,
  WRAPPERS,
  WRAPPER_COUNTRIES,
  FORMATS,
  LENGTHS,
  RING_GAUGES,
} from "@/lib/cigar-taxonomy";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface ManualFields {
  brand:          string;
  series:         string;
  format:         string;
  ringGauge:      string;
  lengthInches:   string;
  wrapper:        string;
  wrapperCountry: string;
  shade:          string;
}

export interface AddCigarSheetProps {
  open:    boolean;
  onClose: () => void;
  onAdded: () => void;
}

/* ------------------------------------------------------------------
   Scroll caret chevron
   ------------------------------------------------------------------ */

function Caret({ dir }: { dir: "up" | "down" }) {
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

/* ------------------------------------------------------------------
   AddCigarSheet
   ------------------------------------------------------------------ */

export function AddCigarSheet({ open, onClose, onAdded }: AddCigarSheetProps) {

  /* Escape-key dismissal — keyboard users can close the sheet via
     Escape. Only attached while open. */
  useEscapeKey(open, onClose);

  /* ── Selection state ──────────────────────────────────────── */
  const [selected,        setSelected]        = useState<CatalogResult | null>(null);
  const [isManual,        setIsManual]        = useState(false);
  const [manual,          setManual]          = useState<ManualFields>({
    brand: "", series: "", format: "", ringGauge: "", lengthInches: "", wrapper: "", wrapperCountry: "", shade: "",
  });
  const [submitToCatalog, setSubmitToCatalog] = useState(true);

  /* ── Form state ───────────────────────────────────────────── */
  const today = new Date().toISOString().split("T")[0];
  const [quantity,     setQuantity]     = useState(1);
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [priceStr,     setPriceStr]     = useState("");
  const [source,       setSource]       = useState("");
  const [agingStart,   setAgingStart]   = useState(today);
  const [agingTarget,  setAgingTarget]  = useState("");
  const [notes,        setNotes]        = useState("");

  /* ── Submit state ─────────────────────────────────────────── */
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /* ── Layout state ─────────────────────────────────────────── */
  const [isDesktop,       setIsDesktop]       = useState(false);
  const [showTopCaret,    setShowTopCaret]    = useState(false);
  const [showBottomCaret, setShowBottomCaret] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);

  /* ── Desktop detection ────────────────────────────────────── */
  useEffect(() => {
    const mq      = window.matchMedia("(min-width: 640px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  /* ── Body scroll lock ─────────────────────────────────────── */
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

  /* ── Reset on open ────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    setSelected(null); setIsManual(false);
    setManual({ brand: "", series: "", format: "", ringGauge: "", lengthInches: "", wrapper: "", wrapperCountry: "", shade: "" });
    setSubmitToCatalog(true);
    setQuantity(1); setPurchaseDate(today); setPriceStr("");
    setSource(""); setAgingStart(today); setAgingTarget(""); setNotes("");
    setSubmitError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ── Scroll caret tracking ────────────────────────────────── */
  function updateCarets() {
    const el = bodyRef.current;
    if (!el) return;
    setShowTopCaret(el.scrollTop > 4);
    setShowBottomCaret(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }

  useEffect(() => {
    const id = requestAnimationFrame(updateCarets);
    return () => cancelAnimationFrame(id);
  }, [selected, isManual, open]);

  /* ── Handlers ─────────────────────────────────────────────── */
  function handleClear() {
    /* CigarSearch remounts when hasSelection flips back to false
       (it's gated on `open && !hasSelection`) — autoFocus handles
       the input refocus on its own. */
    setSelected(null);
    setIsManual(false);
  }

  async function handleSubmit() {
    const brand          = isManual ? manual.brand.trim()          : (selected?.brand           ?? "Unknown");
    const series         = isManual ? manual.series.trim()         : (selected?.series          ?? "");
    const format         = isManual ? manual.format.trim()         : (selected?.format          ?? "");
    const wrapper        = isManual ? manual.wrapper.trim()        : (selected?.wrapper         ?? null);
    const wrapperCountry = isManual ? manual.wrapperCountry.trim() : (selected?.wrapper_country ?? null);
    const shade          = isManual ? manual.shade.trim()          : (selected?.shade           ?? null);
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
          p_shade:           shade           || null,
        });
        if (rpcErr || !data) {
          setSubmitError(rpcErr?.message ?? "Failed to save cigar to catalog.");
          return;
        }
        cigarId = data as string;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSubmitError("Not authenticated."); return; }

      const priceCents = priceStr ? Math.round(parseFloat(priceStr) * 100) : null;
      const { error: insertErr } = await supabase.from("humidor_items").insert({
        user_id:           user.id,
        cigar_id:          cigarId,
        quantity,
        purchase_date:     purchaseDate     || null,
        price_paid_cents:  isNaN(priceCents ?? NaN) ? null : priceCents,
        source:            source.trim()    || null,
        aging_start_date:  agingStart       || null,
        aging_target_date: agingTarget      || null,
        notes:             notes.trim()     || null,
        is_wishlist:       false,
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
          shade:           shade           || null,
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
        aria-label="Add cigar to humidor"
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

        {/* ── Fixed header: title ──────────────────────────── */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
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
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* ── Search ──────────────────────────────────────────
             Gating on `open && !hasSelection` is what makes
             CigarSearch fresh per open: it unmounts when the sheet
             closes (no stale query when reopened) AND when the user
             picks a cigar / clicks "Add manually" (so the dropdown
             closes and Change/Back-to-search gives a fresh popular
             list). Avoids needing an imperative reset API. */}
        {open && !hasSelection && (
          <div
            className="px-5 py-3 flex-shrink-0"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <CigarSearch
              onSelect={(r) => setSelected(r)}
              onManual={() => setIsManual(true)}
              autoFocus
            />
          </div>
        )}

        {/* ── Scrollable body (relative for caret overlays) ── */}
        <div className="relative flex-1 min-h-0">

          <div
            ref={bodyRef}
            className="h-full overflow-y-auto overscroll-contain"
            onScroll={updateCarets}
          >

            {/* Results list now lives in CigarSearch's dropdown
                above. Body is empty until the user picks a cigar
                or switches to manual entry. */}

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

                {/* Manual entry fields */}
                {isManual && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">Cigar Details</h3>
                      <button
                        onClick={handleClear}
                        className="text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
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
                          Format
                        </label>
                        <select
                          value={manual.format}
                          onChange={(e) => setManual((m) => ({ ...m, format: e.target.value }))}
                          className="input w-full text-sm"
                          style={{ minHeight: 48 }}
                        >
                          <option value="">Choose…</option>
                          {FORMATS.map((f) => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                          Ring Gauge
                        </label>
                        <select
                          value={manual.ringGauge}
                          onChange={(e) => setManual((m) => ({ ...m, ringGauge: e.target.value }))}
                          className="input w-full text-sm"
                          style={{ minHeight: 48 }}
                        >
                          <option value="">Choose…</option>
                          {RING_GAUGES.map((g) => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                          Length
                        </label>
                        <select
                          value={manual.lengthInches}
                          onChange={(e) => setManual((m) => ({ ...m, lengthInches: e.target.value }))}
                          className="input w-full text-sm"
                          style={{ minHeight: 48 }}
                        >
                          <option value="">Choose…</option>
                          {LENGTHS.map((l) => (
                            <option key={l.inches} value={l.inches}>{l.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                          Shade
                        </label>
                        <select
                          value={manual.shade}
                          onChange={(e) => setManual((m) => ({ ...m, shade: e.target.value }))}
                          className="input w-full text-sm"
                          style={{ minHeight: 48 }}
                        >
                          <option value="">Choose…</option>
                          {SHADES.map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.name} — {s.description}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                          Wrapper
                        </label>
                        <select
                          value={manual.wrapper}
                          onChange={(e) => setManual((m) => ({ ...m, wrapper: e.target.value }))}
                          className="input w-full text-sm"
                          style={{ minHeight: 48 }}
                        >
                          <option value="">Choose…</option>
                          {WRAPPERS.map((w) => (
                            <option key={w.name} value={w.name}>
                              {w.name} — {w.description}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                          Wrapper Country
                        </label>
                        <select
                          value={manual.wrapperCountry}
                          onChange={(e) => setManual((m) => ({ ...m, wrapperCountry: e.target.value }))}
                          className="input w-full text-sm"
                          style={{ minHeight: 48 }}
                        >
                          <option value="">Choose…</option>
                          {WRAPPER_COUNTRIES.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name} — {c.description}
                            </option>
                          ))}
                        </select>
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
                          Help the community — we&apos;ll review and add it.
                        </p>
                      </div>
                    </label>
                  </div>
                )}

                {/* Humidor details */}
                <div
                  className="space-y-4 pt-5"
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
                  <div style={{ overflow: "hidden" }}>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                      Purchase Date
                    </label>
                    <input
                      type="date"
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      className="input text-sm"
                      style={{ display: "block", width: "100%", minWidth: 0, boxSizing: "border-box", minHeight: 48 }}
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

                  {/* Aging start */}
                  <div style={{ overflow: "hidden" }}>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                      Start Aging
                    </label>
                    <input
                      type="date"
                      value={agingStart}
                      onChange={(e) => setAgingStart(e.target.value)}
                      className="input text-sm"
                      style={{ display: "block", width: "100%", minWidth: 0, boxSizing: "border-box", minHeight: 48 }}
                    />
                  </div>

                  {/* Aging target */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                      Ready to Smoke By
                    </label>
                    <AgingTargetSelect
                      value={agingTarget}
                      onChange={setAgingTarget}
                      defaultPreset="2_weeks"
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
                      `Add ${quantity > 1 ? `${quantity} ` : ""}to Humidor`
                    )}
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
              <Caret dir="up" />
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
              <Caret dir="down" />
            </div>
          )}

        </div>
      </div>
    </>
  );
}
