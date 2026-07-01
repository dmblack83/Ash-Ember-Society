/* ------------------------------------------------------------------
   Shared display formatters.

   Single home for small pure helpers that were previously duplicated
   at module scope across humidor components. Add here only when the
   OUTPUT is identical across call sites — near-duplicates with
   different rendering (e.g. the two formatDate variants) stay local
   to their component on purpose.
   ------------------------------------------------------------------ */

/** Whole days a cigar has been aging; null start or future date → 0. */
export function agingDays(startDate: string | null): number {
  if (!startDate) return 0;
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(startDate).getTime()) / 86_400_000),
  );
}

/** Word label for the 1-5 burn-report rating scale; <1 means unrated. */
export function ratingWord(val: number): string {
  if (val < 1) return "—";
  if (val === 1) return "Poor";
  if (val === 2) return "Below Average";
  if (val === 3) return "Average";
  if (val === 4) return "Good";
  return "Excellent";
}
