/* Pure scroll math for the landing atmosphere + burn rail.
   Values come from the approved mockup (mockups/landing-comps/hybrid/script.js). */

const HERO_FADE_END = 0.12;
const FINALE_RETURN_START = 0.82;
const MID_PAGE_BLOOM = 0.15;
const RAIL_SCALE = 0.76; // ember finishes at the band, never past it
const WRITE_THRESHOLD = 0.0005;

export function pageProgress(scrollY: number, maxScroll: number): number {
  const max = Math.max(1, maxScroll);
  return Math.min(1, Math.max(0, scrollY) / max);
}

export function bloomLevel(p: number): number {
  if (p < HERO_FADE_END) return 1 - p * 5;
  if (p > FINALE_RETURN_START) {
    return (p - FINALE_RETURN_START) / (1 - FINALE_RETURN_START);
  }
  return MID_PAGE_BLOOM;
}

export function railDisplayPercent(p: number): number {
  return p * RAIL_SCALE * 100;
}

export function shouldWriteProgress(p: number, lastP: number): boolean {
  return Math.abs(p - lastP) >= WRITE_THRESHOLD;
}
