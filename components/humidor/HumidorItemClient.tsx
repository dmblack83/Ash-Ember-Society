"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { createClient } from "@/utils/supabase/client";
import { Divider } from "@/components/ui/divider";
import { Toast } from "@/components/ui/toast";
import { CigarImage } from "@/components/ui/CigarImage";
import { countryName, wrapperDisplay } from "@/lib/country-name";
import type { HumidorItemDetail, SmokeLog } from "@/app/(app)/humidor/[id]/page";
import { QuickLogModal, type SmokeLogDraft } from "@/components/humidor/QuickLogModal";
import { LastStickPrompt } from "@/components/humidor/LastStickPrompt";
import { addCigarToWishlist } from "@/lib/humidor/wishlist-add";
import { revalidateHumidor } from "@/lib/data/humidor-cache";
import { keyFor } from "@/lib/data/keys";
import type { HumidorItemBundle } from "@/lib/data/humidor-item-fetchers";
import { useHumidors } from "@/components/humidor/useHumidors";
import { friendlyWriteError } from "@/lib/data/humidor-move";
import { MoveToHumidorSheet } from "@/components/humidor/MoveToHumidorSheet";
import { AgingTargetSelect }       from "@/components/humidor/AgingTargetSelect";
import { CigarPhotoSubmitButton }  from "@/components/cigars/CigarPhotoSubmitButton";
import { CigarEditSuggestButton } from "@/components/cigars/CigarEditSuggestButton";
import { useEscapeKey }            from "@/lib/hooks/use-escape-key";
import { agingDays, todayLocalYmd } from "@/lib/format";

/* ------------------------------------------------------------------
   Design-system helpers
   ------------------------------------------------------------------ */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/* ------------------------------------------------------------------
   Sub-components
   ------------------------------------------------------------------ */


function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="text-center py-5 px-4 rounded-xl"
      style={{ backgroundColor: "var(--secondary)", border: "1px solid var(--border)" }}
    >
      <p
        className="text-3xl font-bold text-foreground"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium mt-2">
        {label}
      </p>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex flex-col gap-0.5 px-3 py-2 rounded-lg"
      style={{ backgroundColor: "var(--muted)", border: "1px solid var(--border)" }}
    >
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
        {label}
      </span>
      <span className="text-sm text-foreground font-medium">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------
   Delete confirmation dialog
   ------------------------------------------------------------------ */

