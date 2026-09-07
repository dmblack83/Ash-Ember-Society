"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FORMATS } from "@/lib/cigar-taxonomy";
import { CigarDetailFields } from "@/components/cigars/CigarDetailFields";
import {
  type CigarDetails,
  EMPTY_CIGAR_DETAILS,
  cigarDetailsFromCurrent,
  cigarDetailsToCatalogFields,
} from "@/lib/cigars/cigar-details";
import { sizeLabel, type SizeChild } from "@/lib/cigars/line-group";

/* ------------------------------------------------------------------
   AdminSizeEditSheet — full admin editor for one vitola (size row):
   name / format / ring gauge / length / blend, plus brand/series
   reassignment (moves this vitola to another line, resolve-or-create,
   identity only — the vitola keeps its own blend) and delete. Saves
   via PATCH/DELETE /api/admin/catalog-sizes/[id]. The raw current
   format is shown above the Format select because polluted seed
   values ("King T Tubos (Churchill)") aren't in the canonical
   FORMATS list.

   The merge section that consumes `siblings` and emits "merged"
   arrives in a follow-up task; the prop/callback signature is
   adopted now so that work builds on this without another rewrite.
   ------------------------------------------------------------------ */

interface Props {
  child:    SizeChild;
  line:     { brand: string | null; series: string | null };
  siblings: SizeChild[];
  open:     boolean;
  onClose:  () => void;
  /* Fired after a successful save, move, or delete; parent revalidates. */
  onSaved: (kind: "saved" | "moved" | "deleted" | "merged") => void;
}

export function AdminSizeEditSheet({ child, line, open, onClose, onSaved }: Props) {
  const [form,       setForm]       = useState<CigarDetails>(EMPTY_CIGAR_DETAILS);
  const [busy,       setBusy]       = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  /* Seed from the line + child on open. A polluted format that isn't
     in FORMATS can't be represented by the select — it starts empty
     and the raw value is shown as a caption. */
  useEffect(() => {
    if (!open) return;
    /* Reset-on-open, same pattern as the add sheets. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(cigarDetailsFromCurrent({
      brand:            line.brand,
      series:           line.series,
      name:             child.name ?? null,
      format:           child.format,
      ring_gauge:       child.ring_gauge,
      length_inches:    child.length_inches,
      shade:            child.shade ?? null,
      wrapper:          child.wrapper ?? null,
      wrapper_country:  child.wrapper_country ?? null,
      binder_country:   child.binder_country ?? null,
      filler_countries: child.filler_countries ?? null,
    }));
    setBusy(false);
    setConfirmDel(false);
    setError(null);
  }, [open, child, line]);

  const rawFormatShown = child.format && !FORMATS.includes(child.format);

  async function handleSave() {
    if (!form.brand.trim()) {
      setError("Brand is required.");
      return;
    }
    setBusy(true);
    setError(null);

    const fields = cigarDetailsToCatalogFields(form);
    const body: Record<string, unknown> = {
      name:             fields.name,
      format:           fields.format,
      ring_gauge:       fields.ring_gauge,
      length_inches:    fields.length_inches,
      shade:            fields.shade,
      wrapper:          fields.wrapper,
      wrapper_country:  fields.wrapper_country,
      binder_country:   fields.binder_country,
      filler_countries: fields.filler_countries,
    };
    const nextBrand  = form.brand.trim();
    const nextSeries = form.series.trim() || null;
    if (nextBrand !== (line.brand ?? "")) body.brand = nextBrand;
    if (nextSeries !== line.series) body.series = nextSeries;

    const res = await fetch(`/api/admin/catalog-sizes/${child.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) {
      const result = await res.json().catch(() => ({}));
      onSaved(result.movedLine ? "moved" : "saved");
      onClose();
    } else {
      const resBody = await res.json().catch(() => ({}));
      setError(resBody.error ?? "Save failed.");
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/catalog-sizes/${child.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      onSaved("deleted");
      onClose();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Delete failed.");
      setConfirmDel(false);
    }
  }

  const headerSlot = (
    <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
      <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: "var(--font-serif)" }}>
        Edit Vitola
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
  );

  return (
    <BottomSheet
      open={open}
      onClose={busy ? () => {} : onClose}
      ariaLabel="Edit vitola"
      header={headerSlot}
      surface="background"
      desktopMaxWidth={560}
      desktopHeight="80dvh"
    >
      <div className="px-5 pt-5 pb-8 space-y-4">
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Current: {sizeLabel(child)}
        </p>

        {rawFormatShown && (
          <p className="text-xs" style={{ color: "var(--gold, #D4A04A)" }}>
            Raw value: &ldquo;{child.format}&rdquo; (not a standard format; pick the clean one)
          </p>
        )}

        <CigarDetailFields value={form} onChange={setForm} />

        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Changing brand or series moves this vitola to that line.
        </p>

        {error && (
          <p className="text-sm" style={{ color: "var(--destructive)" }}>{error}</p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="btn btn-primary w-full disabled:opacity-40"
          style={{ minHeight: 48 }}
        >
          {busy ? "Saving…" : "Save vitola"}
        </button>

        {confirmDel ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ color: "#fff", background: "var(--destructive, #e5484d)" }}
          >
            Really delete this size?
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDel(true)}
            disabled={busy}
            className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ color: "var(--destructive, #e5484d)", border: "1px solid rgba(229,72,77,0.4)", background: "transparent" }}
          >
            Delete this size
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
