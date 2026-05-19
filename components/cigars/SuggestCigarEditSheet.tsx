"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import {
  SHADES,
  WRAPPERS,
  WRAPPER_COUNTRIES,
  FORMATS,
  LENGTHS,
  RING_GAUGES,
} from "@/lib/cigar-taxonomy";

/* ------------------------------------------------------------------
   SuggestCigarEditSheet

   Centered modal (same pattern as SubmitCigarPhotoSheet) that lets a
   user propose edits to a cigar_catalog row. Fields are pre-filled
   from the current cigar values; Submit POSTs only the diff so the
   admin sees exactly what was changed.

   Mirrors the Cigar Details section of AddCigarSheet but adds
   binder_country + filler_countries (which the Add form doesn't
   capture — yet the cigar view displays them, so users want to
   correct them).
   ------------------------------------------------------------------ */

export interface CurrentCigar {
  id:                string;
  brand:             string | null;
  series:            string | null;
  format:            string | null;
  ring_gauge:        number | null;
  length_inches:     number | null;
  shade:             string | null;
  wrapper:           string | null;
  wrapper_country:   string | null;
  binder_country:    string | null;
  filler_countries:  string[] | null;
}

interface Props {
  cigar:    CurrentCigar;
  onClose: () => void;
}

/* Form state — all strings (selects) except filler_countries (array). */
interface FormState {
  brand:             string;
  series:            string;
  format:            string;
  ring_gauge:        string;
  length_inches:     string;
  shade:             string;
  wrapper:           string;
  wrapper_country:   string;
  binder_country:    string;
  filler_countries:  string[];
}

function toFormState(c: CurrentCigar): FormState {
  return {
    brand:             c.brand   ?? "",
    series:            c.series  ?? "",
    format:            c.format  ?? "",
    ring_gauge:        c.ring_gauge    !== null ? String(c.ring_gauge)    : "",
    length_inches:     c.length_inches !== null ? String(c.length_inches) : "",
    shade:             c.shade           ?? "",
    wrapper:           c.wrapper         ?? "",
    wrapper_country:   c.wrapper_country ?? "",
    binder_country:    c.binder_country  ?? "",
    filler_countries:  c.filler_countries ?? [],
  };
}

/* Convert the form state to the JSONB shape stored in
   cigar_edit_suggestions. Strings become null when empty; numerics
   parse. Single-source for both current snapshot + suggested diff. */
function toJsonbShape(s: FormState): Record<string, unknown> {
  return {
    brand:             s.brand.trim()  || null,
    series:            s.series.trim() || null,
    format:            s.format        || null,
    ring_gauge:        s.ring_gauge    ? Number(s.ring_gauge)    : null,
    length_inches:     s.length_inches ? Number(s.length_inches) : null,
    shade:             s.shade           || null,
    wrapper:           s.wrapper         || null,
    wrapper_country:   s.wrapper_country || null,
    binder_country:    s.binder_country  || null,
    filler_countries:  s.filler_countries.length > 0 ? s.filler_countries : null,
  };
}

/* Field-by-field comparison. Arrays compared by content+order — the
   user explicitly orders the filler countries in the multi-select. */
function diffFields(
  current:   Record<string, unknown>,
  suggested: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(suggested)) {
    const a = current[k];
    const b = suggested[k];
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) out[k] = b;
    } else if (a !== b) {
      out[k] = b;
    }
  }
  return out;
}

