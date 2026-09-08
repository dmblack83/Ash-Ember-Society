"use client";

import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import { createClient } from "@/utils/supabase/client";
import { keyFor } from "@/lib/data/keys";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { UpgradeLimitModal } from "@/components/membership/UpgradeLimitModal";
import { CigarDetailFields } from "@/components/cigars/CigarDetailFields";
import { CigarTitle } from "@/components/cigars/CigarTitle";
import { DupeCheckDialog } from "@/components/cigars/DupeCheckDialog";
import { useHumidors } from "@/components/humidor/useHumidors";
import { ensureDefaultHumidor } from "@/lib/data/humidors";
import { addHumidorItem, HumidorLimitError } from "@/lib/humidor/add-item";
import { friendlyWriteError } from "@/lib/data/humidor-move";
import { revalidateHumidor } from "@/lib/data/humidor-cache";
import { loadCigarDraft, saveCigarDraft, clearCigarDraft } from "@/lib/cigars/cigar-draft";
import {
  type CigarDetails,
  EMPTY_CIGAR_DETAILS,
  cigarDetailsToRpcArgs,
} from "@/lib/cigars/cigar-details";
import {
  matchCigarLines,
  insertCigarToCatalog,
  fetchLineSiblings,
  fetchCigarDetail,
  type LineMatch,
} from "@/lib/data/cigar-fetchers";
import {
  findMatchingSize,
  sizeDims,
  type SizeChild,
  type CatalogLine,
  type CigarNameParts,
} from "@/lib/cigars/line-group";
import {
  emptySaveForm,
  type SaveFormState,
} from "@/lib/cigars/add-flow-state";
import { LineSearchPanel } from "./LineSearchPanel";
import { VitolaPickerPanel } from "./VitolaPickerPanel";
import { SaveStep } from "./SaveStep";
import {
  stageForEntry,
  type AddFlowEntry,
  type AddFlowStage,
} from "@/lib/cigars/add-flow-entry";

export { stageForEntry };
export type { AddFlowEntry, AddFlowStage };

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

export interface AddFlowSheetProps {
  open:             boolean;
  entry:            AddFlowEntry;
  mode:             "humidor" | "wishlist";
  onClose:          () => void;
  /* message = a specific outcome to toast; undefined = caller uses its
     own default. */
  onAdded:          (message?: string) => void;
  /* Humidor to preselect in the picker. Pass the currently-filtered
     humidor id, or null/omit to fall back to the user's default. */
  defaultHumidorId?: string | null;
}

interface ExistingItem {
  id:       string;
  quantity: number;
}

/* A resolved cigar carries everything the save-step card needs.
   "child" = we already have the SizeChild + its line's brand/series
   in hand (picker confirm, or a single-vitola/ungrouped line resolved
   directly from search) — no extra fetch. "id" = we only have a
   cigarId (entry.kind "vitola", or an ungrouped-fallback line whose
   `repId` IS the flat cigar row) — the card fetches via SWR. */
type ResolvedCigar =
  | { kind: "child"; cigarId: string; brand: string | null; series: string | null; child: SizeChild }
  | { kind: "id"; cigarId: string };

type StashedLine = { brand: string | null; series: string | null; fromScan?: boolean };

/* ------------------------------------------------------------------
   Scroll caret chevron — duplicated per-sheet per existing convention
   (AddCigarSheet's Caret, WishlistClient's WishlistCaret).
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
   Resolved-cigar card — brand caps + CigarTitle + sizeDims meta +
   Change (hidden when there's no prior stage to return to).
   ------------------------------------------------------------------ */

