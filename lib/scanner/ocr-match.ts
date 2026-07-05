/**
 * OCR-text-to-catalog matching for the cigar band scanner.
 * Pure functions; the Supabase query stays in the component.
 */

export const OCR_STOP_WORDS = new Set([
  "the","and","for","from","with","hand","rolled","made","since","est",
  "republic","republica","dominicana","dominican","cuba","cubana","body",
  "medium","full","light","natural","colorado","claro","oscuro","premium",
  "cigar","cigars","tobacco","blend","wrapper","binder","filler",
  "honduras","nicaragua","mexico","ecuador","cameroon","brazil","indonesia",
  "connecticut","habano","corojo","criollo",
]);

/** Lowercase + strip diacritics so "Padrón" matches "padron". */
export function foldText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Picks the most distinctive words from OCR output for the catalog query.
 * Longer words are kept first — they are far less likely to be OCR noise
 * or to flood the query with generic matches.
 */
export function selectQueryWords(ocrText: string, max = 8): string[] {
  const seen = new Set<string>();
  const words = foldText(ocrText)
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => {
      if (w.length < 3 || OCR_STOP_WORDS.has(w) || seen.has(w)) return false;
      seen.add(w);
      return true;
    });

  return words
    .map((w, i) => ({ w, i }))
    .sort((a, b) => b.w.length - a.w.length || a.i - b.i)
    .slice(0, max)
    .map(({ w }) => w);
}

interface CandidateFields {
  brand: string | null;
  series: string | null;
  format: string | null;
}

const SCORE_THRESHOLD = 2;
const MAX_RESULTS = 5;

/**
 * Scores catalog rows against the OCR words.
 * Brand hits weigh 3x, series/format hits 2x, exact brand word +3,
 * and a full multi-word brand appearing verbatim in the OCR text +5.
 */
export function scoreCandidates<T extends CandidateFields>(
  words: string[],
  ocrText: string,
  rows: T[]
): T[] {
  const foldedOcr = foldText(ocrText);

  return rows
    .map((cigar) => {
      const brand = foldText(cigar.brand ?? "");
      const seriesFormat = foldText(
        `${cigar.series ?? ""} ${cigar.format ?? ""}`
      );

      const brandHits = words.filter((w) => brand.includes(w)).length;
      const seriesFormatHits = words.filter((w) =>
        seriesFormat.includes(w)
      ).length;
      const brandExact = words.some((w) => brand === w) ? 3 : 0;
      // Multi-word brands only — single-word brands are already counted
      // by brandHits/brandExact, and re-counting them here lets a partial
      // brand outrank the full one.
      const phraseBonus =
        brand.includes(" ") && brand.length >= 5 && foldedOcr.includes(brand)
          ? 5
          : 0;

      return {
        cigar,
        score: brandHits * 3 + seriesFormatHits * 2 + brandExact + phraseBonus,
      };
    })
    .filter((c) => c.score >= SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map(({ cigar }) => cigar);
}