export function SuggestCigarEditSheet({ cigar, onClose }: Props) {
  useEscapeKey(true, onClose);

  const [form,        setForm]       = useState<FormState>(() => toFormState(cigar));
  const [submitting,  setSubmitting] = useState(false);
  const [error,       setError]      = useState<string | null>(null);
  const [submitted,   setSubmitted]  = useState(false);

  function toggleFiller(country: string) {
    setForm((s) => {
      const has = s.filler_countries.includes(country);
      return {
        ...s,
        filler_countries: has
          ? s.filler_countries.filter((c) => c !== country)
          : [...s.filler_countries, country],
      };
    });
  }

  async function handleSubmit() {
    if (submitting) return;
    setError(null);

    const current   = toJsonbShape(toFormState(cigar));
    const suggested = toJsonbShape(form);
    const diff      = diffFields(current, suggested);

    if (Object.keys(diff).length === 0) {
      setError("No changes to submit.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/cigar-edit-suggestions", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        cigar_id:  cigar.id,
        current,
        suggested: diff,
      }),
    });
    setSubmitting(false);

    if (res.ok) {
      setSubmitted(true);
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Submission failed. Please try again.");
    }
  }

  const labelStyle: React.CSSProperties = {
    color:         "var(--muted-foreground)",
    fontSize:      11,
    fontWeight:    500,
    marginBottom:  6,
    display:       "block",
  };

  const modal = (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:        "fixed",
          inset:           0,
          zIndex:          9998,
          backgroundColor: "rgba(0,0,0,0.72)",
        }}
      />

      {/* Centered modal */}
      <div
        style={{
          position:        "fixed",
          top:             "50%",
          left:            "50%",
          transform:       "translate(-50%, -50%)",
          zIndex:          9999,
          width:           "calc(100% - 40px)",
          maxWidth:        520,
          maxHeight:       "90dvh",
          overflowY:       "auto",
          backgroundColor: "var(--card)",
          borderRadius:    20,
          border:          "1px solid var(--border)",
          padding:         "28px 24px 28px",
        }}
      >
        {submitted ? (
          /* ── Success ──────────────────────────────────────────── */
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div
              style={{
                width:          56,
                height:         56,
                borderRadius:   "50%",
                background:     "rgba(212,160,74,0.15)",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" stroke="var(--gold,#D4A04A)" strokeWidth="2.2"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>
                Edit suggestion submitted
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                We&apos;ll review and apply your changes if approved.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-8 py-2.5 rounded-xl text-sm font-semibold mt-2"
              style={{ background: "var(--gold,#D4A04A)", color: "#1A1210", border: "none", cursor: "pointer" }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2
                  className="text-base font-semibold mb-1"
                  style={{ fontFamily: "var(--font-serif)", color: "var(--foreground)" }}
                >
                  Suggest an Edit
                </h2>
                <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)", maxWidth: 360 }}>
                  Spot something wrong? Adjust the fields below and submit. Edits are reviewed before going live.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{
                  flexShrink:     0,
                  marginLeft:     12,
                  width:          32,
                  height:         32,
                  borderRadius:   "50%",
                  background:     "rgba(255,255,255,0.07)",
                  border:         "1px solid var(--border)",
                  color:          "var(--muted-foreground)",
                  cursor:         "pointer",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label style={labelStyle}>BRAND</label>
                  <input
                    type="text"
                    value={form.brand}
                    onChange={(e) => setForm((s) => ({ ...s, brand: e.target.value }))}
                    className="input w-full text-sm"
                    style={{ minHeight: 48 }}
                  />
                </div>

                <div className="col-span-2">
                  <label style={labelStyle}>SERIES / NAME</label>
                  <input
                    type="text"
                    value={form.series}
                    onChange={(e) => setForm((s) => ({ ...s, series: e.target.value }))}
                    className="input w-full text-sm"
                    style={{ minHeight: 48 }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>FORMAT</label>
                  <select
                    value={form.format}
                    onChange={(e) => setForm((s) => ({ ...s, format: e.target.value }))}
                    className="input w-full text-sm"
                    style={{ minHeight: 48 }}
                  >
                    <option value="">Choose…</option>
                    {FORMATS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>RING GAUGE</label>
                  <select
                    value={form.ring_gauge}
                    onChange={(e) => setForm((s) => ({ ...s, ring_gauge: e.target.value }))}
                    className="input w-full text-sm"
                    style={{ minHeight: 48 }}
                  >
                    <option value="">Choose…</option>
                    {RING_GAUGES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>LENGTH</label>
                  <select
                    value={form.length_inches}
                    onChange={(e) => setForm((s) => ({ ...s, length_inches: e.target.value }))}
                    className="input w-full text-sm"
                    style={{ minHeight: 48 }}
                  >
                    <option value="">Choose…</option>
                    {LENGTHS.map((l) => (
                      <option key={l.inches} value={l.inches}>{l.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>SHADE</label>
                  <select
                    value={form.shade}
                    onChange={(e) => setForm((s) => ({ ...s, shade: e.target.value }))}
                    className="input w-full text-sm"
                    style={{ minHeight: 48 }}
                  >
                    <option value="">Choose…</option>
                    {SHADES.map((s) => (
                      <option key={s.name} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label style={labelStyle}>WRAPPER</label>
                  <select
                    value={form.wrapper}
                    onChange={(e) => setForm((s) => ({ ...s, wrapper: e.target.value }))}
                    className="input w-full text-sm"
                    style={{ minHeight: 48 }}
                  >
                    <option value="">Choose…</option>
                    {WRAPPERS.map((w) => (
                      <option key={w.name} value={w.name}>
                        {w.name} — {w.description}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label style={labelStyle}>WRAPPER COUNTRY</label>
                  <select
                    value={form.wrapper_country}
                    onChange={(e) => setForm((s) => ({ ...s, wrapper_country: e.target.value }))}
                    className="input w-full text-sm"
                    style={{ minHeight: 48 }}
                  >
                    <option value="">Choose…</option>
                    {WRAPPER_COUNTRIES.map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label style={labelStyle}>BINDER COUNTRY</label>
                  <select
                    value={form.binder_country}
                    onChange={(e) => setForm((s) => ({ ...s, binder_country: e.target.value }))}
                    className="input w-full text-sm"
                    style={{ minHeight: 48 }}
                  >
                    <option value="">Choose…</option>
                    {WRAPPER_COUNTRIES.map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label style={labelStyle}>FILLER COUNTRIES</label>
                  <p className="text-xs mb-2" style={{ color: "rgba(166,144,128,0.7)" }}>
                    Tap one or more.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {WRAPPER_COUNTRIES.map((c) => {
                      const active = form.filler_countries.includes(c.name);
                      return (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => toggleFiller(c.name)}
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

              {error && (
                <p className="text-xs" style={{ color: "#E8642C" }}>{error}</p>
              )}

              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold"
                  style={{
                    background: "transparent",
                    border:     "1px solid var(--border)",
                    color:      "var(--muted-foreground)",
                    cursor:     "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold"
                  style={{
                    background: submitting ? "rgba(212,160,74,0.3)" : "var(--gold,#D4A04A)",
                    color:      "#1A1210",
                    border:     "none",
                    cursor:     submitting ? "default" : "pointer",
                  }}
                >
                  {submitting ? "Submitting…" : "Submit Edit"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );

  return typeof window !== "undefined" ? createPortal(modal, document.body) : null;
}
