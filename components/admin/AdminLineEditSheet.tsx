"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";

/* ------------------------------------------------------------------
   AdminLineEditSheet — direct admin edit of a cigar line's identity
   (brand, series). Blend and size fields are per-vitola
   (AdminSizeEditSheet). Saves via PATCH /api/admin/catalog-lines/[id];
   the DB trigger fans brand/series out to every size row.

   Renaming onto an existing line returns 409 line_exists with the
   target's summary — the sheet then offers a MERGE (repoint this
   line's sizes into the target; ids never change).
   ------------------------------------------------------------------ */

interface Props {
  lineId:  string;
  /* Line-shared identity fields as currently displayed (from the
     tapped child's copies). */
  current: { brand: string | null; series: string | null };
  open:    boolean;
  onClose: () => void;
  onSaved: (kind: "saved" | "merged") => void;
}

interface MergeTarget {
  id: string; brand: string; series: string | null; sizeCount: number;
}

const labelCls   = "block text-xs font-medium mb-1.5";
const labelStyle = { color: "var(--muted-foreground)" } as const;
const inputStyle = { minHeight: 48 } as const;

export function AdminLineEditSheet({ lineId, current, open, onClose, onSaved }: Props) {
  const [brand,  setBrand]  = useState(current.brand ?? "");
  const [series, setSeries] = useState(current.series ?? "");
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<MergeTarget | null>(null);

  useEffect(() => {
    if (!open) return;
    /* Reset-on-open, same pattern as the add sheets. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBrand(current.brand ?? "");
    setSeries(current.series ?? "");
    setBusy(false);
    setError(null);
    setMergeTarget(null);
  }, [open, current]);

  async function save(merge: boolean) {
    if (!brand.trim()) {
      setError("Brand is required.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/catalog-lines/${lineId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand:  brand.trim(),
        series: series.trim() || null,
        ...(merge ? { merge: true } : {}),
      }),
    });
    setBusy(false);
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      onSaved(body.merged ? "merged" : "saved");
      onClose();
      return;
    }
    const body = await res.json().catch(() => ({}));
    if (res.status === 409 && body.code === "line_exists" && body.target) {
      setMergeTarget(body.target as MergeTarget);
    } else {
      setError(body.error ?? "Save failed.");
    }
  }

  const headerSlot = (
    <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
      <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: "var(--font-serif)" }}>
        Edit Line
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
      ariaLabel="Edit cigar line"
      header={headerSlot}
      surface="background"
      desktopMaxWidth={560}
      desktopHeight="80dvh"
    >
      <div className="px-5 pt-5 pb-8 space-y-4">
        <div>
          <label className={labelCls} style={labelStyle}>
            Brand <span style={{ color: "var(--destructive)" }}>*</span>
          </label>
          <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)}
            className="input w-full text-sm" style={inputStyle} />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>Series</label>
          <input type="text" value={series} onChange={(e) => setSeries(e.target.value)}
            className="input w-full text-sm" style={inputStyle} />
        </div>
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Applies to every vitola in this line. Blend is edited per vitola.
        </p>

        {error && (
          <p className="text-sm" style={{ color: "var(--destructive)" }}>{error}</p>
        )}

        {mergeTarget ? (
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ backgroundColor: "var(--card)", border: "1px solid rgba(212,160,74,0.35)" }}
          >
            <p className="text-sm text-foreground">
              <span className="font-semibold">
                {[mergeTarget.brand, mergeTarget.series].filter(Boolean).join(" ")}
              </span>{" "}
              already exists with {mergeTarget.sizeCount} size{mergeTarget.sizeCount !== 1 ? "s" : ""}.
              Move this line&apos;s sizes into it? Nothing is deleted from anyone&apos;s humidor.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => save(true)}
                disabled={busy}
                className="btn btn-primary flex-1 disabled:opacity-40"
                style={{ minHeight: 44 }}
              >
                {busy ? "Merging…" : "Merge into existing"}
              </button>
              <button
                type="button"
                onClick={() => setMergeTarget(null)}
                disabled={busy}
                className="btn btn-secondary flex-1 disabled:opacity-40"
                style={{ minHeight: 44 }}
              >
                Keep separate
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => save(false)}
            disabled={busy}
            className="btn btn-primary w-full disabled:opacity-40"
            style={{ minHeight: 48 }}
          >
            {busy ? "Saving…" : "Save line"}
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
