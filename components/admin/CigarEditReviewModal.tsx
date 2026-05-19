"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import type { PendingEditSuggestion } from "./CigarEditSuggestionsWidget";

interface Props {
  suggestion: PendingEditSuggestion;
  onClose:    () => void;
  onResolved: (id: string) => void;
}

const FIELD_LABELS: Record<string, string> = {
  brand:             "Brand",
  series:            "Series / Name",
  format:            "Format",
  ring_gauge:        "Ring Gauge",
  length_inches:     "Length (in)",
  shade:             "Shade",
  wrapper:           "Wrapper",
  wrapper_country:   "Wrapper Country",
  binder_country:    "Binder Country",
  filler_countries:  "Filler Countries",
};

/* Render order — fixed so the diff is scannable regardless of the
   JSON key order on the row. */
const FIELD_ORDER = Object.keys(FIELD_LABELS);

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v))   return v.length === 0 ? "—" : v.join(", ");
  if (typeof v === "number") return String(v);
  return String(v);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

export function CigarEditReviewModal({ suggestion, onClose, onResolved }: Props) {
  useEscapeKey(true, onClose);

  const [acting, setActing] = useState<"approve" | "reject" | null>(null);
  const [error,  setError]  = useState<string | null>(null);

  async function handleAction(action: "approve" | "reject") {
    setActing(action);
    setError(null);
    const res = await fetch(`/api/admin/cigar-edit-suggestions/${suggestion.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action }),
    });
    if (res.ok) {
      onResolved(suggestion.id);
    } else {
      const body = await res.json().catch(() => ({}));
      setActing(null);
      setError(body.error ?? "Action failed.");
    }
  }

  const cigarName = [suggestion.cigar_brand, suggestion.cigar_series].filter(Boolean).join(" ") || "Unknown cigar";

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
          maxWidth:        640,
          maxHeight:       "90dvh",
          overflowY:       "auto",
          backgroundColor: "var(--card)",
          borderRadius:    20,
          border:          "1px solid var(--border)",
          padding:         "28px 24px 24px",
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
              Edit Suggestion
            </p>
            <h2
              className="text-base font-semibold mt-1 truncate"
              style={{ fontFamily: "var(--font-serif)", color: "var(--foreground)" }}
            >
              {cigarName}
            </h2>
            <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
              Suggested by {suggestion.submitter ?? "a member"}
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

        {/* Diff table */}
        <div
          style={{
            border:       "1px solid var(--border)",
            borderRadius: 12,
            overflow:     "hidden",
          }}
        >
          {/* Column headers */}
          <div
            className="grid"
            style={{
              gridTemplateColumns: "1fr 1fr 1fr",
              borderBottom:        "1px solid var(--border)",
              background:          "rgba(255,255,255,0.02)",
            }}
          >
            <div className="text-[11px] font-medium uppercase tracking-widest px-3 py-2" style={{ color: "var(--muted-foreground)" }}>
              Field
            </div>
            <div className="text-[11px] font-medium uppercase tracking-widest px-3 py-2" style={{ color: "var(--muted-foreground)" }}>
              Current
            </div>
            <div className="text-[11px] font-medium uppercase tracking-widest px-3 py-2" style={{ color: "var(--gold,#D4A04A)" }}>
              Suggested
            </div>
          </div>

          {FIELD_ORDER.map((k, i) => {
            const cur     = suggestion.current[k];
            const isDiff  = Object.prototype.hasOwnProperty.call(suggestion.suggested, k);
            const newVal  = isDiff ? suggestion.suggested[k] : cur;
            const changed = isDiff && !valuesEqual(cur, newVal);

            return (
              <div
                key={k}
                className="grid text-xs"
                style={{
                  gridTemplateColumns: "1fr 1fr 1fr",
                  borderTop:           i === 0 ? "none" : "1px solid var(--border)",
                  background:          changed ? "rgba(212,160,74,0.06)" : "transparent",
                }}
              >
                <div className="px-3 py-2.5 font-medium" style={{ color: "var(--foreground)" }}>
                  {FIELD_LABELS[k]}
                </div>
                <div className="px-3 py-2.5" style={{ color: "var(--muted-foreground)" }}>
                  {formatValue(cur)}
                </div>
                <div className="px-3 py-2.5" style={{ color: changed ? "var(--gold,#D4A04A)" : "var(--muted-foreground)" }}>
                  {formatValue(newVal)}
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <p className="text-xs mt-3" style={{ color: "#E8642C" }}>{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={() => handleAction("reject")}
            disabled={acting !== null}
            className="flex-1 py-3 rounded-xl text-sm font-semibold"
            style={{
              background: "transparent",
              border:     "1px solid rgba(232,100,44,0.4)",
              color:      "#E8642C",
              cursor:     acting ? "default" : "pointer",
            }}
          >
            {acting === "reject" ? "Rejecting…" : "Reject"}
          </button>
          <button
            type="button"
            onClick={() => handleAction("approve")}
            disabled={acting !== null}
            className="flex-1 py-3 rounded-xl text-sm font-semibold"
            style={{
              background: acting ? "rgba(212,160,74,0.3)" : "var(--gold,#D4A04A)",
              color:      "#1A1210",
              border:     "none",
              cursor:     acting ? "default" : "pointer",
            }}
          >
            {acting === "approve" ? "Approving…" : "Approve"}
          </button>
        </div>
      </div>
    </>
  );

  return typeof window !== "undefined" ? createPortal(modal, document.body) : null;
}
