"use client";

import { useState } from "react";
import useSWR from "swr";
import { keyFor } from "@/lib/data/keys";
import { fetchLineSiblings } from "@/lib/data/cigar-fetchers";
import { sizeLabel, type SizeChild } from "@/lib/cigars/line-group";
import { VitolaRadioList } from "@/components/cigars/VitolaRadioList";

/* ------------------------------------------------------------------
   VitolaPickerPanel — mockup section 02. Hosted inside the unified
   add-cigar sheet once a multi-vitola line is chosen: a selected-line
   card (brand/series + Change, back to search) sits above the same
   Choose Vitola radiogroup the catalog detail page uses, so a member
   never sees two different vitola pickers in the app.

   Presentational + its own data fetch: siblings load via SWR keyed
   exactly like CigarDetailRoute (keyFor.lineSiblings), so a detail
   page visit and an add-flow pick of the same line share one cache
   entry. Selection state stays local; the sheet only learns the
   choice when the member taps the CTA (onConfirm).
   ------------------------------------------------------------------ */

export interface VitolaPickerPanelProps {
  brand:      string | null;
  series:     string | null;
  fromScan?:  boolean;                 // small mono tag on the line card
  onChange:   () => void;              // back to search
  onConfirm:  (child: SizeChild) => void;
}

function FromScanTag() {
  return (
    <span
      className="inline-block ml-2 align-middle text-[8.5px] font-semibold uppercase rounded"
      style={{
        fontFamily:      "var(--font-mono)",
        letterSpacing:   "0.1em",
        color:           "var(--gold-deep)",
        backgroundColor: "rgba(212,160,74,0.1)",
        border:          "1px solid var(--gold-deep)",
        padding:         "2px 6px",
      }}
    >
      From Scan
    </span>
  );
}

function SelectedLineCard({
  brand, series, fromScan, count, onChange,
}: {
  brand:     string;
  series:    string | null;
  fromScan?: boolean;
  count:     number | undefined;
  onChange:  () => void;
}) {
  return (
    <div
      className="flex items-start justify-between gap-3 rounded-2xl p-4"
      style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--primary)" }}>
          {brand}
        </p>
        <p
          className="text-base font-medium text-foreground leading-snug"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {series ?? brand}
          {fromScan && <FromScanTag />}
        </p>
        {count !== undefined && (
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            {count} {count === 1 ? "vitola" : "vitolas"}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onChange}
        className="flex-shrink-0 text-xs font-semibold rounded-lg transition-colors active:opacity-70"
        style={{
          padding:         "7px 12px",
          color:           "var(--muted-foreground)",
          backgroundColor: "var(--muted)",
          border:          "1px solid var(--border)",
        }}
      >
        Change
      </button>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2 animate-pulse" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl bg-muted" style={{ height: 60 }} />
      ))}
    </div>
  );
}

export function VitolaPickerPanel({
  brand, series, fromScan, onChange, onConfirm,
}: VitolaPickerPanelProps) {
  const key = brand ? keyFor.lineSiblings(brand, series) : null;
  const { data: siblings, error } = useSWR(
    key,
    () => fetchLineSiblings(brand as string, series),
  );

  /* Explicit tap overrides the auto-selected first row. Reset when the
     line itself changes (Change → search → pick a different line) so
     a stale selection from the previous line never survives — adjusted
     during render (React's documented pattern for resetting state in
     response to a prop change) rather than in an effect, which would
     cost an extra render pass. */
  const lineKey = `${brand ?? ""}::${series ?? ""}`;
  const [explicitId, setExplicitId] = useState<string | null>(null);
  const [lastLineKey, setLastLineKey] = useState(lineKey);
  if (lineKey !== lastLineKey) {
    setLastLineKey(lineKey);
    setExplicitId(null);
  }

  const selectedId = explicitId ?? siblings?.[0]?.id ?? null;
  const selected = siblings?.find((s) => s.id === selectedId) ?? null;

  const failed = !brand || error;

  return (
    <div className="space-y-4">
      {brand && (
        <SelectedLineCard
          brand={brand}
          series={series}
          fromScan={fromScan}
          count={siblings?.length}
          onChange={onChange}
        />
      )}

      {failed ? (
        <p className="text-sm text-center py-6" style={{ color: "var(--muted-foreground)" }}>
          Couldn&apos;t load sizes.
        </p>
      ) : siblings === undefined ? (
        <SkeletonRows />
      ) : (
        <>
          <h2>Choose Vitola</h2>
          <VitolaRadioList
            siblings={siblings}
            selectedId={selectedId}
            onSelect={setExplicitId}
            ariaLabel="Choose Vitola"
          />
          <button
            type="button"
            onClick={() => selected && onConfirm(selected)}
            disabled={!selected}
            className="btn btn-primary w-full disabled:opacity-40"
            style={{ minHeight: 52 }}
          >
            {selected ? `Add ${sizeLabel(selected)}` : "Add"}
          </button>
        </>
      )}
    </div>
  );
}
