/**
 * Save-step form state for the unified add-cigar flow (SaveStep).
 *
 * Pure functions only — no React, no Supabase — so the purchase-date /
 * aging-start sync rule is unit-testable in isolation. Every setter
 * returns a new object; callers own the state (useState in SaveStep's
 * host, e.g. AddCigarSheet).
 */

export interface SaveFormState {
  quantity:     number;   // 1
  purchaseDate: string;   // today ISO date
  priceStr:     string;   // ""
  source:       string;   // ""
  agingStart:   string;   // today
  agingTarget:  string;   // today + 14 days (the 2 Weeks preset)
  notes:        string;   // ""
  agingSynced:  boolean;  // true until user edits either date
}

/* 2 Weeks preset offset — mirrors AgingTargetSelect's AGING_PRESETS
   "2_weeks" entry (days: 14). */
const DEFAULT_AGING_TARGET_DAYS = 14;

/* The 2 Weeks preset date, computed from the caller's `today` string.
   The collapsed save step never mounts AgingTargetSelect, so the form
   must START with the value the select would have emitted — otherwise
   a collapsed save writes aging_target_date null where today's
   always-mounted form writes today+14. AgingTargetSelect mounted with
   this value renders the 2 Weeks preset as selected (dateToPreset's
   ±1 day tolerance absorbs any local/UTC midnight skew). */
export function defaultAgingTarget(today: string): string {
  const d = new Date(today + "T00:00:00");
  d.setDate(d.getDate() + DEFAULT_AGING_TARGET_DAYS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function emptySaveForm(today: string): SaveFormState {
  return {
    quantity:     1,
    purchaseDate: today,
    priceStr:     "",
    source:       "",
    agingStart:   today,
    agingTarget:  defaultAgingTarget(today),
    notes:        "",
    agingSynced:  true,
  };
}

/* Purchase-date change: agingStart follows while agingSynced. */
export function setPurchaseDate(s: SaveFormState, date: string): SaveFormState {
  return {
    ...s,
    purchaseDate: date,
    agingStart:   s.agingSynced ? date : s.agingStart,
  };
}

/* Aging-start change: breaks the sync. */
export function setAgingStart(s: SaveFormState, date: string): SaveFormState {
  return {
    ...s,
    agingStart:  date,
    agingSynced: false,
  };
}