function DeleteDialog({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  /* Mounted only when open, so the listener attaches for the dialog's
     full lifetime. */
  useEscapeKey(true, onCancel);

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 transition-opacity duration-200"
        style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="card w-full max-w-sm space-y-5 animate-fade-in">
          <h3 style={{ fontFamily: "var(--font-serif)" }}>Remove from humidor?</h3>
          <p className="text-sm text-muted-foreground">
            This will permanently remove this cigar entry from your humidor. Your smoke logs will be preserved.
          </p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="btn w-full"
              style={{ backgroundColor: "#C44536", color: "#fff" }}
            >
              {loading ? "Removing…" : "Remove from Humidor"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="btn btn-ghost w-full"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------
   Edit details sheet (bottom sheet on mobile, modal on desktop)
   ------------------------------------------------------------------ */

function EditSheet({
  item,
  isOpen,
  onClose,
  onSaved,
}: {
  item: HumidorItemDetail;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (updated: Partial<HumidorItemDetail>) => void;
}) {
  /* Escape-key dismissal — listener only attached while open. */
  useEscapeKey(isOpen, onClose);

  const today = todayLocalYmd();

  const [purchaseDate, setPurchaseDate] = useState(item.purchase_date ?? "");
  const [priceDollars, setPriceDollars] = useState(
    item.price_paid_cents != null ? (item.price_paid_cents / 100).toFixed(2) : ""
  );
  const [source, setSource] = useState(item.source ?? "");
  const [agingStartDate,   setAgingStartDate]   = useState(item.aging_start_date   ?? "");
  const [agingTargetDate,  setAgingTargetDate]  = useState(item.aging_target_date  ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Reset fields when REOPENED — and only then.
   *
   * `item` must NOT be a dependency: the parent recreates it as a new
   * object on every render ({ ...initialItem, ...itemFields }), so any
   * background re-render while the sheet is open (humidor SWR
   * revalidate, a toast timer) re-fired this effect and silently wiped
   * whatever the user had typed back to the saved values. That is the
   * "my notes disappeared while editing" bug. Latest item values are
   * read through a ref at open time instead. */
  const itemRef = useRef(item);
  useEffect(() => { itemRef.current = item; });
  useEffect(() => {
    if (!isOpen) return;
    const it = itemRef.current;
    setPurchaseDate(it.purchase_date ?? "");
    setPriceDollars(it.price_paid_cents != null ? (it.price_paid_cents / 100).toFixed(2) : "");
    setSource(it.source ?? "");
    setAgingStartDate(it.aging_start_date   ?? "");
    setAgingTargetDate(it.aging_target_date ?? "");
    setNotes(it.notes ?? "");
    setError(null);
  }, [isOpen]);

  /* Lock body scroll while open (iOS-safe: position:fixed approach) */
  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const priceCents = priceDollars.trim()
      ? Math.round(parseFloat(priceDollars) * 100)
      : null;

    const updates = {
      purchase_date:     purchaseDate       || null,
      price_paid_cents:  isNaN(priceCents!) ? null : priceCents,
      source:            source.trim()      || null,
      aging_start_date:  agingStartDate     || null,
      aging_target_date: agingTargetDate    || null,
      notes:             notes.trim()       || null,
    };

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("humidor_items")
      .update(updates)
      .eq("id", item.id);

    setSubmitting(false);
    if (updateError) {
      setError(friendlyWriteError(updateError));
      return;
    }

    onSaved(updates);
    onClose();
  }

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          backgroundColor: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(4px)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
        }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit humidor entry"
        className={[
          "fixed z-50 bg-card shadow-2xl overflow-y-auto overflow-x-hidden transition-all duration-300 ease-out",
          "inset-x-0 bottom-0 rounded-t-2xl max-h-[92dvh]",
          "sm:inset-0 sm:m-auto sm:rounded-2xl sm:w-full sm:max-w-md sm:h-fit sm:max-h-[90dvh]",
        ].join(" ")}
        style={{
          transform: isOpen ? "translateY(0)" : "translateY(100%)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
        }}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-muted" />
        </div>
        <div className="px-5 pb-10 pt-4 sm:pt-6">
          <div className="flex items-center justify-between mb-6">
            <h2 style={{ fontFamily: "var(--font-serif)" }}>Edit Details</h2>
            <button type="button" onClick={onClose} className="btn btn-ghost p-2 -mr-2" aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="edit-purchase-date" className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
                Purchase Date
              </label>
              <input
                id="edit-purchase-date"
                type="date"
                className="input"
                value={purchaseDate}
                max={today}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-price" className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
                Price per Stick
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none select-none">$</span>
                <input
                  id="edit-price"
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
            <div className="space-y-1.5">
              <label htmlFor="edit-source" className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
                Source
              </label>
              <input
                id="edit-source"
                type="text"
                className="input"
                placeholder="Where did you buy it?"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-aging-date" className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
                Aging Start Date
              </label>
              <input
                id="edit-aging-date"
                type="date"
                className="input"
                value={agingStartDate}
                max={today}
                onChange={(e) => setAgingStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
                Ready to Smoke By
              </label>
              <AgingTargetSelect
                value={agingTargetDate}
                onChange={setAgingTargetDate}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit-notes" className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
                Notes <span className="normal-case tracking-normal font-normal">(optional)</span>
              </label>
              <textarea
                id="edit-notes"
                className="input resize-none"
                placeholder="Any notes about this purchase…"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
              {submitting ? "Saving…" : "Save Changes"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------
   Main client component
   ------------------------------------------------------------------ */

export function HumidorItemClient({
  item: initialItem,
  initialSmokeLogs,
  userId,
  hasPending     = false,
  hasApproved    = false,
  hasPendingEdit = false,
}: {
  item: HumidorItemDetail;
  initialSmokeLogs: SmokeLog[];
  userId: string;
  hasPending?:      boolean;
  hasApproved?:     boolean;
  hasPendingEdit?:  boolean;
}) {
  const router = useRouter();

  /* Mutable item fields */
  const [quantity, setQuantity] = useState(initialItem.quantity);
  const [itemFields, setItemFields] = useState({
    purchase_date: initialItem.purchase_date,
    price_paid_cents: initialItem.price_paid_cents,
    source: initialItem.source,
    aging_start_date: initialItem.aging_start_date,
    notes: initialItem.notes,
  });
  const item = { ...initialItem, ...itemFields, quantity };

  /* Smoke logs */
  const [smokeLogs, setSmokeLogs] = useState<SmokeLog[]>(initialSmokeLogs);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  /* UI state */
  const [qtyLoading, setQtyLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [notesEditing, setNotesEditing] = useState(false);
  const [notesDraft,   setNotesDraft]   = useState("");
  const [notesSaving,  setNotesSaving]  = useState(false);
  const [smokeOpen, setSmokeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  /* "Last stick" prompt — shown after a quick log drops the entry to
     zero. `busy` disables the prompt's buttons while the wishlist
     write is in flight. */
  const [lastStickOpen, setLastStickOpen] = useState(false);
  const [lastStickBusy, setLastStickBusy] = useState(false);

  /* Move to humidor — only relevant once the user has 2+ humidors.
     The current-humidor tag and the "Move to..." action both gate on
     this same count. */
  const { humidors } = useHumidors(userId);
  const hasMultipleHumidors = (humidors?.length ?? 0) >= 2;
  const currentHumidorName =
    humidors?.find((h) => h.id === item.humidor_id)?.name ?? "My Humidor";

  const c = item.cigar;
  const cigarLabel = [c.brand, c.series ?? c.format].filter(Boolean).join(" ");
  const days = agingDays(item.aging_start_date);
  const agingProgress = Math.min(days / 180, 1) * 100;

  /* ── Quantity stepper ─────────────────────────────────────── */

  /* Returns true only when the Supabase write succeeded — false on the
     early-return no-op and on error. Callers that trigger follow-up UI
     (the last-stick prompt) gate on this so a failed, reverted write
     can't open a prompt describing a zero the DB never reached. */
  async function updateQuantity(next: number): Promise<boolean> {
    if (next < 0 || qtyLoading) return false;
    const prev = quantity;
    setQuantity(next);
    setQtyLoading(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("humidor_items")
      .update({ quantity: next })
      .eq("id", item.id);

    setQtyLoading(false);
    if (error) {
      setQuantity(prev);
      setToast("Failed to update quantity.");
      return false;
    }
    /* Re-pull the Humidor list cache so the new quantity shows when the
       user navigates back (the list uses revalidateOnMount:false). */
    void revalidateHumidor(userId);
    return true;
  }

  /* ── Smoke One ────────────────────────────────────────────── */

  async function handleSmoked(draft: SmokeLogDraft) {
    setSmokeOpen(false);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setToast("Not authenticated."); return; }

    /* Insert smoke log */
    const { data: inserted, error: logError } = await supabase
      .from("smoke_logs")
      .insert({
        user_id: user.id,
        cigar_id: item.cigar_id,
        smoked_at: draft.smoked_at,
        overall_rating: draft.overall_rating,
        review_text: draft.review_text,
      })
      .select("id, smoked_at, overall_rating, review_text, content_video_id")
      .single();

    if (logError) {
      setToast("Smoke logged, but failed to save.");
    } else if (inserted) {
      setSmokeLogs((prev) => [{ ...inserted, content_video: null } as SmokeLog, ...prev]);
      setToast("Smoke logged!");
    }

    /* Decrement quantity (optimistic). Use the computed next value for
       the "did we just hit 0" check rather than re-reading `quantity`
       state after the await — that read would close over the render
       this handler was created in, not the post-update value. */
    if (quantity > 0) {
      const nextQuantity = quantity - 1;
      const updated = await updateQuantity(nextQuantity);
      if (updated && nextQuantity <= 0) {
        setLastStickOpen(true);
      }
    }
  }

  /* ── Last stick prompt ────────────────────────────────────── */

  function handleLastStickKeep() {
    setLastStickOpen(false);
  }

  async function handleLastStickWishlist() {
    if (lastStickBusy) return;
    setLastStickBusy(true);
    try {
      const result = await addCigarToWishlist(userId, item.cigar_id);
      setToast(result === "added" ? "Added to your wishlist." : "Already on your wishlist.");
      setLastStickOpen(false);
    } catch {
      setToast("Couldn't add to wishlist.");
    } finally {
      setLastStickBusy(false);
    }
  }

  function handleLastStickRemove() {
    setLastStickOpen(false);
    void handleDelete();
  }

  /* ── Inline notes save ────────────────────────────────────── */

  async function handleNotesSave() {
    if (notesSaving) return;
    setNotesSaving(true);

    const nextNotes = notesDraft.trim() || null;
    const supabase = createClient();
    const { error } = await supabase
      .from("humidor_items")
      .update({ notes: nextNotes })
      .eq("id", item.id);

    setNotesSaving(false);
    if (error) {
      setToast(friendlyWriteError(error));
      return;
    }
    setItemFields((prev) => ({ ...prev, notes: nextNotes }));
    setNotesEditing(false);
    setToast("Notes saved.");
    void revalidateHumidor(userId);
  }

  /* ── Edit saved ───────────────────────────────────────────── */

  function handleSaved(updated: Partial<typeof itemFields>) {
    setItemFields((prev) => ({ ...prev, ...updated }));
    setToast("Details saved.");
    /* Edited fields (aging date, notes, etc.) show in the list — refresh. */
    void revalidateHumidor(userId);
  }

  /* ── Delete ───────────────────────────────────────────────── */

  async function handleDelete() {
    setDeleteLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("humidor_items").delete().eq("id", item.id);
    setDeleteLoading(false);

    if (error) {
      setToast("Failed to remove cigar.");
      setDeleteOpen(false);
      return;
    }

    /* Update the list cache before navigating so the deleted item is
       already gone when the list mounts. */
    void revalidateHumidor(userId);
    router.push("/humidor");
  }

  /* ── Move to humidor ──────────────────────────────────────── */

  function handleMoved(destId: string) {
    /* Refresh the Humidor list cache (unmounted at this call site, per
       revalidateHumidor's own contract) and this item bundle's cache
       key — the latter with an optimistic patch of humidor_id so the
       tag updates the instant the sheet closes, then a background
       revalidate confirms it against the server. */
    void revalidateHumidor(userId);
    void mutate(
      keyFor.humidorItemBundle(userId, item.id),
      (current: HumidorItemBundle | undefined) =>
        current ? { ...current, item: { ...current.item, humidor_id: destId } } : current,
      { revalidate: true },
    );
  }

  /* ── Derived stats ────────────────────────────────────────── */

  const timesSmoked = smokeLogs.length;
  const avgPersonalRating =
    timesSmoked > 0
      ? (smokeLogs.reduce((s, l) => s + (l.overall_rating ?? 0), 0) / timesSmoked).toFixed(1)
      : null;

  /* ── Render ───────────────────────────────────────────────── */

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">

      {/* Toasts */}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      {/* Back */}
      <Link
        href="/humidor"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M9 11L5 7L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to humidor
      </Link>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start animate-fade-in">
        {/* Cigar image */}
        <div className="w-full sm:w-64 flex-shrink-0 flex flex-col gap-2">
          <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-muted flex items-center justify-center relative">
            <CigarImage
              imageUrl={c.image_url}
              wrapper={c.wrapper}
              alt={c.series ?? c.format ?? ""}
              fill
              sizes="(max-width: 640px) 100vw, 256px"
              quality={80}
              priority
              style={{ objectFit: "contain" }}
            />
          </div>
          <CigarPhotoSubmitButton
            cigarId={item.cigar_id}
            cigarName={cigarLabel}
            hasPending={hasPending}
            hasApproved={hasApproved}
          />
        </div>

        {/* Info */}
        <div className="flex flex-col gap-2 flex-1 min-w-0 pt-1">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            {c.brand}
          </p>
          {hasMultipleHumidors && (
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--gold)" }}>
              {currentHumidorName}
            </p>
          )}
          <h1 className="text-foreground leading-tight" style={{ fontFamily: "var(--font-serif)" }}>
            {c.series ?? c.format}
          </h1>
          {c.format && (
            <p className="text-sm text-muted-foreground">{c.format}</p>
          )}

          {/* Wrapper / binder / filler chips */}
          <div className="flex flex-wrap gap-2 mt-2">
            {c.wrapper && <Chip label="Wrapper" value={wrapperDisplay(c.wrapper)} />}
            {c.binder_country && <Chip label="Binder" value={countryName(c.binder_country)} />}
            {c.filler_countries && c.filler_countries.length > 0 && (
              <Chip label="Filler" value={c.filler_countries.map(countryName).join(", ")} />
            )}
          </div>

          {/* Suggest-edit button — same outline-style as Contribute a Photo */}
          <CigarEditSuggestButton
            cigar={{
              id:                item.cigar_id,
              brand:             c.brand,
              series:            c.series,
              format:            c.format,
              ring_gauge:        c.ring_gauge,
              length_inches:     c.length_inches,
              shade:             c.shade,
              wrapper:           c.wrapper,
              wrapper_country:   c.wrapper_country,
              binder_country:    c.binder_country,
              filler_countries:  c.filler_countries,
            }}
            hasPending={hasPendingEdit}
          />
        </div>
      </section>

      <Divider className="my-6" />

      {/* ── Item details ─────────────────────────────────────────── */}
      <section className="space-y-6 animate-slide-up">
        <h2>Your Entry</h2>

        {/* Quantity stepper */}
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
            Quantity
          </p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => updateQuantity(quantity - 1)}
              disabled={quantity <= 0 || qtyLoading}
              className="btn btn-secondary w-10 h-10 p-0 flex items-center justify-center text-xl leading-none disabled:opacity-40"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span
              className="text-3xl font-bold text-foreground w-10 text-center"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => updateQuantity(quantity + 1)}
              disabled={qtyLoading}
              className="btn btn-secondary w-10 h-10 p-0 flex items-center justify-center text-xl leading-none"
              aria-label="Increase quantity"
            >
              +
            </button>
            <span className="text-sm text-muted-foreground">
              {quantity === 1 ? "cigar" : "cigars"}
            </span>
          </div>
        </div>

        {/* Aging progress bar */}
        {item.aging_start_date && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
                Aging
              </p>
              <p
                className="text-sm font-medium"
                style={{ color: days >= 180 ? "var(--accent)" : days >= 90 ? "var(--primary)" : "var(--muted-foreground)" }}
              >
                {days >= 180 ? `${days} days — Well rested ✦` : `${days} days`}
              </p>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--muted)" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${agingProgress}%`,
                  backgroundColor: days >= 180 ? "var(--accent)" : "var(--primary)",
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{formatDate(item.aging_start_date)}</span>
              <span>180d target</span>
            </div>
          </div>
        )}

        {/* Purchase details grid */}
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
          {item.purchase_date && (
            <div className="space-y-0.5">
              <dt className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Purchased</dt>
              <dd className="text-sm text-foreground font-medium">{formatDate(item.purchase_date)}</dd>
            </div>
          )}
          {item.price_paid_cents != null && (
            <div className="space-y-0.5">
              <dt className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Price / Stick</dt>
              <dd className="text-sm text-foreground font-medium">${(item.price_paid_cents / 100).toFixed(2)}</dd>
            </div>
          )}
          {item.source && (
            <div className="space-y-0.5">
              <dt className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Source</dt>
              <dd className="text-sm text-foreground font-medium">{item.source}</dd>
            </div>
          )}
        </dl>

        {/* Notes — always visible, editable in place. Previously this
            section rendered only when notes were non-empty, so items
            without notes had no visible way to see or add them. */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Notes</p>
            {!notesEditing && (
              <button
                type="button"
                onClick={() => { setNotesDraft(item.notes ?? ""); setNotesEditing(true); }}
                className="text-xs font-medium"
                style={{ color: "var(--gold, #D4A04A)", background: "none", border: "none", cursor: "pointer", touchAction: "manipulation", padding: "4px 0" }}
              >
                {item.notes ? "Edit" : "Add notes"}
              </button>
            )}
          </div>

          {notesEditing ? (
            <div className="space-y-2">
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                maxLength={1000}
                autoFocus
                placeholder="Any notes about this cigar…"
                className="w-full rounded-xl px-3 py-2 text-sm resize-none"
                style={{
                  minHeight: 88,
                  backgroundColor: "rgba(255,255,255,0.05)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  fontSize: 16, /* prevents iOS zoom */
                  outline: "none",
                }}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleNotesSave}
                  disabled={notesSaving}
                  className="text-xs font-semibold px-4 py-2 rounded-full"
                  style={{
                    background: "var(--gold, #D4A04A)", color: "#1A1210", border: "none",
                    cursor: notesSaving ? "default" : "pointer", touchAction: "manipulation",
                  }}
                >
                  {notesSaving ? "Saving..." : "Save Notes"}
                </button>
                <button
                  type="button"
                  onClick={() => setNotesEditing(false)}
                  className="text-xs font-semibold px-4 py-2 rounded-full"
                  style={{
                    background: "transparent", color: "var(--muted-foreground)",
                    border: "1px solid var(--border)", cursor: "pointer", touchAction: "manipulation",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : item.notes ? (
            <p className="text-sm text-foreground leading-relaxed" style={{ whiteSpace: "pre-line" }}>{item.notes}</p>
          ) : (
            <p className="text-sm" style={{ color: "var(--muted-foreground)", fontStyle: "italic" }}>
              No notes yet.
            </p>
          )}
        </div>
      </section>

      {/* ── Actions ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <Link
          href={`/humidor/${item.id}/burn-report`}
          className="btn btn-primary w-full text-center"
        >
          File Burn Report
        </Link>
        <button
          type="button"
          className="btn btn-secondary w-full"
          onClick={() => setSmokeOpen(true)}
        >
          Quick Smoke Log
        </button>
        <button
          type="button"
          className="btn btn-secondary w-full"
          onClick={() => setEditOpen(true)}
        >
          Edit Details
        </button>
        {hasMultipleHumidors && (
          <button
            type="button"
            className="btn btn-ghost w-full"
            onClick={() => setMoveOpen(true)}
          >
            Move to...
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost w-full text-sm"
          style={{ color: "#C44536" }}
          onClick={() => setDeleteOpen(true)}
        >
          Remove from Humidor
        </button>
      </div>

      <Divider className="my-6" />

      {/* ── Stats ────────────────────────────────────────────────── */}
      <section className="space-y-4 animate-slide-up">
        <h2>Stats</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Times Smoked" value={String(timesSmoked)} />
          <StatCard
            label="Avg. Personal"
            value={avgPersonalRating ?? "—"}
            sub={avgPersonalRating ? "/ 100" : undefined}
          />
          {c.ring_gauge != null && (
            <StatCard label="Ring Gauge" value={String(c.ring_gauge)} />
          )}
        </div>
      </section>

      <Divider className="my-6" />

      {/* ── Smoke history ─────────────────────────────────────────── */}
      <section className="space-y-4 animate-slide-up">
        <h2>Smoke History</h2>

        {smokeLogs.length === 0 ? (
          <div className="card text-center py-10 space-y-2">
            <p className="text-sm text-muted-foreground">No smoke logs yet.</p>
            <button
              type="button"
              className="btn btn-ghost text-sm mt-2"
              onClick={() => setSmokeOpen(true)}
            >
              Log your first smoke
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {smokeLogs.map((log) => {
              const expanded = expandedLogId === log.id;
              return (
                <div
                  key={log.id}
                  className="card card-interactive w-full text-left"
                  onClick={() => setExpandedLogId(expanded ? null : log.id)}
                  style={{ cursor: "pointer" }}
                >
                  <div className="flex items-start gap-4">
                    {/* Rating */}
                    <div
                      className="text-4xl font-bold flex-shrink-0 leading-none mt-0.5"
                      style={{
                        fontFamily: "var(--font-serif)",
                        color: log.overall_rating != null ? "var(--primary)" : "var(--muted-foreground)",
                      }}
                    >
                      {log.overall_rating ?? "—"}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {formatDate(log.smoked_at)}
                      </p>
                      {log.review_text && (
                        <p
                          className={`text-sm text-muted-foreground mt-1 transition-all duration-200 ${
                            expanded ? "" : "line-clamp-2"
                          }`}
                        >
                          {log.review_text}
                        </p>
                      )}
                      {!log.review_text && (
                        <p className="text-xs text-muted-foreground/60 mt-1 italic">No notes</p>
                      )}
                    </div>

                    {/* Expand chevron */}
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      aria-hidden="true"
                      className="flex-shrink-0 mt-1 text-muted-foreground transition-transform duration-200"
                      style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
                    >
                      <path
                        d="M3 5L7 9L11 5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>

                  {/* YouTube link — only shown when expanded */}
                  {expanded && log.content_video && (
                    <div
                      className="mt-3 pt-3 flex items-center"
                      style={{ borderTop: "1px solid var(--border)" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link
                        href={`https://www.youtube.com/watch?v=${log.content_video.youtube_video_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5"
                        style={{
                          border: "1.5px solid rgba(255,0,0,0.4)",
                          color: "#FF4444",
                          background: "transparent",
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                        </svg>
                        Watch on YouTube
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Overlays ─────────────────────────────────────────────── */}
      <EditSheet
        item={initialItem}
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={handleSaved}
      />

      <QuickLogModal
        isOpen={smokeOpen}
        onClose={() => setSmokeOpen(false)}
        onSmoked={handleSmoked}
      />

      <LastStickPrompt
        open={lastStickOpen}
        cigarLabel={cigarLabel}
        humidorName={currentHumidorName}
        busy={lastStickBusy}
        onWishlist={handleLastStickWishlist}
        onKeep={handleLastStickKeep}
        onRemove={handleLastStickRemove}
      />

      {deleteOpen && (
        <DeleteDialog
          onConfirm={handleDelete}
          onCancel={() => setDeleteOpen(false)}
          loading={deleteLoading}
        />
      )}

      <MoveToHumidorSheet
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        userId={userId}
        currentHumidorId={item.humidor_id}
        itemId={item.id}
        onMoved={handleMoved}
        onToast={setToast}
      />
    </div>
  );
}
