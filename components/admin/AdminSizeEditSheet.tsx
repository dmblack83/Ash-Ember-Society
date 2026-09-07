"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FORMATS, LENGTHS, RING_GAUGES } from "@/lib/cigar-taxonomy";
import { sizeLabel, type SizeChild } from "@/lib/cigars/line-group";

/* ------------------------------------------------------------------
   AdminSizeEditSheet — direct admin edit of one size row (vitola):
   format / ring gauge / length, plus delete. Saves via
   PATCH/DELETE /api/admin/catalog-sizes/[id]. The raw current
   format is shown above the select because polluted seed values
   ("King T Tubos (Churchill)") aren't in the canonical FORMATS list.
   ------------------------------------------------------------------ */

interface Props {
  child:   SizeChild;
  open:    boolean;
  onClose: () => void;
  /* Fired after a successful save or delete; parent revalidates. */
  onSaved: (kind: "saved" | "deleted") => void;
}

const labelCls   = "block text-xs font-medium mb-1.5";
const labelStyle = { color: "var(--muted-foreground)" } as const;
const inputStyle = { minHeight: 48 } as const;

export function AdminSizeEditSheet({ child, open, onClose, onSaved }: Props) {
  const [name,       setName]       = useState("");
  const [format,     setFormat]     = useState("");
  const [ringGauge,  setRingGauge]  = useState("");
  const [lengthStr,  setLengthStr]  = useState("");
  const [busy,       setBusy]       = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  /* Seed from the child on open. A polluted format that isn't in
     FORMATS can't be represented by the select — it starts empty and
     the raw value is shown as a caption. */
  useEffect(() => {
    if (!open) return;
    /* Reset-on-open, same pattern as the add sheets. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(child.name ?? "");
    setFormat(child.format && FORMATS.includes(child.format) ? child.format : "");
    setRingGauge(child.ring_gauge != null ? String(child.ring_gauge) : "");
    setLengthStr(child.length_inches != null ? String(child.length_inches) : "");
    setBusy(false);
    setConfirmDel(false);
    setError(null);
  }, [open, child]);

  const rawFormatShown = child.format && !FORMATS.includes(child.format);

  async function handleSave() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/catalog-sizes/${child.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:          name.trim() || null,
        format:        format || null,
        ring_gauge:    ringGauge ? Number(ringGauge)  : null,
        length_inches: lengthStr ? Number(lengthStr)  : null,
      }),
    });
    setBusy(false);
    if (res.ok) {
      onSaved("saved");
      onClose();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Save failed.");
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
        Edit Size
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
      ariaLabel="Edit size"
      header={headerSlot}
      surface="background"
      mobileHeight="72dvh"
      desktopMaxWidth={480}
    >
      <div className="px-5 pt-5 pb-8 space-y-4">
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Current: {sizeLabel(child)}
        </p>

        <div>
          <label className={labelCls} style={labelStyle}>Vitola Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='e.g. King B (optional)'
            className="input w-full text-sm"
            style={inputStyle}
          />
        </div>

        <div>
          <label className={labelCls} style={labelStyle}>Format</label>
          {rawFormatShown && (
            <p className="text-xs mb-1.5" style={{ color: "var(--gold, #D4A04A)" }}>
              Raw value: &ldquo;{child.format}&rdquo; (not a standard format; pick the clean one)
            </p>
          )}
          <select value={format} onChange={(e) => setFormat(e.target.value)} className="input w-full text-sm" style={inputStyle}>
            <option value="">Not set</option>
            {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} style={labelStyle}>Ring Gauge</label>
            <select value={ringGauge} onChange={(e) => setRingGauge(e.target.value)} className="input w-full text-sm" style={inputStyle}>
              <option value="">Not set</option>
              {RING_GAUGES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>Length</label>
            <select value={lengthStr} onChange={(e) => setLengthStr(e.target.value)} className="input w-full text-sm" style={inputStyle}>
              <option value="">Not set</option>
              {LENGTHS.map((l) => <option key={l.inches} value={l.inches}>{l.label}</option>)}
            </select>
          </div>
        </div>

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
          {busy ? "Saving…" : "Save size"}
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
