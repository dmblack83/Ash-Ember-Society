/* ------------------------------------------------------------------
   Burn Report draft persistence

   The Burn Report flow is a 6-step form with multi-MB photos, ratings,
   flavor tags, freeform review text, and an optional 3-phase Thirds
   breakdown. Without persistence, ANY interruption — accidental swipe-
   back, locking the phone too long, iOS killing the PWA — destroys the
   entire draft. Users have already lost reports that way.

   This module persists the form state (minus File objects, which can't
   be serialized to localStorage) keyed by `humidor_item_id` so each
   cigar gets its own draft. Drafts older than MAX_AGE_DAYS auto-expire
   on read.

   Photos are intentionally not persisted: serializing File objects
   requires IndexedDB, and dropped photos are usually less painful to
   re-add than retyping a freeform review. If photo persistence becomes
   a real complaint, upgrade to IndexedDB + structured-clone.
   ------------------------------------------------------------------ */

const STORAGE_PREFIX = "burn_report_draft:";
const MAX_AGE_DAYS   = 7;
const MAX_AGE_MS     = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

/* Cigar metadata persisted alongside the draft so the My Reports list
   can render a draft card (brand / series / format) without a Supabase
   round-trip per draft. Mirrors the subset of BurnReportCigar that
   BurnReportPreviewCard needs. */
export interface BurnReportDraftCigar {
  brand:  string | null;
  series: string | null;
  format: string | null;
}

/* The shape we persist. Form is opaque to this module — caller owns
   the schema (kept in sync with `FormData` in BurnReport.tsx). */
export interface BurnReportDraftPayload<TForm = Record<string, unknown>> {
  savedAt: number;
  step:    number;
  form:    TForm;
  /* Optional for back-compat with drafts written before the cigar
     metadata was added. New writes always include it. */
  cigar?:  BurnReportDraftCigar;
}

/* Listing entry — payload + the itemId parsed back out of the storage
   key. Used by the My Reports surface. */
export interface BurnReportDraftEntry<TForm = Record<string, unknown>>
  extends BurnReportDraftPayload<TForm>
{
  itemId: string;
}

export function loadBurnReportDraft<TForm = Record<string, unknown>>(
  itemId: string,
): BurnReportDraftPayload<TForm> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + itemId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BurnReportDraftPayload<TForm>;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(STORAGE_PREFIX + itemId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveBurnReportDraft<TForm = Record<string, unknown>>(
  itemId: string,
  form:   TForm,
  step:   number,
  cigar?: BurnReportDraftCigar,
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: BurnReportDraftPayload<TForm> = {
      savedAt: Date.now(),
      step,
      form,
      ...(cigar ? { cigar } : {}),
    };
    window.localStorage.setItem(STORAGE_PREFIX + itemId, JSON.stringify(payload));
  } catch {
    // localStorage full / blocked / disabled — fail silently.
    // Persistence is best-effort; the in-memory state is still valid.
  }
}

export function clearBurnReportDraft(itemId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + itemId);
  } catch {
    // ignored
  }
}

/* Enumerate every draft in localStorage. Expired entries are pruned
   in-place. Safe to call from a `useEffect` after mount; returns []
   in non-browser contexts. */
export function listBurnReportDrafts<TForm = Record<string, unknown>>(): BurnReportDraftEntry<TForm>[] {
  if (typeof window === "undefined") return [];
  const out: BurnReportDraftEntry<TForm>[] = [];
  try {
    const ls = window.localStorage;
    const expired: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      const raw = ls.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as BurnReportDraftPayload<TForm>;
        if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
          expired.push(key);
          continue;
        }
        out.push({ ...parsed, itemId: key.slice(STORAGE_PREFIX.length) });
      } catch {
        // Corrupted entry — drop it.
        expired.push(key);
      }
    }
    expired.forEach((k) => ls.removeItem(k));
  } catch {
    // ignored
  }
  return out;
}
