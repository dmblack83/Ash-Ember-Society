/**
 * Client-side search filter for the humidor list. Matches a free-text
 * query against a cigar's brand, series, and wrapper (case-insensitive,
 * substring match). Empty/whitespace-only query matches everything.
 */
export function matchesQuery(
  item: { cigar: { brand: string | null; series: string | null; wrapper: string | null } },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.cigar.brand, item.cigar.series, item.cigar.wrapper]
    .some((f) => f != null && f.toLowerCase().includes(q));
}
