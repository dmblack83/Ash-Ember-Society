/*
 * CigarTitle — the canonical two-row cigar display name, rendered as
 * a fragment so it inherits whatever element wraps it (h1, p, h3):
 *
 *   Chateau Fuente Sun Grown
 *   "Queen B"
 *
 * The quoted vitola name renders as a block span (its own row) in the
 * parent's type style. Line-level surfaces (browse cards) have no
 * single vitola and keep using plain series text.
 */

import { cigarTitle, type CigarNameParts } from "@/lib/cigars/line-group";

export function CigarTitle({ cigar }: { cigar: CigarNameParts }) {
  return (
    <>
      {cigarTitle(cigar)}
      {cigar.series && cigar.name && (
        <span className="block">&ldquo;{cigar.name}&rdquo;</span>
      )}
    </>
  );
}
