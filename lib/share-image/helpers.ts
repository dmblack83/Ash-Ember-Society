import type { ShareImageProps } from "./types";

export function gradeFor(v: number): string {
  if (v <= 20) return "Poor";
  if (v <= 40) return "Below Average";
  if (v <= 60) return "Average";
  if (v <= 80) return "Good";
  return "Outstanding";
}

export function starFillPct(s: number, val: number): number {
  if (s <= Math.floor(val))                            return 100;
  if (s === Math.ceil(val) && val > Math.floor(val))   return Math.round((val - Math.floor(val)) * 100);
  return 0;
}

export function shouldRenderPage2(p: ShareImageProps): boolean {
  const hasThirds = p.thirdsEnabled &&
    Boolean(p.thirdBeginning?.trim() || p.thirdMiddle?.trim() || p.thirdEnd?.trim());
  return hasThirds || Boolean(p.reviewText?.trim()) || p.flavorTagNames.length > 0;
}

/* Clamp prose so it fits a bounded box on the share card. Cuts at a word
   boundary near maxChars and appends an ellipsis; short text is returned
   trimmed and unchanged. Char-based (not line-based) because Satori gives
   us no font metrics — maxChars is tuned per field to a target line count
   at that field's font size. */
export function clampText(text: string | null | undefined, maxChars: number): string {
  const t = (text ?? "").trim();
  if (t.length <= maxChars) return t;
  const slice     = t.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  const cut       = lastSpace > maxChars * 0.6 ? slice.slice(0, lastSpace) : slice;
  return cut.replace(/[\s.,;:!?]+$/, "") + "…";
}
