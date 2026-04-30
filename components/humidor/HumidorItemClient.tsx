"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Divider } from "@/components/ui/divider";
import { Toast } from "@/components/ui/toast";
import { BrandPlaceholder } from "@/components/ui/cigar-placeholder";
import { getCigarImage } from "@/lib/cigar-default-image";
import { countryName, wrapperDisplay } from "@/lib/country-name";
import type { HumidorItemDetail, SmokeLog } from "@/app/(app)/humidor/[id]/page";
import { AgingTargetSelect }       from "@/components/humidor/AgingTargetSelect";
import { CigarPhotoSubmitButton }  from "@/components/cigars/CigarPhotoSubmitButton";

/* ------------------------------------------------------------------
   Design-system helpers
   ------------------------------------------------------------------ */

function agingDays(startDate: string | null): number {
  if (!startDate) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(startDate).getTime()) / 86_400_000));
}

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
  const today = new Date().toISOString().split("T")[0];

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

  /* Reset fields when reopened */
  useEffect(() => {
    if (!isOpen) return;
    setPurchaseDate(item.purchase_date ?? "");
    setPriceDollars(item.price_paid_cents != null ? (item.price_paid_cents / 100).toFixed(2) : "");
    setSource(item.source ?? "");
    setAgingStartDate(item.aging_start_date   ?? "");
    setAgingTargetDate(item.aging_target_date ?? "");
    setNotes(item.notes ?? "");
    setError(null);
  }, [isOpen, item]);

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
      setError(updateError.message);
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
   Smoke One modal
   ------------------------------------------------------------------ */

