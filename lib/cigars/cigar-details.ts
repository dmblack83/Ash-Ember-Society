/**
 * Cigar detail capture — shared state shape + persistence mappers.
 *
 * Single source of truth for the manual "add cigar" sheets
 * (AddCigarSheet, WishlistClient) and the "update cigar" sheet
 * (SuggestCigarEditSheet). Pure functions only — no React — so the
 * mapping and the order-sensitive filler toggle are unit-testable in
 * the lib/ vitest suite.
 */

export interface CigarDetails {
  brand:            string;
  series:           string;
  format:           string;   // FORMATS value, or ""
  ringGauge:        string;   // numeric-as-string, or ""
  lengthInches:     string;   // numeric-as-string, or ""
  shade:            string;
  wrapper:          string;
  wrapperCountry:   string;
  binderCountry:    string;
  fillerCountries:  string[]; // ordered; user-controlled order is meaningful
}

export const EMPTY_CIGAR_DETAILS: CigarDetails = {
  brand:           "",
  series:          "",
  format:          "",
  ringGauge:       "",
  lengthInches:    "",
  shade:           "",
  wrapper:         "",
  wrapperCountry:  "",
  binderCountry:   "",
  fillerCountries: [],
};

/* Order-preserving add/remove. Returns a new array; never mutates. */
export function toggleFiller(list: string[], country: string): string[] {
  return list.includes(country)
    ? list.filter((c) => c !== country)
    : [...list, country];
}

/* snake_case catalog shape. Empty strings -> null; numerics parsed;
   empty filler array -> null. Used as the cigar_edit_suggestions JSONB
   shape AND as the base for a community-catalog suggestion row. */
export function cigarDetailsToCatalogFields(d: CigarDetails): Record<string, unknown> {
  return {
    brand:            d.brand.trim()          || null,
    series:           d.series.trim()         || null,
    format:           d.format                || null,
    ring_gauge:       d.ringGauge    ? Number(d.ringGauge)    : null,
    length_inches:    d.lengthInches ? Number(d.lengthInches) : null,
    shade:            d.shade                 || null,
    wrapper:          d.wrapper               || null,
    wrapper_country:  d.wrapperCountry        || null,
    binder_country:   d.binderCountry         || null,
    filler_countries: d.fillerCountries.length > 0 ? d.fillerCountries : null,
  };
}

/* p_-prefixed args for the insert_cigar_to_catalog RPC. */
export function cigarDetailsToRpcArgs(d: CigarDetails): Record<string, unknown> {
  const f = cigarDetailsToCatalogFields(d);
  return {
    p_brand:            f.brand,
    p_series:           f.series,
    p_format:           f.format,
    p_ring_gauge:       f.ring_gauge,
    p_length_inches:    f.length_inches,
    p_wrapper:          f.wrapper,
    p_wrapper_country:  f.wrapper_country,
    p_shade:            f.shade,
    p_binder_country:   f.binder_country,
    p_filler_countries: f.filler_countries,
  };
}

/* Row for cigar_catalog_suggestions: catalog fields + composed name +
   submitter id. */
export function cigarDetailsToSuggestionRow(
  d: CigarDetails,
  userId: string,
): Record<string, unknown> {
  const name = [d.brand.trim(), d.series.trim(), d.format]
    .filter(Boolean)
    .join(" - ");
  return {
    suggested_by: userId,
    name,
    ...cigarDetailsToCatalogFields(d),
  };
}

/* Field-by-field diff of two catalog-shaped objects. Arrays compared by
   content + order (filler order is meaningful). */
export function diffCigarFields(
  current:   Record<string, unknown>,
  suggested: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(suggested)) {
    const a = current[k];
    const b = suggested[k];
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) out[k] = b;
    } else if (a !== b) {
      out[k] = b;
    }
  }
  return out;
}

/* A catalog row as read for the edit sheet (snake_case, nullable). */
export interface CurrentCigarFields {
  brand:             string | null;
  series:            string | null;
  format:            string | null;
  ring_gauge:        number | null;
  length_inches:     number | null;
  shade:             string | null;
  wrapper:           string | null;
  wrapper_country:   string | null;
  binder_country:    string | null;
  filler_countries:  string[] | null;
}

/* Prefill form state from a catalog row (edit sheet). */
export function cigarDetailsFromCurrent(c: CurrentCigarFields): CigarDetails {
  return {
    brand:           c.brand            ?? "",
    series:          c.series           ?? "",
    format:          c.format           ?? "",
    ringGauge:       c.ring_gauge    !== null ? String(c.ring_gauge)    : "",
    lengthInches:    c.length_inches !== null ? String(c.length_inches) : "",
    shade:           c.shade            ?? "",
    wrapper:         c.wrapper          ?? "",
    wrapperCountry:  c.wrapper_country  ?? "",
    binderCountry:   c.binder_country   ?? "",
    fillerCountries: c.filler_countries ?? [],
  };
}
