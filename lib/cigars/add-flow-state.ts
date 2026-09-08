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
  agingTarget:  string;   // "" (AgingTargetSelect default handles 2_weeks)
  notes:        string;   // ""
  agingSynced:  boolean;  // true until user edits either date
}

export function emptySaveForm(today: string): SaveFormState {
  return {
    quantity:     1,
    purchaseDate: today,
    priceStr:     "",
    source:       "",
    agingStart:   today,
    agingTarget:  "",
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
