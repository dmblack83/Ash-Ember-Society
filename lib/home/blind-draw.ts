/*
 * The Blind Draw — pure pick logic.
 *
 * The pool holds ONE entry per unique catalog cigar (so a box of 20
 * of the same stick doesn't dominate the odds) and only cigars with
 * stock on hand. Eligibility requires more than one unique cigar;
 * below that the home card doesn't render at all.
 */

export interface DrawItem {
  /** humidor_items.id — the burn-report route param. */
  id:       string;
  cigar_id: string;
  quantity: number;
}

export function drawPool<T extends DrawItem>(items: T[]): T[] {
  const seen = new Set<string>();
  const pool: T[] = [];
  for (const it of items) {
    if (it.quantity <= 0 || seen.has(it.cigar_id)) continue;
    seen.add(it.cigar_id);
    pool.push(it);
  }
  return pool;
}

export function isDrawEligible(pool: DrawItem[]): boolean {
  return pool.length > 1;
}

/**
 * Uniform pick; `excludeItemId` (the previous draw) is removed first
 * so "Draw again" always lands somewhere new.
 */
export function pickDraw<T extends DrawItem>(
  pool: T[],
  excludeItemId?: string,
  rng: () => number = Math.random,
): T | null {
  const candidates = excludeItemId ? pool.filter((p) => p.id !== excludeItemId) : pool;
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}
