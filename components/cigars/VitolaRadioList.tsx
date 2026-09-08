"use client";

/*
 * Shared "Choose Vitola" radiogroup — extracted verbatim from
 * CigarDetailClient so the add-cigar flow's in-sheet vitola picker
 * (VitolaPickerPanel) can render the identical rows. `isAdmin` +
 * `onEditSize` are optional and only used by the detail page's
 * direct-edit affordance; other consumers omit them.
 */

import { sizeDims, sizeLabel, type SizeChild } from "@/lib/cigars/line-group";

export interface VitolaRadioListProps {
  siblings:   SizeChild[];
  selectedId: string | null;
  onSelect:   (id: string) => void;
  ariaLabel:  string;
  isAdmin?:   boolean;
  onEditSize?: (child: SizeChild) => void;
}

export function VitolaRadioList({
  siblings,
  selectedId,
  onSelect,
  ariaLabel,
  isAdmin = false,
  onEditSize,
}: VitolaRadioListProps) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="space-y-2">
      {siblings.map((s) => {
        const sel = s.id === selectedId;
        return (
          <div key={s.id} className="flex items-center gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={sel}
              onClick={() => onSelect(s.id)}
              className="flex-1 flex items-center gap-3 p-3.5 rounded-xl text-left transition-colors duration-150"
              style={{
                backgroundColor: sel ? "rgba(212,160,74,0.07)" : "var(--card)",
                border: `1px solid ${sel ? "var(--gold, #D4A04A)" : "var(--border)"}`,
              }}
            >
              <span
                aria-hidden="true"
                className="flex-shrink-0 rounded-full"
                style={{
                  width: 17, height: 17,
                  border: `1.5px solid ${sel ? "var(--gold, #D4A04A)" : "var(--muted-foreground)"}`,
                  backgroundColor: "transparent",
                  boxShadow: sel ? "inset 0 0 0 3.5px var(--background), inset 0 0 0 12px var(--gold, #D4A04A)" : "none",
                }}
              />
              <span className="flex-1 text-sm font-medium text-foreground">
                {s.name ?? s.format ?? "Original size"}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {s.name && s.format ? `${s.format} · ${sizeDims(s)}` : sizeDims(s)}
              </span>
            </button>
            {isAdmin && onEditSize && (
              <button
                type="button"
                onClick={() => onEditSize(s)}
                aria-label={`Edit ${sizeLabel(s)}`}
                className="flex-shrink-0 flex items-center justify-center rounded-xl transition-colors"
                style={{
                  width: 40, height: 40,
                  color: "var(--gold, #D4A04A)",
                  border: "1px solid rgba(212,160,74,0.4)",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M9.7 1.7a1.5 1.5 0 0 1 2.1 2.1L4.5 11.2l-2.8.7.7-2.8 7.3-7.4z"
                    stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
