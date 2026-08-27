# Band Scanner Match Improvements — Design

Date: 2026-08-27
Status: Approved (Dave, 2026-08-27). Phone verification happens in production per Dave.

## Problem

Scanning an Arturo Fuente Double Chateau Maduro band never surfaced the cigar.
Three caps stack against variant cigars in large brand families:

1. The catalog query returns only the 50 most popular rows matching any OCR
   word. Big families (Arturo Fuente: 106 rows) overflow the pool, so less
   popular variants are cut before scoring ever runs.
2. Only 8 OCR words are used for matching, selected by length.
3. Results are hard-capped at 5.

A fourth issue: all rows of one brand share the same large brand score, and
the words that distinguish variants barely move the ranking.

## Changes (all in `lib/scanner/ocr-match.ts` + `components/humidor/CigarBandScanner.tsx`)

1. **Candidate pool**: query limit 50 → 200 (still `usage_count` descending).
2. **Query words**: default cap 8 → 16, same stop-word and length filtering.
3. **Ranking, variant discrimination**: replace the series/format substring
   hit count with word-level coverage of the candidate's own name:
   - Candidate name words = unique words (length ≥ 3) from `series` +
     `format`, excluding words already in the brand.
   - Each candidate name word found in the OCR text: **+2**.
   - Each candidate name word NOT found in the OCR text: **−1**.
   - Brand scoring unchanged (brand word hits ×3, exact brand word +3,
     verbatim multi-word brand +5).
   - Effect: band says "double ... maduro" → Double Chateau Fuente Maduro
     outranks plain Chateau; band says only "chateau" → the reverse.
4. **No result cap**: return every candidate at or above the existing score
   threshold (2), ranked. Ties keep catalog popularity order (stable sort).
   The results sheet already scrolls (72dvh max height), so no UI change.

## Not doing

- Postgres trigram / fuzzy search (Approach B): held back unless OCR
  misreads become the dominant failure after this ships.
- Wrapper-column matching: variant wrapper text already lives in `format`.

## Testing

- Unit tests in `lib/scanner/__tests__/ocr-match.test.ts`, including the
  Fuente regression case (Double Chateau Fuente Maduro must rank first when
  the band text contains "double" and "maduro", and must rank below simpler
  variants when it does not).
- Production phone test by Dave after merge.
