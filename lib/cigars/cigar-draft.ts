/**
 * Manual-entry draft persistence.
 *
 * iOS PWA context: leaving the app (e.g. via the Look up button, which
 * opens Safari) lets iOS evict the page; returning relaunches it and all
 * in-memory form state is gone. Drafts are therefore mirrored to
 * localStorage as the user types and restored when the sheet reopens.
 *
 * Lifecycle: saved on every manual-field change while a sheet is open;
 * cleared on successful submit and on explicit close (user abandoning);
 * restored by the sheet's open effect, and the page auto-reopens the
 * sheet on mount when a live draft exists. TTL keeps week-old drafts
 * from resurfacing.
 *
 * serialize/parse are pure (injected clock) for unit tests; the
 * localStorage wrappers are thin and guarded for private-mode Safari.
 */

import {
  EMPTY_CIGAR_DETAILS,
  type CigarDetails,
} from "@/lib/cigars/cigar-details";

export const DRAFT_TTL_MS = 60 * 60 * 1000; // 1 hour

export type CigarDraftSurface = "humidor" | "wishlist" | "suggest-edit";

/* suggest-edit drafts are per-cigar (ctx = cigar id) so a draft for one
   cigar never restores onto another's edit sheet. */
const keyFor = (surface: CigarDraftSurface, ctx?: string) =>
  ctx ? `ae:cigar-draft:${surface}:${ctx}` : `ae:cigar-draft:${surface}`;

function hasContent(d: CigarDetails): boolean {
  return (
    Object.entries(d).some(
      ([k, v]) => k !== "fillerCountries" && typeof v === "string" && v.trim() !== "",
    ) || d.fillerCountries.length > 0
  );
}

export function serializeCigarDraft(d: CigarDetails, now: number): string | null {
  if (!hasContent(d)) return null;
  return JSON.stringify({ savedAt: now, details: d });
}

export function parseCigarDraft(json: string | null, now: number): CigarDetails | null {
  if (!json) return null;
  try {
    const obj = JSON.parse(json) as { savedAt?: unknown; details?: unknown };
    if (typeof obj.savedAt !== "number" || now - obj.savedAt > DRAFT_TTL_MS) return null;
    const d = obj.details as Record<string, unknown> | undefined;
    if (!d) return null;
    /* Validate the full shape — a draft from an older app version with
       missing fields is discarded rather than half-restored. */
    for (const key of Object.keys(EMPTY_CIGAR_DETAILS)) {
      if (key === "fillerCountries") {
        if (!Array.isArray(d[key]) || (d[key] as unknown[]).some((v) => typeof v !== "string")) return null;
      } else if (typeof d[key] !== "string") {
        return null;
      }
    }
    return d as unknown as CigarDetails;
  } catch {
    return null;
  }
}

/* ── localStorage wrappers (browser only; safe in private mode) ──── */

export function saveCigarDraft(surface: CigarDraftSurface, d: CigarDetails, ctx?: string): void {
  try {
    const json = serializeCigarDraft(d, Date.now());
    if (json === null) localStorage.removeItem(keyFor(surface, ctx));
    else localStorage.setItem(keyFor(surface, ctx), json);
  } catch {
    /* storage unavailable — feature degrades to pre-draft behavior */
  }
}

export function loadCigarDraft(surface: CigarDraftSurface, ctx?: string): CigarDetails | null {
  try {
    return parseCigarDraft(localStorage.getItem(keyFor(surface, ctx)), Date.now());
  } catch {
    return null;
  }
}

export function clearCigarDraft(surface: CigarDraftSurface, ctx?: string): void {
  try {
    localStorage.removeItem(keyFor(surface, ctx));
  } catch {
    /* ignore */
  }
}