function CardShell({
  brand, nameParts, meta, showChange, onChange,
}: {
  brand:      string | null;
  nameParts:  CigarNameParts;
  meta:       string;
  showChange: boolean;
  onChange:   () => void;
}) {
  return (
    <div
      className="rounded-2xl p-4 animate-fade-in"
      style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {brand && (
            <p
              className="text-[11px] font-bold tracking-widest uppercase mb-1"
              style={{ color: "var(--primary)" }}
            >
              {brand}
            </p>
          )}
          <p
            className="text-base font-semibold text-foreground leading-snug"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <CigarTitle cigar={nameParts} />
          </p>
          {meta && (
            <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
              {meta}
            </p>
          )}
        </div>
        {showChange && (
          <button
            onClick={onChange}
            className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0 transition-colors"
            style={{ color: "var(--muted-foreground)", backgroundColor: "var(--muted)" }}
          >
            Change
          </button>
        )}
      </div>
    </div>
  );
}

function ResolvedCardFromChild({
  resolved, showChange, onChange,
}: {
  resolved:   Extract<ResolvedCigar, { kind: "child" }>;
  showChange: boolean;
  onChange:   () => void;
}) {
  const meta = [resolved.child.format, sizeDims(resolved.child)].filter(Boolean).join(" · ");
  return (
    <CardShell
      brand={resolved.brand}
      nameParts={{ series: resolved.series, name: resolved.child.name, format: resolved.child.format }}
      meta={meta}
      showChange={showChange}
      onChange={onChange}
    />
  );
}

