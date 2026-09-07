/**
 * Line-grouping helpers for the consolidated catalog.
 *
 * A "line" is one cigar entry (brand + series); its children are
 * the size rows in cigar_catalog. Pure functions only — no React,
 * no Supabase — so size matching and label logic are unit-testable.
 */

import type { CatalogResult } from "@/components/cigar-search";
import { lengthLabelForInches } from "@/lib/cigar-taxonomy";

export interface CatalogLine {
  brand:     string | null;
  series:    string | null;
  wrapper:   string | null;
  shade:     string | null;
  /* 0 = unknown (ungrouped fallback when the browse RPC is
     missing) — the UI hides the vitola chip then. */
  sizeCount: number;
  /* Child id the card navigates to (/discover/cigars/[repId]). */
  repId:     string;
  imageUrl:  string | null;
}

export interface SizeChild {
  id:             string;
  /* Vitola marketing name ("King B") — optional child-level field. */
  name?:          string | null;
  format:         string | null;
  ring_gauge:     number | null;
  length_inches:  number | null;
  image_url?:     string | null;
}

export interface EnteredSize {
  format:       string;         // "" = none
  ringGauge:    number | null;
  lengthInches: number | null;
}

/* Dupe-check size tolerance: format equal, ring equal, length
   within 1/8" (spec: Feature 3). */
export const LENGTH_TOLERANCE_INCHES = 0.125;

/* '7 1/4" × 50' — length × ring (detail order is Format > Length >
   Ring Gauge, 2026-09-07), dropping whichever is missing. */
export function sizeDims(c: SizeChild): string {
  const len = c.length_inches != null
    ? (lengthLabelForInches(c.length_inches) ?? `${c.length_inches}"`)
    : null;
  if (c.ring_gauge != null && len) return `${len} × ${c.ring_gauge}`;
  if (c.ring_gauge != null)        return `${c.ring_gauge} ring`;
  if (len)                         return len;
  return "";
}

/* 'Perfecto 50 × 4"' — CTA label suffix for a selected size. The
   vitola name outranks the shape when present ('King B 50 × 5 1/2"'). */
export function sizeLabel(c: SizeChild): string {
  const parts = [c.name ?? c.format, sizeDims(c)].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Original size";
}

function normFormat(f: string | null | undefined): string {
  return (f ?? "").trim().toLowerCase();
}

/* The entered size matches a child when format (case-insensitive),
   ring gauge, and length (±1/8") all agree — null/empty on both
   sides counts as agreement. */
export function findMatchingSize(
  children: SizeChild[],
  entered:  EnteredSize,
): SizeChild | null {
  for (const c of children) {
    const formatOk = normFormat(c.format) === normFormat(entered.format);
    const ringOk   = (c.ring_gauge ?? null) === (entered.ringGauge ?? null);
    const lengthOk =
      c.length_inches == null || entered.lengthInches == null
        ? (c.length_inches ?? null) === (entered.lengthInches ?? null)
        : Math.abs(c.length_inches - entered.lengthInches) <= LENGTH_TOLERANCE_INCHES;
    if (formatOk && ringOk && lengthOk) return c;
  }
  return null;
}

/* Ungrouped fallback: one card per child row, chip hidden. */
export function childToLine(c: CatalogResult): CatalogLine {
  return {
    brand:     c.brand,
    series:    c.series,
    wrapper:   c.wrapper,
    shade:     c.shade,
    sizeCount: 0,
    repId:     c.id,
    imageUrl:  c.image_url,
  };
}

/* ── Display naming ─────────────────────────────────────────────────
   Canonical cigar display convention (2026-09-07): the line's series
   is the title; the vitola NAME renders quoted on its own row:
     Chateau Fuente Sun Grown
     "Queen B"
   No series but name: the name IS the title (no quoting, no second row).
   cigarDisplayName is the single-string form for labels, alt text,
   notifications, and share images:
     Chateau Fuente Sun Grown "Queen B" (series + name)
     Moroni's Trumpet (name only, no series)                         */

export interface CigarNameParts {
  series?: string | null;
  name?:   string | null;
  format?: string | null;
  brand?:  string | null;
}

/* Title line: series when present; otherwise the vitola name IS the
   headline (brand-only cigars); then format, then brand. */
export function cigarTitle(c: CigarNameParts): string {
  return c.series ?? c.name ?? c.format ?? c.brand ?? "Cigar";
}

/* Single-string form: the quoted name attaches only when a series
   carries the title (no series = the name already IS the title). */
export function cigarDisplayName(c: CigarNameParts): string {
  const title = cigarTitle(c);
  return c.series && c.name ? `${title} "${c.name}"` : title;
}
