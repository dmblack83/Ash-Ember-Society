import { T } from "./tokens";
import type { ShareImageProps } from "./types";

/* Contain math for photo cells: scale the image to fit inside the cell
   without cropping (mirrors the VerdictCard "scale to FIT, never crop"
   rule). Computed in JS because Satori's own object-fit needs to sniff
   intrinsic dimensions from the data URI; explicit sizes are deterministic.
   Unknown dimensions fall back to the full cell. */
export function fitWithin(
  imgW: number | null,
  imgH: number | null,
  cellW: number,
  cellH: number,
): { width: number; height: number } {
  if (!imgW || !imgH) return { width: cellW, height: cellH };
  const scale = Math.min(cellW / imgW, cellH / imgH);
  return {
    width:  Math.min(cellW, Math.round(imgW * scale)),
    height: Math.min(cellH, Math.round(imgH * scale)),
  };
}

/* Row height for equal side-by-side photo cells: the tallest photo's
   fitted height at the cell width, capped at PHOTO_BAND_H. Shorter photos
   letterbox inside; a row of landscapes doesn't reserve dead backdrop.
   Any unknown dimensions fall back to the full band. */
export function photoRowHeight(
  photos: Array<{ width: number | null; height: number | null }>,
  cellW: number,
): number {
  const heights = photos.map((p) =>
    p.width && p.height ? Math.round(cellW * (p.height / p.width)) : T.PHOTO_BAND_H,
  );
  return Math.min(T.PHOTO_BAND_H, Math.max(...heights));
}

/* Single-photo band: use the photo's natural aspect ratio at content width
   (like the in-app report card), capped at PHOTO_MAX_H so a tall portrait
   can't stretch page 1 far past the square and shrink the text. */
export function singlePhotoBandHeight(imgW: number | null, imgH: number | null): number {
  if (!imgW || !imgH) return T.PHOTO_BAND_H;
  return Math.min(Math.round(T.CONTENT_WIDTH * (imgH / imgW)), T.PHOTO_MAX_H);
}

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