function SmokeModal({
  isOpen,
  onClose,
  onSmoked,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSmoked: (log: SmokeLog) => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [smokedAt, setSmokedAt] = useState(today);
  const [rating, setRating] = useState<number>(8);
  const [reviewText, setReviewText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSmokedAt(today);
    setRating(8);
    setReviewText("");
    setError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Not authenticated.");
      setSubmitting(false);
      return;
    }

    // We need the cigar_id — passed via onSmoked callback shape
    // The modal doesn't have it directly; parent handles the insert
    onSmoked({
      id: "", // placeholder — parent will fill after insert
      smoked_at: smokedAt,
      overall_rating: rating,
      review_text: reviewText.trim() || null,
      content_video_id: null,
      content_video: null,
    });
  }

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40"
        style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      >
        <div className="card w-full sm:max-w-md sm:mx-4 rounded-t-2xl sm:rounded-2xl animate-slide-up overflow-x-hidden">
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-muted" />
          </div>
          <div className="px-5 pb-10 pt-4 sm:pt-6">
            <div className="flex items-center justify-between mb-6">
              <h2 style={{ fontFamily: "var(--font-serif)" }}>Log a Smoke</h2>
              <button type="button" onClick={onClose} className="btn btn-ghost p-2 -mr-2" aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="smoke-date" className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
                  Date Smoked
                </label>
                <input
                  id="smoke-date"
                  type="date"
                  className="input"
                  value={smokedAt}
                  max={today}
                  onChange={(e) => setSmokedAt(e.target.value)}
                />
              </div>
              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
                  Overall Rating
                </p>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setRating((r) => Math.max(1, r - 1))}
                    className="btn btn-secondary w-10 h-10 p-0 flex items-center justify-center flex-shrink-0 text-xl leading-none"
                  >
                    −
                  </button>
                  <span
                    className="text-4xl font-bold w-12 text-center"
                    style={{ fontFamily: "var(--font-serif)", color: "var(--primary)" }}
                  >
                    {rating}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRating((r) => Math.min(10, r + 1))}
                    className="btn btn-secondary w-10 h-10 p-0 flex items-center justify-center flex-shrink-0 text-xl leading-none"
                  >
                    +
                  </button>
                  <span className="text-sm text-muted-foreground">/ 10</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="smoke-review" className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
                  Notes <span className="normal-case tracking-normal font-normal">(optional)</span>
                </label>
                <textarea
                  id="smoke-review"
                  className="input resize-none"
                  placeholder="Tasting notes, occasion, pairing…"
                  rows={3}
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
                {submitting ? "Logging…" : "Log Smoke"}
              </button>
            </form>
          </div>
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
  hasPending  = false,
  hasApproved = false,
}: {
  item: HumidorItemDetail;
  initialSmokeLogs: SmokeLog[];
  hasPending?:  boolean;
  hasApproved?: boolean;
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
  const [sharingLogId,  setSharingLogId]  = useState<string | null>(null);
  const [sharedLogIds,  setSharedLogIds]  = useState<Set<string>>(new Set());

  /* UI state */
  const [qtyLoading, setQtyLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [smokeOpen, setSmokeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const c = item.cigar;
  const days = agingDays(item.aging_start_date);
  const agingProgress = Math.min(days / 180, 1) * 100;

  /* ── Quantity stepper ─────────────────────────────────────── */

  async function updateQuantity(next: number) {
    if (next < 0 || qtyLoading) return;
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
    }
  }

  /* ── Smoke One ────────────────────────────────────────────── */

  async function handleSmoked(draft: SmokeLog) {
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

    /* Decrement quantity (optimistic) */
    if (quantity > 0) {
      await updateQuantity(quantity - 1);
    }
  }

  /* ── Edit saved ───────────────────────────────────────────── */

  function handleSaved(updated: Partial<typeof itemFields>) {
    setItemFields((prev) => ({ ...prev, ...updated }));
    setToast("Details saved.");
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

    router.push("/humidor");
  }

  /* ── Share smoke log to Lounge ───────────────────────────────── */

  async function handleShareToLounge(log: SmokeLog) {
    if (sharingLogId || sharedLogIds.has(log.id)) return;
    setSharingLogId(log.id);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSharingLogId(null); return; }

    const { data: category } = await supabase
      .from("forum_categories")
      .select("id")
      .eq("slug", "burn-reports")
      .single();

    if (!category) { setSharingLogId(null); setToast("Could not find Burn Reports category."); return; }

    const cigarLabel = [c.brand, c.series ?? c.format].filter(Boolean).join(" ");
    const title      = `${cigarLabel} — ${log.overall_rating ?? "N/A"}`;
    const content    = log.review_text?.trim() || `Rating: ${log.overall_rating ?? "N/A"}`;

    const { error } = await supabase.from("forum_posts").insert({
      user_id:      user.id,
      category_id:  category.id,
      title,
      content,
      smoke_log_id: log.id,
    });

    setSharingLogId(null);
    if (error) { setToast("Failed to share."); return; }
    setSharedLogIds((prev) => new Set([...prev, log.id]));
    setToast("Shared to Lounge!");
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
          <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-muted flex items-center justify-center">
            <img src={getCigarImage(c.image_url, c.wrapper)} alt={c.series ?? c.format ?? ""} className="w-full h-full object-contain" />
          </div>
          <CigarPhotoSubmitButton
            cigarId={item.cigar_id}
            cigarName={[c.brand, c.series ?? c.format].filter(Boolean).join(" ")}
            hasPending={hasPending}
            hasApproved={hasApproved}
          />
        </div>

        {/* Info */}
        <div className="flex flex-col gap-2 flex-1 min-w-0 pt-1">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            {c.brand}
          </p>
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

        {/* Notes */}
        {item.notes && (
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">Notes</p>
            <p className="text-sm text-foreground leading-relaxed">{item.notes}</p>
          </div>
        )}
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
            sub={avgPersonalRating ? "/ 10" : undefined}
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
              const isSharing = sharingLogId === log.id;
              const isShared  = sharedLogIds.has(log.id);
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

                  {/* Share to Lounge — only shown when expanded */}
                  {expanded && (
                    <div
                      className="mt-3 pt-3 flex items-center justify-between gap-3"
                      style={{ borderTop: "1px solid var(--border)" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {log.content_video ? (
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
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        onClick={() => handleShareToLounge(log)}
                        disabled={isSharing || isShared}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5"
                        style={{
                          border:      `1.5px solid ${isShared ? "var(--border)" : "var(--gold, #D4A04A)"}`,
                          color:       isShared ? "var(--muted-foreground)" : "var(--gold, #D4A04A)",
                          background:  "transparent",
                          cursor:      isSharing || isShared ? "default" : "pointer",
                          touchAction: "manipulation",
                          WebkitTapHighlightColor: "transparent",
                        }}
                      >
                        {isShared ? "Shared to Lounge" : isSharing ? "Sharing..." : "Share to Lounge"}
                      </button>
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

      <SmokeModal
        isOpen={smokeOpen}
        onClose={() => setSmokeOpen(false)}
        onSmoked={handleSmoked}
      />

      {deleteOpen && (
        <DeleteDialog
          onConfirm={handleDelete}
          onCancel={() => setDeleteOpen(false)}
          loading={deleteLoading}
        />
      )}
    </div>
  );
}
