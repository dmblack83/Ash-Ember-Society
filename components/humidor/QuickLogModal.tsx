"use client";

import { useState, useEffect } from "react";
import { ratingLabel } from "@/lib/rating";
import { todayLocalYmd } from "@/lib/format";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";

/* ------------------------------------------------------------------
   Smoke One modal
   ------------------------------------------------------------------ */

export interface SmokeLogDraft {
  smoked_at:      string;
  overall_rating: number;
  review_text:    string | null;
}

export function QuickLogModal({
  isOpen,
  onClose,
  onSmoked,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSmoked: (draft: SmokeLogDraft) => void;
}) {
  /* Escape-key dismissal — listener only attached while open. */
  useEscapeKey(isOpen, onClose);

  const today = todayLocalYmd();
  const [smokedAt, setSmokedAt] = useState(today);
  /* 1-100, same scale + default as the burn report wizard. Quick logs
     stored 1-10 until 2026-07 (existing rows migrated x10). */
  const [rating, setRating] = useState<number>(75);
  const [reviewText, setReviewText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSmokedAt(today);
    setRating(75);
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

    onSmoked({
      smoked_at: smokedAt,
      overall_rating: rating,
      review_text: reviewText.trim() || null,
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
                {/* Same 1-100 slider treatment as the burn report
                    wizard: big italic numeral + grade word + gold-fill
                    track, so one rating scale reads identically
                    everywhere. */}
                <div className="text-center" style={{ paddingBottom: 4 }}>
                  <p
                    style={{
                      fontFamily:    "var(--font-serif)",
                      fontStyle:     "italic",
                      fontWeight:    500,
                      fontSize:      56,
                      lineHeight:    0.9,
                      letterSpacing: "-0.02em",
                      color:         "var(--gold)",
                      margin:        0,
                    }}
                  >
                    {rating}
                    <span
                      style={{
                        fontSize:      16,
                        fontStyle:     "normal",
                        letterSpacing: 0,
                        color:         "var(--muted-foreground)",
                        marginLeft:    6,
                      }}
                    >
                      / 100
                    </span>
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-serif)",
                      fontStyle:  "italic",
                      fontSize:   15,
                      fontWeight: 500,
                      color:      "var(--paper-mute)",
                      margin:     "4px 0 0",
                    }}
                  >
                    {ratingLabel(rating)}
                  </p>
                </div>
                <div style={{ paddingLeft: 4, paddingRight: 4 }}>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={rating}
                    onChange={(e) => setRating(parseInt(e.target.value))}
                    className="burn-report-slider"
                    aria-label="Overall rating, 1 to 100"
                    style={{
                      ["--p" as string]: `${rating}%`,
                      width: "100%",
                    }}
                  />
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
