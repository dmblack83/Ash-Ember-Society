/*
 * Pure index math for a looping, one-visible carousel.
 *
 * ringOffset maps each slide to its position relative to the active
 * slide, wrapped to the nearest side so the carousel loops: the active
 * slide is 0, the next is +1, the previous is -1 (the previous of slide
 * 0 wraps to the last slide, etc.). Offscreen slides sit at ±1 and are
 * translated out of view; this is what makes the loop seamless without
 * cloning DOM nodes.
 */

export function wrapIndex(i: number, n: number): number {
  return ((i % n) + n) % n;
}

export function ringOffset(i: number, active: number, n: number): number {
  let d = wrapIndex(i - active, n); // 0 .. n-1
  if (d * 2 > n) d -= n;            // bring the far half to the negative side
  return d;
}
