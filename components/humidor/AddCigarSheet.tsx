"use client";

import { useState, useEffect, useRef } from "react";
import { createClient }      from "@/utils/supabase/client";
import { CatalogResult, CigarSearch } from "@/components/cigar-search";
import { AgingTargetSelect } from "@/components/humidor/AgingTargetSelect";
import { addHumidorItem, HumidorLimitError } from "@/lib/humidor/add-item";
import { ensureDefaultHumidor } from "@/lib/data/humidors";
import { useHumidors }      from "@/components/humidor/useHumidors";
import { BottomSheet }       from "@/components/ui/BottomSheet";
import { UpgradeLimitModal } from "@/components/membership/UpgradeLimitModal";
import { CigarDetailFields } from "@/components/cigars/CigarDetailFields";
import { loadCigarDraft, saveCigarDraft, clearCigarDraft } from "@/lib/cigars/cigar-draft";
import {
  type CigarDetails,
  EMPTY_CIGAR_DETAILS,
  cigarDetailsToRpcArgs,
} from "@/lib/cigars/cigar-details";
import { matchCigarLines, type LineMatch } from "@/lib/data/cigar-fetchers";
import { findMatchingSize, type SizeChild } from "@/lib/cigars/line-group";
import { DupeCheckDialog } from "@/components/cigars/DupeCheckDialog";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

export interface AddCigarSheetProps {
  open:    boolean;
  onClose: () => void;
  /* message = a specific outcome to toast (e.g. "Linked to the
     existing catalog listing."); undefined = caller uses its own
     default. */
  onAdded: (message?: string) => void;
  /* Humidor to preselect in the picker. Pass the currently-filtered
     humidor id, or null/omit to fall back to the user's default. */
  defaultHumidorId?: string | null;
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

export function AddCigarSheet({ open, onClose, onAdded, defaultHumidorId = null }: AddCigarSheetProps) {

  /* Explicit close = user abandoning the entry — discard the draft so
     it doesn't resurface on the next open. (Eviction/reload never
     calls this, which is exactly why the draft survives it.) */
  const handleClose = () => {
    clearCigarDraft("humidor");
    onClose();
  };

  /* ── Selection state ──────────────────────────────────────── */
  const [selected,        setSelected]        = useState<CatalogResult | null>(null);
  const [isManual,        setIsManual]        = useState(false);
  const [manual,          setManual]          = useState<CigarDetails>(EMPTY_CIGAR_DETAILS);

  /* ── Form state ───────────────────────────────────────────── */
  const today = new Date().toISOString().split("T")[0];
  const [quantity,     setQuantity]     = useState(1);
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [priceStr,     setPriceStr]     = useState("");
  const [source,       setSource]       = useState("");
  const [agingStart,   setAgingStart]   = useState(today);
  const [agingTarget,  setAgingTarget]  = useState("");
  const [notes,        setNotes]        = useState("");

  /* ── Humidor picker state ────────────────────────────────────
     userId is resolved lazily (below) so the sheet can mount before
     auth settles; useHumidors no-ops until then. Mirrors
     AddToHumidorSheet's picker exactly. */
  const [userId,           setUserId]           = useState<string | null>(null);
  const [pickedHumidorId,  setPickedHumidorId]  = useState<string | null>(null);
  const { humidors } = useHumidors(userId);

  /* ── Submit state ─────────────────────────────────────────── */
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);

  /* Manual-add dupe-check interstitial (mockup 06 step 3). Non-null
     while the user is deciding among the three outcomes. */
  const [dupe, setDupe] = useState<{ match: LineMatch; matchedChild: SizeChild | null } | null>(null);

  /* ── Layout state ─────────────────────────────────────────── */
  const [showTopCaret,    setShowTopCaret]    = useState(false);
  const [showBottomCaret, setShowBottomCaret] = useState(false);

  /* Primitive's scroll container — used for caret tracking. Escape,
     body scroll lock, and desktop/mobile presentation are all handled
     by BottomSheet. */
  const bodyRef = useRef<HTMLDivElement>(null);

