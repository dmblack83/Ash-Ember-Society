import type { UpdateVitolaOp, VitolaRow } from "./types";

const GEN = "rules-format-name";
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const normalizeLabel = (s: string) => s.trim().replace(/\s+/g, " ");

export const isCanonicalFormat = (label: string, formats: string[]) =>
  formats.some((f) => f.toLowerCase() === normalizeLabel(label).toLowerCase());

/** name = the full current label; format = the longest canonical shape it contains as whole words. */
export function splitFormat(format: string, formats: string[]): { name: string; format: string } | null {
  const label = normalizeLabel(format);
  if (isCanonicalFormat(label, formats)) return null;
  const lower = label.toLowerCase();
  let best: string | null = null;
  for (const f of formats) {
    if (f.length <= 3) continue;
    if (new RegExp(`(^|\\s)${escapeRe(f.toLowerCase())}(\\s|$)`).test(lower) && (!best || f.length > best.length)) best = f;
  }
  return best ? { name: label, format: best } : null;
}

export function generateFormatName(vitolas: VitolaRow[], formats: string[]) {
  const ops: UpdateVitolaOp[] = [];
  const summary = { candidates: 0, splittable: 0, untouched: 0, communityAdded: 0 };
  for (const v of vitolas) {
    if (v.name !== null || !v.format) continue;
    if (isCanonicalFormat(v.format, formats)) continue; // already canonical, not a candidate
    const split = splitFormat(v.format, formats);
    summary.candidates++;
    if (!split) { summary.untouched++; continue; }
    summary.splittable++;
    if (v.community_added) summary.communityAdded++;
    ops.push({
      type: "update_vitola", vitolaId: v.id, fields: { name: split.name, format: split.format }, generator: GEN, reviewed: false,
      reason: `format "${v.format}" carries a vitola name; shape token "${split.format}"${v.community_added ? " (community-added row)" : ""}`,
    });
  }
  return { ops, summary };
}
