"use client";

import { useState } from "react";
import { AgingTargetSelect } from "@/components/humidor/AgingTargetSelect";
import type { SaveFormState } from "@/lib/cigars/add-flow-state";
import { setPurchaseDate, setAgingStart } from "@/lib/cigars/add-flow-state";

/* ------------------------------------------------------------------
   SaveStep — mockup section 04. One-tap save with collapsed purchase
   details.

   Presentational only: no data fetching, no Supabase. All state lives
   in props; this component just renders the field stack and reports
   changes upward via onForm.
   ------------------------------------------------------------------ */

export interface SaveStepProps {
  mode:            "humidor" | "wishlist";
  form:            SaveFormState;
  onForm:          (next: SaveFormState) => void;
  humidors:        { id: string; name: string; is_default: boolean }[] | undefined;
  pickedHumidorId: string | null;
  onPickHumidor:   (id: string) => void;
  submitting:      boolean;
  submitError:     string | null;
  ctaLabel:        string;
  onSubmit:        () => void;
}

export function SaveStep({
  mode,
  form,
  onForm,
  humidors,
  pickedHumidorId,
  onPickHumidor,
  submitting,
  submitError,
  ctaLabel,
  onSubmit,
}: SaveStepProps) {
  /* Closed-by-default expander (mockup 04: dashed border collapsed,
     solid open). Purely local UI state — never persisted. */
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div
      className="space-y-4 pt-5"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      {mode === "humidor" && (
        <>
          {/* Quantity stepper — ported verbatim from AddCigarSheet */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: "var(--muted-foreground)" }}>
              Quantity
            </label>
            <div className="flex items-center gap-4">
              <button
                onClick={() => onForm({ ...form, quantity: Math.max(1, form.quantity - 1) })}
                className="flex items-center justify-center rounded-xl text-xl font-light transition-colors active:opacity-70"
                style={{ width: 48, height: 48, backgroundColor: "var(--muted)", color: "var(--foreground)" }}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="text-xl font-semibold text-foreground w-10 text-center tabular-nums">
                {form.quantity}
              </span>
              <button
                onClick={() => onForm({ ...form, quantity: form.quantity + 1 })}
                className="flex items-center justify-center rounded-xl text-xl font-light transition-colors active:opacity-70"
                style={{ width: 48, height: 48, backgroundColor: "var(--muted)", color: "var(--foreground)" }}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          </div>

          {/* Humidor picker — only when the user has 2+ humidors */}
          {humidors && humidors.length >= 2 && (
            <div>
              <label htmlFor="add-cigar-humidor-picker" className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                Humidor
              </label>
              <select
                id="add-cigar-humidor-picker"
                value={pickedHumidorId ?? ""}
                onChange={(e) => onPickHumidor(e.target.value)}
                className="input text-sm"
                style={{ minHeight: 48 }}
              >
                {humidors.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Error + CTA sit right after Quantity/Humidor — mockup 04's
              collapsed frame keeps "Add to Humidor" reachable in one
              tap, with the expander (and its fields) anchored below
              it rather than gating the button behind a scroll. */}
          {submitError && (
            <p className="text-sm text-center" style={{ color: "var(--destructive)" }}>
              {submitError}
            </p>
          )}

          <button
            onClick={onSubmit}
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
              ctaLabel
            )}
          </button>

          {/* Expander — mockup 04: dashed border collapsed, solid open */}
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-sm transition-colors"
            style={{
              border:          detailsOpen ? "1px solid var(--border)" : "1px dashed var(--border)",
              backgroundColor: detailsOpen ? "var(--card)" : "transparent",
              color:           "var(--muted-foreground)",
            }}
            aria-expanded={detailsOpen}
          >
            <span>Add purchase details</span>
            <svg
              width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true"
              style={{ transform: detailsOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
            >
              <path d="M3 5.5L7 9.5L11 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {detailsOpen && (
            <div className="space-y-4 animate-fade-in">
              {/* Purchase date */}
              <div style={{ overflow: "hidden" }}>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                  Purchase Date
                </label>
                <input
                  type="date"
                  value={form.purchaseDate}
                  onChange={(e) => onForm(setPurchaseDate(form, e.target.value))}
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
                    value={form.priceStr}
                    onChange={(e) => onForm({ ...form, priceStr: e.target.value })}
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
                  value={form.source}
                  onChange={(e) => onForm({ ...form, source: e.target.value })}
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
                  value={form.agingStart}
                  onChange={(e) => onForm(setAgingStart(form, e.target.value))}
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
                  value={form.agingTarget}
                  onChange={(date) => onForm({ ...form, agingTarget: date })}
                  defaultPreset="2_weeks"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                  Notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => onForm({ ...form, notes: e.target.value })}
                  placeholder="Storage location, thoughts…"
                  rows={3}
                  className="input w-full resize-none text-sm py-3"
                />
              </div>
            </div>
          )}
        </>
      )}

      {mode === "wishlist" && (
        <>
          {/* Wishlist parity: Notes only — no quantity, humidor
              picker, purchase date, price, source, or aging fields. */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted-foreground)" }}>
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => onForm({ ...form, notes: e.target.value })}
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
            onClick={onSubmit}
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
              ctaLabel
            )}
          </button>
        </>
      )}
    </div>
  );
}
