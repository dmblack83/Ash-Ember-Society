"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { addHumidorItem, HumidorLimitError } from "@/lib/humidor/add-item";
import { revalidateHumidor } from "@/lib/data/humidor-cache";
import { UpgradeLimitModal } from "@/components/membership/UpgradeLimitModal";
import { BottomSheet } from "@/components/ui/BottomSheet";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface ExistingItem {
  id: string;
  quantity: number;
}

export interface AddToHumidorSheetProps {
  cigarId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/* ------------------------------------------------------------------
   AddToHumidorSheet
   Bottom sheet on mobile, centered modal on desktop.
   ------------------------------------------------------------------ */

export function AddToHumidorSheet({
  cigarId,
  isOpen,
  onClose,
  onSuccess,
}: AddToHumidorSheetProps) {
  const today = new Date().toISOString().split("T")[0];

  /* Form state */
  const [quantity, setQuantity] = useState(1);
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [priceDollars, setPriceDollars] = useState("");
  const [source, setSource] = useState("");
  const [agingStartDate, setAgingStartDate] = useState(today);
  const [notes, setNotes] = useState("");

  /* UI state */
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingItems, setExistingItems] = useState<ExistingItem[]>([]);
  const [showConflict, setShowConflict] = useState(false);
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);

  /* Reset form and check for existing entries whenever the sheet opens */
  useEffect(() => {
    if (!isOpen) return;

    setQuantity(1);
    setPurchaseDate(today);
    setPriceDollars("");
    setSource("");
    setAgingStartDate(today);
    setNotes("");
    setError(null);
    setShowConflict(false);

    async function checkExisting() {
      setCheckingExisting(true);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { setCheckingExisting(false); return; }

      const { data } = await supabase
        .from("humidor_items")
        .select("id, quantity")
        .eq("cigar_id", cigarId)
        .eq("user_id", user.id)
        .eq("is_wishlist", false);

      setExistingItems(data ?? []);
      setCheckingExisting(false);
    }

    checkExisting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, cigarId]);

  /* Sync aging start date with purchase date */
  useEffect(() => {
    setAgingStartDate(purchaseDate);
  }, [purchaseDate]);

  /* Body scroll lock, escape key, and scroll-reset-on-open are all
     handled by the BottomSheet primitive. */

  /* Insert a new humidor entry */
  async function insertEntry() {
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Not authenticated. Please sign in again.");
      setSubmitting(false);
      return;
    }

    const priceCents =
      priceDollars.trim()
        ? Math.round(parseFloat(priceDollars) * 100)
        : null;

    try {
      await addHumidorItem(supabase, {
        user_id: user.id,
        cigar_id: cigarId,
        is_wishlist: false,
        quantity,
        purchase_quantity: quantity,
        purchase_date: purchaseDate || null,
        price_paid_cents: isNaN(priceCents!) ? null : priceCents,
        source: source.trim() || null,
        aging_start_date: agingStartDate || null,
        notes: notes.trim() || null,
      });
    } catch (e) {
      setSubmitting(false);
      if (e instanceof HumidorLimitError) {
        setShowLimitModal(true);
        return;
      }
      setError(e instanceof Error ? e.message : "Something went wrong.");
      return;
    }

    setSubmitting(false);
    /* Re-pull the Humidor list cache so the new cigar shows on return. */
    void revalidateHumidor(user.id);
    onSuccess();
    onClose();
  }

  /* Add qty to the first existing entry */
  async function addToExisting() {
    if (existingItems.length === 0) return;
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("humidor_items")
      .update({ quantity: existingItems[0].quantity + quantity })
      .eq("id", existingItems[0].id);

    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    /* Re-pull the Humidor list cache so the updated quantity shows on
       return. addToExisting doesn't otherwise need the user id, so fetch
       it here (cheap — the supabase client caches the session). */
    const { data: { user } } = await supabase.auth.getUser();
    if (user) void revalidateHumidor(user.id);

    onSuccess();
    onClose();
  }

  /* Primary submit — route to conflict UI or direct insert */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (existingItems.length > 0 && !showConflict) {
      setShowConflict(true);
    } else {
      insertEntry();
    }
  }

  /* ----------------------------------------------------------------
     Render
     ---------------------------------------------------------------- */

  return (
    <>
      <BottomSheet
        open={isOpen}
        onClose={onClose}
        ariaLabel="Add to Humidor"
      >
        <div className="px-5 pb-10 pt-4 sm:pt-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 style={{ fontFamily: "var(--font-serif)" }}>
              {showConflict ? "Already in Humidor" : "Add to Humidor"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost p-2 -mr-2"
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 3L13 13M13 3L3 13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* ── Conflict UI ─────────────────────────────────────── */}
          {showConflict ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You already have{" "}
                {existingItems.length > 1
                  ? `${existingItems.length} entries for`
                  : "this cigar in"}{" "}
                your humidor.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  className="btn btn-primary w-full"
                  onClick={addToExisting}
                  disabled={submitting}
                >
                  {/* Label stays constant while submitting — swapping to
                      "Updating…" changed the button width mid-tap (CLS). */}
                  <span className={submitting ? "opacity-60" : undefined}>
                    {`Add ${quantity} to existing (${existingItems[0]?.quantity ?? 0} → ${(existingItems[0]?.quantity ?? 0) + quantity})`}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary w-full"
                  onClick={insertEntry}
                  disabled={submitting}
                >
                  Add as new entry
                </button>
                <button
                  type="button"
                  className="btn btn-ghost w-full text-sm"
                  onClick={() => setShowConflict(false)}
                  disabled={submitting}
                >
                  Back
                </button>
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
          ) : (
            /* ── Form ─────────────────────────────────────────── */
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Quantity stepper */}
              <div className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
                  Quantity
                </p>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="btn btn-secondary w-10 h-10 p-0 flex items-center justify-center flex-shrink-0 text-xl leading-none"
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span
                    className="text-2xl font-semibold text-foreground w-8 text-center"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                    className="btn btn-secondary w-10 h-10 p-0 flex items-center justify-center flex-shrink-0 text-xl leading-none"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Purchase date */}
              <div className="space-y-1.5">
                <label
                  htmlFor="purchase-date"
                  className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium"
                >
                  Purchase Date
                </label>
                <input
                  id="purchase-date"
                  type="date"
                  className="input"
                  value={purchaseDate}
                  max={today}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                />
              </div>

              {/* Price per stick */}
              <div className="space-y-1.5">
                <label
                  htmlFor="price"
                  className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium"
                >
                  Price per Stick
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none select-none">
                    $
                  </span>
                  <input
                    id="price"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="input pl-7"
                    value={priceDollars}
                    onChange={(e) => setPriceDollars(e.target.value)}
                  />
                </div>
              </div>

              {/* Source */}
              <div className="space-y-1.5">
                <label
                  htmlFor="source"
                  className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium"
                >
                  Source
                </label>
                <input
                  id="source"
                  type="text"
                  className="input"
                  placeholder="Where did you buy it?"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                />
              </div>

              {/* Aging start date */}
              <div className="space-y-1.5">
                <label
                  htmlFor="aging-date"
                  className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium"
                >
                  Aging Start Date
                </label>
                <input
                  id="aging-date"
                  type="date"
                  className="input"
                  value={agingStartDate}
                  max={today}
                  onChange={(e) => setAgingStartDate(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  When did you start aging this cigar?
                </p>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label
                  htmlFor="notes"
                  className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium"
                >
                  Notes{" "}
                  <span className="normal-case tracking-normal font-normal">
                    (optional)
                  </span>
                </label>
                <textarea
                  id="notes"
                  className="input resize-none"
                  placeholder="Any notes about this purchase…"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={submitting || checkingExisting}
              >
                {submitting ? "Adding…" : "Add to Humidor"}
              </button>
            </form>
          )}
        </div>
      </BottomSheet>

      <UpgradeLimitModal
        isOpen={showLimitModal}
        onClose={() => setShowLimitModal(false)}
      />
    </>
  );
}
