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
