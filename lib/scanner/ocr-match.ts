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
export function selectQueryWords(ocrText: string, max = 16): string[] {
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

/**
 * Scores catalog rows against the OCR words.
 * Brand hits weigh 3x, exact brand word +3, and a full multi-word brand
 * appearing verbatim in the OCR text +5. Series/format is scored by
 * coverage of the candidate's own name words: within one brand family
 * every row shares the brand score, so the variant words ("double",
 * "maduro") are what separate the right cigar from its siblings —
 * each found on the band adds 2, each absent subtracts 1.
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

      const brandHits = words.filter((w) => brand.includes(w)).length;
      const brandExact = words.some((w) => brand === w) ? 3 : 0;
      // Multi-word brands only — single-word brands are already counted
      // by brandHits/brandExact, and re-counting them here lets a partial
      // brand outrank the full one.
      const phraseBonus =
        brand.includes(" ") && brand.length >= 5 && foldedOcr.includes(brand)
          ? 5
          : 0;

      // Brand words are excluded so series like "Chateau Fuente" don't
      // re-earn credit for "fuente".
      const brandWords = new Set(brand.split(/\s+/));
      const nameWords = new Set(
        foldText(`${cigar.series ?? ""} ${cigar.format ?? ""}`)
          .replace(/[^\w\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length >= 3 && !brandWords.has(w))
      );
      let found = 0;
      let missing = 0;
      for (const w of nameWords) {
        if (foldedOcr.includes(w)) found += 1;
        else missing += 1;
      }
      // Cap the miss penalty so a long catalog name can't sink a solid
      // brand match below the threshold on a brand-only band.
      const coverage = found * 2 - Math.min(missing, 3);

      return {
        cigar,
        score: brandHits * 3 + brandExact + phraseBonus + coverage,
      };
    })
    .filter((c) => c.score >= SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .map(({ cigar }) => cigar);
}
