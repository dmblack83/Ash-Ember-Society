"use client";

/*
 * Manual-add duplicate interstitial (mockup 06 step 3). Fires only
 * when match_cigar_lines returns a close match; never blocks
 * creation. Renders as a centered modal above the add sheet.
 */

import { useEffect } from "react";
import type { LineMatch } from "@/lib/data/cigar-fetchers";
import type { SizeChild } from "@/lib/cigars/line-group";
import { sizeDims } from "@/lib/cigars/line-group";

interface DupeCheckDialogProps {
  match:        LineMatch;
  matchedChild: SizeChild | null;   // pre-highlighted "your size"
  busy:         boolean;
  onUseExisting: (child: SizeChild) => void;  // Path A
  onAddSize:     () => void;                  // Path B
  onCreateNew:   () => void;                  // Path C
  onCancel:      () => void;                  // scrim/Escape: back to the form
}

export function DupeCheckDialog({
  match, matchedChild, busy,
  onUseExisting, onAddSize, onCreateNew, onCancel,
}: DupeCheckDialogProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const meta = [match.line.wrapper, match.line.shade, match.line.wrapper_country]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Possible duplicate cigar">
      <div className="absolute inset-0 bg-black/65" onClick={busy ? undefined : onCancel} />
      <div
        className="absolute left-4 right-4 top-1/2 -translate-y-1/2 rounded-2xl p-5 overflow-y-auto sm:max-w-md sm:mx-auto"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", maxHeight: "86%" }}
      >
        <h3 className="text-lg font-bold text-foreground mb-1" style={{ fontFamily: "var(--font-serif)" }}>
          Is this the same cigar?
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
          A close match is already in the catalog. Using it keeps every member&apos;s reviews and stats connected.
        </p>

        <div className="rounded-xl p-3.5" style={{ backgroundColor: "var(--background)", border: "1px solid rgba(212,160,74,0.35)" }}>
          <p className="text-[9px] font-bold tracking-widest uppercase text-muted-foreground">{match.line.brand}</p>
          <p className="text-base text-foreground" style={{ fontFamily: "var(--font-serif)" }}>
            {match.line.series ?? match.line.brand}
          </p>
          {meta && <p className="text-[11px] text-muted-foreground">{meta}</p>}
          <div className="mt-2.5 space-y-1.5">
            {match.children.map((s) => {
              const yours = s.id === matchedChild?.id;
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-[13px]"
                  style={{
                    border: `1px solid ${yours ? "var(--gold, #D4A04A)" : "var(--border)"}`,
                    backgroundColor: yours ? "rgba(212,160,74,0.07)" : "transparent",
                  }}
                >
                  <span className="text-foreground">{s.format ?? "Original size"}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground tabular-nums">{sizeDims(s)}</span>
                    {yours && (
                      <span className="text-[9px] tracking-wider uppercase" style={{ color: "var(--gold, #D4A04A)" }}>
                        your size
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {matchedChild && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onUseExisting(matchedChild)}
            className="btn btn-primary w-full mt-3 disabled:opacity-40"
          >
            Yes, add the {matchedChild.format ?? "matching size"}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onAddSize}
          className="btn btn-secondary w-full mt-2 disabled:opacity-40"
        >
          Same cigar, but my size isn&apos;t listed
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCreateNew}
          className="w-full mt-2 py-2.5 text-sm text-muted-foreground disabled:opacity-40"
        >
          No, mine is different. Create a new listing
        </button>
      </div>
    </div>
  );
}
