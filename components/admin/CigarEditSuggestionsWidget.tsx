"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

export interface PendingEditSuggestion {
  id:           string;
  cigar_id:     string;
  cigar_brand:  string | null;
  cigar_series: string | null;
  submitter:    string | null;
  current:      Record<string, unknown>;
  suggested:    Record<string, unknown>;
  created_at:   string;
}

interface Props {
  initialSuggestions: PendingEditSuggestion[];
}

/* Modal is non-trivial — load only when the admin opens a row. */
const CigarEditReviewModal = dynamic(
  () => import("./CigarEditReviewModal").then((m) => ({ default: m.CigarEditReviewModal })),
  { ssr: false },
);

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function CigarEditSuggestionsWidget({ initialSuggestions }: Props) {
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [openId,      setOpenId]      = useState<string | null>(null);

  const openSuggestion = suggestions.find((s) => s.id === openId) ?? null;

  function handleResolved(id: string) {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    setOpenId(null);
  }

  return (
    <>
      <section
        style={{
          background:   "var(--card)",
          border:       "1px solid rgba(212,160,74,0.18)",
          borderRadius: 16,
          overflow:     "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding:      "20px 20px 14px",
            borderBottom: "1px solid var(--border)",
            display:      "flex",
            alignItems:   "center",
            gap:          10,
          }}
        >
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--muted-foreground)" }}
          >
            Edit Suggestions
          </span>
          {suggestions.length > 0 && (
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "var(--ember,#E8642C)", color: "#fff" }}
            >
              {suggestions.length}
            </span>
          )}
        </div>

        {suggestions.length === 0 ? (
          <p className="text-xs px-5 py-8 text-center" style={{ color: "var(--muted-foreground)" }}>
            No pending edit suggestions.
          </p>
        ) : (
          <div>
            {suggestions.map((s, i) => {
              const changedCount = Object.keys(s.suggested).length;
              const cigarName    = [s.cigar_brand, s.cigar_series].filter(Boolean).join(" ") || "Unknown cigar";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setOpenId(s.id)}
                  className="w-full text-left"
                  style={{
                    display:    "flex",
                    gap:        16,
                    padding:    "16px 20px",
                    borderTop:  i === 0 ? "none" : "1px solid var(--border)",
                    alignItems: "center",
                    background: "transparent",
                    border:     "none",
                    cursor:     "pointer",
                    color:      "inherit",
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: "var(--foreground)" }}>
                      {cigarName}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                      {s.submitter ?? "Member"} &middot; {relativeTime(s.created_at)} &middot; {changedCount} {changedCount === 1 ? "change" : "changes"}
                    </p>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M5 1l6 6-6 6" stroke="var(--muted-foreground)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {openSuggestion && (
        <CigarEditReviewModal
          suggestion={openSuggestion}
          onClose={() => setOpenId(null)}
          onResolved={handleResolved}
        />
      )}
    </>
  );
}
