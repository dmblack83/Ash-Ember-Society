/**
 * Add-cigar unified flow — entry points + stage routing.
 *
 * Pure, framework-free so the routing rule (which stage each entry
 * point opens the sheet at) is unit-testable without pulling in
 * AddFlowSheet's React/Supabase/SWR dependency graph. AddFlowSheet.tsx
 * re-exports these for consumers that import the sheet's public API.
 */

export type AddFlowEntry =
  | { kind: "search"; query?: string }                    // humidor add; scanner no-match handoff
  | { kind: "line"; brand: string | null; series: string | null; fromScan?: boolean }
  | { kind: "vitola"; cigarId: string }                   // detail page, wishlist promote
  | { kind: "manual"; brand?: string };                   // scanner no-match manual

export type AddFlowStage = "search" | "picker" | "manual" | "save";

/* Each entry point lands on exactly one stage: a flat line search, a
   line already known (scanner match / band tap) skips straight to the
   vitola picker, a resolved catalog row skips straight to save, and a
   forced manual entry (no catalog match at all) opens the form. */
export function stageForEntry(entry: AddFlowEntry): AddFlowStage {
  switch (entry.kind) {
    case "search": return "search";
    case "line":   return "picker";
    case "vitola": return "save";
    case "manual": return "manual";
  }
}