function ResolvedCardFromId({
  cigarId, showChange, onChange,
}: {
  cigarId:    string;
  showChange: boolean;
  onChange:   () => void;
}) {
  const { data: cigar, error } = useSWR(keyFor.cigar(cigarId), () => fetchCigarDetail(cigarId));

  if (error || cigar === null) {
    return (
      <p className="text-sm text-center" style={{ color: "var(--destructive)" }}>
        Couldn&apos;t load this cigar.
      </p>
    );
  }
  if (cigar === undefined) {
    return (
      <div
        className="rounded-2xl animate-pulse"
        style={{ height: 84, backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
        aria-hidden="true"
      />
    );
  }

  const meta = [cigar.format, sizeDims(cigar)].filter(Boolean).join(" · ");
  return (
    <CardShell brand={cigar.brand} nameParts={cigar} meta={meta} showChange={showChange} onChange={onChange} />
  );
}

function ResolvedCigarCard({
  resolved, showChange, onChange,
}: {
  resolved:   ResolvedCigar;
  showChange: boolean;
  onChange:   () => void;
}) {
  if (resolved.kind === "child") {
    return <ResolvedCardFromChild resolved={resolved} showChange={showChange} onChange={onChange} />;
  }
  return <ResolvedCardFromId cigarId={resolved.cigarId} showChange={showChange} onChange={onChange} />;
}

/* ------------------------------------------------------------------
   AddFlowSheet
   ------------------------------------------------------------------ */

export function AddFlowSheet({
  open, entry, mode, onClose, onAdded, defaultHumidorId = null,
}: AddFlowSheetProps) {
  const today = new Date().toISOString().split("T")[0];

  /* Explicit close = user abandoning the entry — discard the draft so
     it doesn't resurface on the next open. */
  const handleClose = () => {
    clearCigarDraft(mode);
    onClose();
  };

  /* ── Stage + resolution state ─────────────────────────────────── */
  const [stage,       setStage]       = useState<AddFlowStage>(() => stageForEntry(entry));
  const [stashedLine, setStashedLine] = useState<StashedLine | null>(null);
  /* Where "Change" on the save card returns to: the picker (came via
     a multi-vitola line), search (resolved directly), or null (entry
     kind "vitola" — no prior stage, Change is hidden). */
  const [priorStage,  setPriorStage]  = useState<"search" | "picker" | null>(null);
  const [resolved,    setResolved]    = useState<ResolvedCigar | null>(null);
  const [manual,      setManual]      = useState<CigarDetails>(EMPTY_CIGAR_DETAILS);
  const [form,        setForm]        = useState<SaveFormState>(() => emptySaveForm(today));

  /* ── Humidor picker state ─────────────────────────────────────── */
  const [userId,          setUserId]          = useState<string | null>(null);
  const [pickedHumidorId, setPickedHumidorId]  = useState<string | null>(null);
  const { humidors } = useHumidors(userId);

  /* ── Submit state ─────────────────────────────────────────────── */
  const [submitting,    setSubmitting]    = useState(false);
  const [submitError,   setSubmitError]   = useState<string | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [dupe, setDupe] = useState<{ match: LineMatch; matchedChild: SizeChild | null } | null>(null);

  /* ── Already-in-humidor conflict state (humidor mode only) ───────
     Checked whenever the sheet resolves a concrete catalog cigarId in
     "save" — regardless of which stage led there, so search, picker,
     and direct-vitola entries all get the same conflict handling that
     used to live only in AddToHumidorSheet. */
  const [existingItems,    setExistingItems]    = useState<ExistingItem[]>([]);
  const [showConflict,     setShowConflict]     = useState(false);
  const [checkingExisting, setCheckingExisting] = useState(false);

  /* ── Layout state ─────────────────────────────────────────────── */
  const [showTopCaret,    setShowTopCaret]    = useState(false);
  const [showBottomCaret, setShowBottomCaret] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  /* ── Reset on open ────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    setStage(stageForEntry(entry));
    setStashedLine(entry.kind === "line" ? { brand: entry.brand, series: entry.series, fromScan: entry.fromScan } : null);
    setPriorStage(null);
    setResolved(entry.kind === "vitola" ? { kind: "id", cigarId: entry.cigarId } : null);
    setManual(entry.kind === "manual" ? { ...EMPTY_CIGAR_DETAILS, brand: entry.brand ?? "" } : EMPTY_CIGAR_DETAILS);
    setForm(emptySaveForm(today));
    setSubmitting(false);
    setSubmitError(null);
    setShowLimitModal(false);
    setDupe(null);
    setExistingItems([]);
    setShowConflict(false);
    setCheckingExisting(false);
    setPickedHumidorId(defaultHumidorId ?? null);

    /* Restore an in-flight manual draft — mirrors AddCigarSheet's iOS
       PWA eviction recovery, but only for the "search" entry point
       (today's only entry point for that sheet). Other entry points
       (a direct vitola/line/manual open) never get hijacked by a
       stale draft from an unrelated earlier attempt. */
    if (entry.kind === "search") {
      const draft = loadCigarDraft(mode);
      if (draft) {
        setStage("manual");
        setManual(draft);
      }
    }

    async function loadUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    }
    loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, defaultHumidorId]);

  /* Mirror the manual draft to localStorage as the user types.
     saveCigarDraft self-clears when every field is empty. */
  useEffect(() => {
    if (!open || stage !== "manual") return;
    saveCigarDraft(mode, manual);
  }, [open, stage, mode, manual]);

  /* Fall back to the user's default humidor once the list loads, but
     only when no defaultHumidorId was supplied and nothing's picked
     yet. */
  useEffect(() => {
    if (!open || pickedHumidorId || !humidors || humidors.length === 0) return;
    const fallback = humidors.find((h) => h.is_default) ?? humidors[0];
    setPickedHumidorId(fallback.id);
  }, [open, humidors, pickedHumidorId]);

  /* Already-in-humidor conflict check — fires whenever a concrete
     catalog cigarId resolves in humidor mode. Manual inserts never
     set `resolved`, so they never reach this (matches AddCigarSheet's
     manual path today: no conflict handling for brand-new/matched
     catalog rows created through the dupe-check interstitial). */
  const resolvedCigarId = resolved?.cigarId ?? null;
  useEffect(() => {
    if (!open || mode !== "humidor" || !resolvedCigarId) {
      setExistingItems([]);
      setShowConflict(false);
      setCheckingExisting(false);
      return;
    }
    let cancelled = false;
    setShowConflict(false);
    setCheckingExisting(true);
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setCheckingExisting(false); return; }
      const { data } = await supabase
        .from("humidor_items")
        .select("id, quantity")
        .eq("cigar_id", resolvedCigarId)
        .eq("user_id", user.id)
        .eq("is_wishlist", false);
      if (!cancelled) {
        setExistingItems(data ?? []);
        setCheckingExisting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, mode, resolvedCigarId]);

  /* ── Scroll caret tracking ────────────────────────────────────── */
  function updateCarets() {
    const el = bodyRef.current;
    if (!el) return;
    setShowTopCaret(el.scrollTop > 4);
    setShowBottomCaret(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }

  useEffect(() => {
    const id = requestAnimationFrame(updateCarets);
    return () => cancelAnimationFrame(id);
  }, [stage, open]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !open) return;
    el.addEventListener("scroll", updateCarets, { passive: true });
    return () => el.removeEventListener("scroll", updateCarets);
  }, [open]);

  /* ── Stage-transition handlers ────────────────────────────────── */

  /* fetchLineSiblings runs at most once here (only when the line
     claims a single vitola); a multi-vitola line is stashed and the
     picker does its own SWR-cached fetch — no double request. */
  async function handlePickLine(line: CatalogLine) {
    if (line.sizeCount === 0) {
      /* Ungrouped fallback (RPC missing): repId IS the flat cigar row. */
      setResolved({ kind: "id", cigarId: line.repId });
      setPriorStage("search");
      setStage("save");
      return;
    }
    if (line.sizeCount === 1) {
      const siblings = await fetchLineSiblings(line.brand as string, line.series).catch(() => [] as SizeChild[]);
      if (siblings.length === 1) {
        setResolved({ kind: "child", cigarId: siblings[0].id, brand: line.brand, series: line.series, child: siblings[0] });
        setPriorStage("search");
        setStage("save");
        return;
      }
    }
    setStashedLine({ brand: line.brand, series: line.series, fromScan: false });
    setStage("picker");
  }

  function handleConfirmFromPicker(child: SizeChild) {
    if (!stashedLine) return;
    setResolved({ kind: "child", cigarId: child.id, brand: stashedLine.brand, series: stashedLine.series, child });
    setPriorStage("picker");
    setStage("save");
  }

  function handlePickerChangeToSearch() {
    setStashedLine(null);
    setStage("search");
  }

  function handleChangeFromSave() {
    if (priorStage === "picker") { setStage("picker"); return; }
    if (priorStage === "search") { setStage("search"); return; }
  }

  function handleManualBackToSearch() {
    setStage("search");
  }

  /* ── Submit: humidor insert (ported from AddCigarSheet.finishInsert) ── */
  async function finishHumidorInsert(
    cigarId: string,
    opts: { bumpUsage?: { id: string; usage_count: number } | null; message?: string },
  ) {
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSubmitError("Not authenticated."); return; }

      const priceCents = form.priceStr ? Math.round(parseFloat(form.priceStr) * 100) : null;
      try {
        const humidorId = pickedHumidorId ?? (await ensureDefaultHumidor(user.id)).id;
        await addHumidorItem(supabase, {
          user_id:           user.id,
          cigar_id:          cigarId,
          quantity:          form.quantity,
          purchase_date:     form.purchaseDate     || null,
          price_paid_cents:  isNaN(priceCents ?? NaN) ? null : priceCents,
          source:            form.source.trim()    || null,
          aging_start_date:  form.agingStart       || null,
          aging_target_date: form.agingTarget      || null,
          notes:             form.notes.trim()     || null,
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

      clearCigarDraft(mode);
      onAdded(opts.message);
      onClose();
    } catch (err) {
      console.error("AddFlowSheet submit error:", err);
      setSubmitError("Something went wrong. Please try again.");
    }
  }

  /* ── Submit: wishlist insert (ported from WishlistClient.finishWishlistInsert) ── */
  async function finishWishlistInsert(
    cigarId: string,
    opts: { bumpUsage?: { id: string; usage_count: number } | null; message?: string },
  ) {
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSubmitError("Not authenticated."); return; }

      const { error: insertErr } = await supabase.from("humidor_items").insert({
        user_id:     user.id,
        cigar_id:    cigarId,
        quantity:    1,
        notes:       form.notes.trim() || null,
        is_wishlist: true,
      });

      if (insertErr) { setSubmitError(insertErr.message); return; }

      if (opts.bumpUsage) {
        await supabase
          .from("cigar_catalog")
          .update({ usage_count: opts.bumpUsage.usage_count + 1 })
          .eq("id", opts.bumpUsage.id);
      }

      clearCigarDraft(mode);
      onAdded(opts.message);
      onClose();
    } catch (err) {
      console.error("AddFlowSheet submit error:", err);
      setSubmitError("Something went wrong. Please try again.");
    }
  }

  async function finishInsert(
    cigarId: string,
    opts: { bumpUsage?: { id: string; usage_count: number } | null; message?: string },
  ) {
    if (mode === "wishlist") { await finishWishlistInsert(cigarId, opts); return; }
    await finishHumidorInsert(cigarId, opts);
  }

  /* Insert RPC + finish. Passing explicit brand/series lets the "add
     my size to this line" dupe-check path use the MATCHED LINE's
     exact strings (typo never enters the catalog). */
  async function createListingAndFinish(brand: string, series: string | null, message?: string) {
    const args = { ...cigarDetailsToRpcArgs(manual), p_brand: brand, p_series: series };
    let cigarId: string;
    try {
      cigarId = await insertCigarToCatalog(args);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to save cigar to catalog.");
      return;
    }
    await finishInsert(cigarId, { message });
  }

  /* Manual-path submit: fuzzy-match BEFORE any insert (dupe-check
     interstitial), then insert. Ported from AddCigarSheet.handleSubmit
     manual branch. No bumpUsage — a brand-new/matched catalog row has
     no prior usage_count in hand. */
  async function handleManualSubmit() {
    const brand = manual.brand.trim();
    if (!brand) { setSubmitError("Brand is required."); return; }
    if (!manual.name.trim()) { setSubmitError("Vitola name is required."); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
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
      console.error("AddFlowSheet submit error:", err);
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  /* Insert the resolved catalog cigar as a brand-new humidor/wishlist
     entry. No usage_count is available from any resolution path today
     (lines and siblings don't carry it), so bumpUsage stays unset —
     the mechanism is preserved for a future caller that has one. */
  async function insertResolvedCigar() {
    if (!resolved) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await finishInsert(resolved.cigarId, {});
    } finally {
      setSubmitting(false);
    }
  }

  /* Save-stage submit: show the conflict panel once (per resolution)
     before allowing an insert, exactly like AddToHumidorSheet. */
  async function handleSaveSubmit() {
    if (!resolved) return;
    if (mode === "humidor" && existingItems.length > 0 && !showConflict) {
      setShowConflict(true);
      return;
    }
    await insertResolvedCigar();
  }

  /* Conflict action: bump the first existing entry's quantity. Ported
     verbatim from AddToHumidorSheet.addToExisting. */
  async function handleAddToExisting() {
    if (existingItems.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("humidor_items")
      .update({ quantity: existingItems[0].quantity + form.quantity })
      .eq("id", existingItems[0].id);

    if (updateError) {
      setSubmitting(false);
      setSubmitError(friendlyWriteError(updateError));
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) void revalidateHumidor(user.id);

    setSubmitting(false);
    clearCigarDraft(mode);
    onAdded();
    onClose();
  }

  const ctaLabel = mode === "wishlist"
    ? "Add to Wishlist"
    : `Add ${form.quantity > 1 ? `${form.quantity} ` : ""}to Humidor`;

  const dupeTarget = mode === "wishlist" ? "wishlist" : "humidor";

  /* ── Render ───────────────────────────────────────────────────── */
  const headerSlot = (
    <>
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

      {open && stage === "search" && (
        <div
          className="px-5 py-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <LineSearchPanel
            initialQuery={entry.kind === "search" ? (entry.query ?? "") : ""}
            onPickLine={handlePickLine}
            onManual={() => setStage("manual")}
            autoFocus
          />
        </div>
      )}
    </>
  );

  const bodySlot = (
    <>
      {stage === "picker" && (
        <div className="px-5 pt-5 pb-8">
          <VitolaPickerPanel
            brand={stashedLine?.brand ?? null}
            series={stashedLine?.series ?? null}
            fromScan={stashedLine?.fromScan}
            onChange={handlePickerChangeToSearch}
            onConfirm={handleConfirmFromPicker}
          />
        </div>
      )}

      {stage === "manual" && (
        <div className="px-5 pt-5 pb-8 space-y-5">
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Cigar Details</h3>
              <button
                onClick={handleManualBackToSearch}
                className="text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                Back to search
              </button>
            </div>

            <CigarDetailFields value={manual} onChange={setManual} nameRequired />

            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              New cigars join the community catalog after a quick review.
            </p>
          </div>

          <SaveStep
            mode={mode}
            form={form}
            onForm={setForm}
            humidors={humidors}
            pickedHumidorId={pickedHumidorId}
            onPickHumidor={setPickedHumidorId}
            submitting={submitting}
            submitError={submitError}
            ctaLabel={ctaLabel}
            onSubmit={handleManualSubmit}
          />
        </div>
      )}

      {stage === "save" && resolved && (
        <div className="px-5 pt-5 pb-8 space-y-5">
          <ResolvedCigarCard
            resolved={resolved}
            showChange={priorStage !== null}
            onChange={handleChangeFromSave}
          />

          {mode === "humidor" && showConflict ? (
            <div className="space-y-4 pt-5" style={{ borderTop: "1px solid var(--border)" }}>
              <h3 className="text-sm font-semibold text-foreground">Already in Humidor</h3>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
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
                  onClick={handleAddToExisting}
                  disabled={submitting}
                >
                  <span className={submitting ? "opacity-60" : undefined}>
                    {`Add ${form.quantity} to existing (${existingItems[0]?.quantity ?? 0} → ${(existingItems[0]?.quantity ?? 0) + form.quantity})`}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary w-full"
                  onClick={insertResolvedCigar}
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
              {submitError && (
                <p className="text-sm text-destructive">{submitError}</p>
              )}
            </div>
          ) : mode === "humidor" && checkingExisting ? (
            <div
              className="rounded-xl animate-pulse"
              style={{ height: 52, backgroundColor: "var(--muted)", marginTop: 20 }}
              aria-hidden="true"
            />
          ) : (
            <SaveStep
              mode={mode}
              form={form}
              onForm={setForm}
              humidors={humidors}
              pickedHumidorId={pickedHumidorId}
              onPickHumidor={setPickedHumidorId}
              submitting={submitting}
              submitError={submitError}
              ctaLabel={ctaLabel}
              onSubmit={handleSaveSubmit}
            />
          )}
        </div>
      )}
    </>
  );

  const caretOverlay = (
    <>
      {showTopCaret && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 44,
            background: "linear-gradient(to bottom, var(--background) 30%, transparent)",
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            paddingTop: 8, pointerEvents: "none",
          }}
        >
          <Caret dir="up" />
        </div>
      )}
      {showBottomCaret && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: 44,
            background: "linear-gradient(to top, var(--background) 30%, transparent)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
            paddingBottom: 8, pointerEvents: "none",
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
           listener must cancel the DIALOG, not close the sheet and
           wipe the draft (sibling window listeners both fire —
           stopPropagation can't stop this). No-op while an insert is
           in flight. */
        onClose={dupe ? () => { if (!submitting) setDupe(null); } : handleClose}
        ariaLabel="Add cigar"
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
                message: `Added to your ${dupeTarget}. Linked to the existing catalog listing.`,
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
                `Added to your ${dupeTarget}. Your size joined the existing listing.`,
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
                `Added to your ${dupeTarget}. New catalog listing created, pending review.`,
              );
              setDupe(null);
            } finally { setSubmitting(false); }
          }}
        />
      )}
    </>
  );
}
