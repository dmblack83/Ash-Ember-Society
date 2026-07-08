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

/** Parse a smoke_logs.smoked_at value into a Date at LOCAL midnight of
    its calendar day. The column is timestamptz but the wizard writes
    date-only strings, which Postgres stores as UTC midnight; parsing
    the full timestamp with `new Date()` renders the PREVIOUS day in
    timezones west of UTC. Slicing to the date part first keeps every
    display consistent with the day shown in the edit form. */
export function smokedAtToLocalDate(smokedAt: string): Date | null {
  const d = new Date(smokedAt.slice(0, 10) + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Today's LOCAL calendar date as "YYYY-MM-DD" for date inputs.
    `new Date().toISOString()` gives the UTC date, which is already
    tomorrow during the evening in US timezones. */
export function todayLocalYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
