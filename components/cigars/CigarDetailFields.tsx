"use client";

import {
  SHADES,
  WRAPPERS,
  WRAPPER_COUNTRIES,
  FORMATS,
  LENGTHS,
  RING_GAUGES,
} from "@/lib/cigar-taxonomy";
import { type CigarDetails, toggleFiller } from "@/lib/cigars/cigar-details";

/* ------------------------------------------------------------------
   CigarDetailFields

   The shared 10-field detail grid used by both the manual "add cigar"
   sheets and the "update cigar" sheet. Controlled and presentational:
   it owns no submit logic and renders option names only (no taxonomy
   descriptions, per the design).
   ------------------------------------------------------------------ */

interface Props {
  value:    CigarDetails;
  onChange: (next: CigarDetails) => void;
}

const labelCls   = "block text-xs font-medium mb-1.5";
const labelStyle = { color: "var(--muted-foreground)" } as const;
const inputStyle = { minHeight: 48 } as const;

export function CigarDetailFields({ value, onChange }: Props) {
  const set = <K extends keyof CigarDetails>(key: K, v: CigarDetails[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Brand */}
      <div className="col-span-2">
        <label className={labelCls} style={labelStyle}>
          Brand <span style={{ color: "var(--destructive)" }}>*</span>
        </label>
        <input
          type="text"
          value={value.brand}
          onChange={(e) => set("brand", e.target.value)}
          placeholder="e.g. Arturo Fuente"
          className="input w-full text-sm"
          style={inputStyle}
        />
      </div>

      {/* Series / Name */}
      <div className="col-span-2">
        <label className={labelCls} style={labelStyle}>Series / Name</label>
        <input
          type="text"
          value={value.series}
          onChange={(e) => set("series", e.target.value)}
          placeholder="e.g. Opus X"
          className="input w-full text-sm"
          style={inputStyle}
        />
      </div>

      {/* Format */}
      <div>
        <label className={labelCls} style={labelStyle}>Format</label>
        <select
          value={value.format}
          onChange={(e) => set("format", e.target.value)}
          className="input w-full text-sm"
          style={inputStyle}
        >
          <option value="">Choose…</option>
          {FORMATS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      {/* Ring Gauge */}
      <div>
        <label className={labelCls} style={labelStyle}>Ring Gauge</label>
        <select
          value={value.ringGauge}
          onChange={(e) => set("ringGauge", e.target.value)}
          className="input w-full text-sm"
          style={inputStyle}
        >
          <option value="">Choose…</option>
          {RING_GAUGES.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      {/* Length */}
      <div>
        <label className={labelCls} style={labelStyle}>Length</label>
        <select
          value={value.lengthInches}
          onChange={(e) => set("lengthInches", e.target.value)}
          className="input w-full text-sm"
          style={inputStyle}
        >
          <option value="">Choose…</option>
          {LENGTHS.map((l) => (
            <option key={l.inches} value={l.inches}>{l.label}</option>
          ))}
        </select>
      </div>

      {/* Shade */}
      <div>
        <label className={labelCls} style={labelStyle}>Shade</label>
        <select
          value={value.shade}
          onChange={(e) => set("shade", e.target.value)}
          className="input w-full text-sm"
          style={inputStyle}
        >
          <option value="">Choose…</option>
          {SHADES.map((s) => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Wrapper */}
      <div className="col-span-2">
        <label className={labelCls} style={labelStyle}>Wrapper</label>
        <select
          value={value.wrapper}
          onChange={(e) => set("wrapper", e.target.value)}
          className="input w-full text-sm"
          style={inputStyle}
        >
          <option value="">Choose…</option>
          {WRAPPERS.map((w) => (
            <option key={w.name} value={w.name}>{w.name}</option>
          ))}
        </select>
      </div>

      {/* Wrapper Country */}
      <div className="col-span-2">
        <label className={labelCls} style={labelStyle}>Wrapper Country</label>
        <select
          value={value.wrapperCountry}
          onChange={(e) => set("wrapperCountry", e.target.value)}
          className="input w-full text-sm"
          style={inputStyle}
        >
          <option value="">Choose…</option>
          {WRAPPER_COUNTRIES.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Binder Country */}
      <div className="col-span-2">
        <label className={labelCls} style={labelStyle}>Binder Country</label>
        <select
          value={value.binderCountry}
          onChange={(e) => set("binderCountry", e.target.value)}
          className="input w-full text-sm"
          style={inputStyle}
        >
          <option value="">Choose…</option>
          {WRAPPER_COUNTRIES.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Filler Countries */}
      <div className="col-span-2">
        <label className={labelCls} style={labelStyle}>Filler Countries</label>
        <p className="text-xs mb-2" style={{ color: "rgba(166,144,128,0.7)" }}>
          Tap one or more.
        </p>
        <div className="flex flex-wrap gap-2">
          {WRAPPER_COUNTRIES.map((c) => {
            const active = value.fillerCountries.includes(c.name);
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => set("fillerCountries", toggleFiller(value.fillerCountries, c.name))}
                className="text-xs rounded-full"
                style={{
                  padding:    "6px 12px",
                  background: active ? "rgba(212,160,74,0.18)" : "transparent",
                  color:      active ? "var(--gold,#D4A04A)" : "var(--muted-foreground)",
                  border:     `1px solid ${active ? "var(--gold,#D4A04A)" : "var(--border)"}`,
                  cursor:     "pointer",
                }}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
