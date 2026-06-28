/* ------------------------------------------------------------------
   Pure helpers for multi-word cigar search. No DOM, no network — the
   tokenizing + LIKE-pattern logic lives here so it is unit-testable and
   shared by both the Discover grid (fetchCigarPage) and the search
   dropdown (cigar-search.tsx). See
   docs/superpowers/specs/2026-06-27-cigar-search-multiword-design.md.
   ------------------------------------------------------------------ */

/** Upper bound on tokens per query — keeps the chained ILIKE filter list
 *  bounded regardless of how much the user types. */
export const MAX_SEARCH_TOKENS = 6;

/** Split raw input into normalized search tokens: lowercased,
 *  whitespace-split, trimmed, de-duplicated, empties dropped, capped. */
export function tokenizeSearch(input: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of input.toLowerCase().split(/\s+/)) {
    const token = raw.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
    if (tokens.length >= MAX_SEARCH_TOKENS) break;
  }
  return tokens;
}

/** Escape LIKE wildcards so user input matches literally under Postgres'
 *  default '\' escape character. Backslash MUST be escaped first. */
export function escapeLike(token: string): string {
  return token.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&");
}

/** Build a contains-pattern (`%token%`) with the token's own LIKE
 *  metacharacters escaped, so the surrounding `%` are the only wildcards. */
export function toLikePattern(token: string): string {
  return `%${escapeLike(token)}%`;
}
