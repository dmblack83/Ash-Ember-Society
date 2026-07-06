/*
 * Unified lounge feed: chip and view definitions + URL param helpers.
 *
 * Chips are the category filter row (/lounge?c=<chip>). Chip values are
 * short URL-facing forms; categorySlug maps each chip to the real
 * forum_categories.slug. "welcome" was folded into General Discussion
 * (migration 20260705) so it maps to the general chip for old links.
 *
 * The secondary row is one contextual slot (?v=<view>):
 *   - feedback chip:  open (default) | closed | mine
 *   - everything else: new (default) | hot | mine
 */

export type ChipValue    = "all" | "general" | "burn-reports" | "feedback";
export type FeedView     = "new" | "hot" | "mine";
export type FeedbackView = "open" | "closed" | "mine";
export type LoungeFilter = "all" | "mine" | "open" | "closed";
export type LoungeSort   = "new" | "hot";

export interface ChipDef {
  value:        ChipValue;
  label:        string;
  categorySlug: string | null;
}

export const CHIPS: readonly ChipDef[] = [
  { value: "all",          label: "All",          categorySlug: null },
  { value: "general",      label: "General",      categorySlug: "general-discussion" },
  { value: "burn-reports", label: "Burn Reports", categorySlug: "burn-reports" },
  { value: "feedback",     label: "Feedback",     categorySlug: "product-feedback" },
] as const;

export function parseChip(c: string | null | undefined): ChipValue {
  return CHIPS.some((chip) => chip.value === c) ? (c as ChipValue) : "all";
}

export function parseView(
  v: string | null | undefined,
  isFeedback: boolean,
): FeedView | FeedbackView {
  if (isFeedback) return v === "closed" || v === "mine" ? v : "open";
  return v === "hot" || v === "mine" ? v : "new";
}

export function categorySlugForChip(chip: ChipValue): string | null {
  return CHIPS.find((c) => c.value === chip)?.categorySlug ?? null;
}

export function chipForCategorySlug(slug: string): ChipValue | null {
  if (slug === "welcome") return "general";
  return CHIPS.find((c) => c.categorySlug === slug)?.value ?? null;
}

/* Query string for the /lounge/rooms/[slug] redirect route. Unknown
   slugs land on the plain feed (empty string). */
export function roomRedirectQuery(slug: string): string {
  const chip = chipForCategorySlug(slug);
  return chip && chip !== "all" ? `?c=${chip}` : "";
}

/* Map a secondary-row view onto fetcher params. "Hot" and "My Posts"
   are mutually exclusive views, so hot never combines with mine. */
export function feedParamsForView(
  view: FeedView | FeedbackView,
): { filter: LoungeFilter; sort: LoungeSort } {
  if (view === "hot")  return { filter: "all",  sort: "hot" };
  if (view === "mine") return { filter: "mine", sort: "new" };
  if (view === "open" || view === "closed") return { filter: view, sort: "new" };
  return { filter: "all", sort: "new" };
}
