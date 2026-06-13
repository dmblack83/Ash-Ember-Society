"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import { CigarDetailFields } from "@/components/cigars/CigarDetailFields";
import {
  type CigarDetails,
  type CurrentCigarFields,
  cigarDetailsToCatalogFields,
  diffCigarFields,
  cigarDetailsFromCurrent,
} from "@/lib/cigars/cigar-details";

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

export interface CurrentCigar extends CurrentCigarFields {
  id: string;
}

interface Props {
  cigar:    CurrentCigar;
  onClose: () => void;
}

export function SuggestCigarEditSheet({ cigar, onClose }: Props) {
  useEscapeKey(true, onClose);

  const [form,        setForm]       = useState<CigarDetails>(() => cigarDetailsFromCurrent(cigar));
  const [submitting,  setSubmitting] = useState(false);
  const [error,       setError]      = useState<string | null>(null);
  const [submitted,   setSubmitted]  = useState(false);

  async function handleSubmit() {
    if (submitting) return;
    setError(null);

    const current   = cigarDetailsToCatalogFields(cigarDetailsFromCurrent(cigar));
    const suggested = cigarDetailsToCatalogFields(form);
    const diff      = diffCigarFields(current, suggested);

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
              <CigarDetailFields value={form} onChange={setForm} />

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