  /* ── Reset on open ────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    setSelected(null); setIsManual(false);
    setManual(EMPTY_CIGAR_DETAILS);
    setQuantity(1); setPurchaseDate(today); setPriceStr("");
    setSource(""); setAgingStart(today); setAgingTarget(""); setNotes("");
    setSubmitError(null);
    setDupe(null);
    setPickedHumidorId(defaultHumidorId ?? null);

    /* Restore an in-flight manual draft. Covers the iOS PWA relaunch
       after the Look up button (or any app switch) evicted the page —
       the draft mirrors to localStorage as the user types, so reopening
       lands them back in manual mode with their fields intact. */
    const draft = loadCigarDraft("humidor");
    if (draft) {
      setIsManual(true);
      setManual(draft);
    }

    async function loadUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    }
    loadUser();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultHumidorId]);

  /* Mirror the manual draft to localStorage as the user types.
     saveCigarDraft self-clears when every field is empty. */
  useEffect(() => {
    if (!open || !isManual) return;
    saveCigarDraft("humidor", manual);
  }, [open, isManual, manual]);

  /* Fall back to the user's default humidor once the list loads, but
     only when no defaultHumidorId was supplied and nothing's picked
     yet. Mirrors AddToHumidorSheet's picker fallback. */
  useEffect(() => {
    if (!open || pickedHumidorId || !humidors || humidors.length === 0) return;
    const fallback = humidors.find((h) => h.is_default) ?? humidors[0];
    setPickedHumidorId(fallback.id);
  }, [open, humidors, pickedHumidorId]);

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

  /* Caret tracking listens on the primitive's scroller (the primitive
     owns the scroll container now; scrollRef exposes it). */
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !open) return;
    el.addEventListener("scroll", updateCarets, { passive: true });
    return () => el.removeEventListener("scroll", updateCarets);
  }, [open]);

  /* ── Handlers ─────────────────────────────────────────────── */
  function handleClear() {
    /* CigarSearch remounts when hasSelection flips back to false
       (it's gated on `open && !hasSelection`) — autoFocus handles
       the input refocus on its own. */
    setSelected(null);
    setIsManual(false);
  }

  /* Second phase: humidor insert + bookkeeping for a resolved
     catalog row. Community review rides on the catalog row itself
     (community_added/approved) — no separate suggestion record. */
  async function finishInsert(
    cigarId: string,
    opts: { bumpUsage?: CatalogResult | null; message?: string },
  ) {
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSubmitError("Not authenticated."); return; }

      const priceCents = priceStr ? Math.round(parseFloat(priceStr) * 100) : null;
      try {
        const humidorId = pickedHumidorId ?? (await ensureDefaultHumidor(user.id)).id;
        await addHumidorItem(supabase, {
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
          humidor_id:        humidorId,
        });
      } catch (e) {
        if (e instanceof HumidorLimitError) {
          setShowLimitModal(true);
          return;
        }
        setSubmitError(e instanceof Error ? e.message : "Something went wrong.");
        return;
      }

      if (opts.bumpUsage) {
        await supabase
          .from("cigar_catalog")
          .update({ usage_count: opts.bumpUsage.usage_count + 1 })
          .eq("id", opts.bumpUsage.id);
      }

      clearCigarDraft("humidor");
      onAdded(opts.message);
      onClose();
    } catch (err) {
      console.error("AddCigarSheet submit error:", err);
      setSubmitError("Something went wrong. Please try again.");
    }
  }

  async function handleSubmit() {
    const brand = isManual ? manual.brand.trim() : (selected?.brand ?? "Unknown");
    if (!brand) { setSubmitError("Brand is required."); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (selected) {
        await finishInsert(selected.id, { bumpUsage: selected });
        return;
      }
      /* Manual path: fuzzy-match BEFORE any insert. null = no match
         or RPC missing — straight save, zero added friction. */
      const match = await matchCigarLines(brand, manual.series.trim() || null).catch(() => null);
      if (match && match.children.length > 0) {
        setDupe({
          match,
          matchedChild: findMatchingSize(match.children, {
            format:       manual.format,
            ringGauge:    manual.ringGauge    ? Number(manual.ringGauge)    : null,
            lengthInches: manual.lengthInches ? Number(manual.lengthInches) : null,
          }),
        });
        return; // interstitial takes over; submitting reset in finally
      }
      await createListingAndFinish(manual.brand.trim(), manual.series.trim() || null);
    } catch (err) {
      console.error("AddCigarSheet submit error:", err);
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  /* Insert RPC + finish. Passing explicit brand/series lets Path B
     use the MATCHED LINE's exact strings (typo never enters the
     catalog); the v2 RPC copies blend from the line on attach. */
  async function createListingAndFinish(brand: string, series: string | null, message?: string) {
    const supabase = createClient();
    const args = { ...cigarDetailsToRpcArgs(manual), p_brand: brand, p_series: series };
    const { data, error: rpcErr } = await supabase.rpc("insert_cigar_to_catalog", args);
    if (rpcErr || !data) {
      setSubmitError(rpcErr?.message ?? "Failed to save cigar to catalog.");
      return;
    }
    await finishInsert(data as string, { message });
  }

  const hasSelection = selected !== null || isManual;

  /* ── Render ──────────────────────────────────────────────── */
  const headerSlot = (
    <>
      {/* ── Fixed header: title ──────────────────────────── */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
          <h2
            className="text-xl font-bold text-foreground"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Add Cigar
          </h2>
          <button
            onClick={handleClose}
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
            className="px-5 py-3"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <CigarSearch
              onSelect={(r) => setSelected(r)}
              onManual={() => setIsManual(true)}
              autoFocus
            />
          </div>
        )}
    </>
  );

  const bodySlot = (
    <>
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

                    <CigarDetailFields value={manual} onChange={setManual} />

                    {/* Manual adds always enter the community catalog
                        (pending admin review) — no opt-in needed. */}
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      New cigars join the community catalog after a quick review.
                    </p>
                  </div>
                )}

                {/* Humidor details */}
                <div
                  className="space-y-4 pt-5"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <h3 className="text-sm font-semibold text-foreground">Humidor Details</h3>

                  {/* Humidor picker — only when the user has 2+ humidors */}
                  {humidors && humidors.length >= 2 && (
                    <div>
                      <label htmlFor="add-cigar-humidor-picker" className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                        Humidor
                      </label>
                      <select
                        id="add-cigar-humidor-picker"
                        value={pickedHumidorId ?? ""}
                        onChange={(e) => setPickedHumidorId(e.target.value)}
                        className="input text-sm"
                        style={{ minHeight: 48 }}
                      >
                        {humidors.map((h) => (
                          <option key={h.id} value={h.id}>{h.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

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
    </>
  );

  const caretOverlay = (
    <>
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
    </>
  );

  return (
    <>
      <BottomSheet
        open={open}
        /* While the dupe interstitial is up, the sheet's own Escape
           listener (BottomSheet's useEscapeKey fires alongside the
           dialog's — stopPropagation can't stop sibling window
           listeners) must cancel the DIALOG, not close the sheet and
           wipe the draft. No-op while an insert is in flight. */
        onClose={dupe ? () => { if (!submitting) setDupe(null); } : handleClose}
        ariaLabel="Add cigar to humidor"
        header={headerSlot}
        bodyOverlay={caretOverlay}
        scrollRef={bodyRef}
        surface="background"
        mobileHeight="calc(100dvh - 48px)"
        desktopMaxWidth={640}
        desktopHeight="80dvh"
      >
        {bodySlot}
      </BottomSheet>

      <UpgradeLimitModal
        isOpen={showLimitModal}
        onClose={() => setShowLimitModal(false)}
      />

      {dupe && (
        <DupeCheckDialog
          match={dupe.match}
          matchedChild={dupe.matchedChild}
          busy={submitting}
          onCancel={() => setDupe(null)}
          onUseExisting={async (child) => {
            setSubmitting(true);
            try {
              await finishInsert(child.id, {
                message: "Added to your humidor. Linked to the existing catalog listing.",
              });
              setDupe(null);
            } finally { setSubmitting(false); }
          }}
          onAddSize={async () => {
            setSubmitting(true);
            try {
              await createListingAndFinish(
                dupe.match.line.brand,
                dupe.match.line.series,
                "Added to your humidor. Your size joined the existing listing.",
              );
              setDupe(null);
            } finally { setSubmitting(false); }
          }}
          onCreateNew={async () => {
            setSubmitting(true);
            try {
              await createListingAndFinish(
                manual.brand.trim(),
                manual.series.trim() || null,
                "Added to your humidor. New catalog listing created, pending review.",
              );
              setDupe(null);
            } finally { setSubmitting(false); }
          }}
        />
      )}
    </>
  );
}
