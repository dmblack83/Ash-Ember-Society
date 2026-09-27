import type { UpdateVitolaOp, VitolaRow } from "./types";

const GEN = "rules-format-name";
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** name = the full current label; format = the longest canonical shape it contains as whole words. */
export function splitFormat(format: string, formats: string[]): { name: string; format: string } | null {
  const label = format.trim().replace(/\s+/g, " ");
  const lower = label.toLowerCase();
  const canonical = new Set(formats.map((f) => f.toLowerCase()));
  if (canonical.has(lower)) return null;
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
    const split = splitFormat(v.format, formats);
    if (!split && formats.some((f) => f.toLowerCase() === v.format!.trim().toLowerCase())) continue; // already canonical, not a candidate
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
