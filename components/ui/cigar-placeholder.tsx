/* ------------------------------------------------------------------
   Shared cigar placeholder components
   ------------------------------------------------------------------ */

/** Small cigar SVG — used in catalog cards, wishlist cards */
export function CigarPlaceholder() {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <svg
        width="96"
        height="28"
        viewBox="0 0 96 28"
        fill="none"
        aria-hidden="true"
        className="text-muted-foreground/30"
      >
        <rect x="8" y="9" width="68" height="10" rx="5" fill="currentColor" />
        <ellipse cx="76" cy="14" rx="12" ry="6" fill="currentColor" opacity="0.65" />
        <rect x="4" y="9" width="6" height="10" rx="2" fill="currentColor" opacity="0.45" />
        <rect x="26" y="9" width="11" height="10" rx="1" fill="currentColor" opacity="0.22" />
        <ellipse cx="5" cy="14" rx="3.5" ry="3.5" fill="#E8642C" opacity="0.4" />
      </svg>
    </div>
  );
}

/** Large cigar SVG — used in cigar detail hero */
export function CigarPlaceholderLarge() {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <svg
        width="160"
        height="44"
        viewBox="0 0 160 44"
        fill="none"
        aria-hidden="true"
        className="text-muted-foreground/25"
      >
        <rect x="12" y="14" width="116" height="16" rx="8" fill="currentColor" />
        <ellipse cx="128" cy="22" rx="20" ry="10" fill="currentColor" opacity="0.65" />
        <rect x="6" y="14" width="10" height="16" rx="4" fill="currentColor" opacity="0.45" />
        <rect x="42" y="14" width="18" height="16" rx="2" fill="currentColor" opacity="0.22" />
        <ellipse cx="8" cy="22" rx="5" ry="5" fill="#E8642C" opacity="0.4" />
      </svg>
    </div>
  );
}

/**
 * Brand-initial placeholder — deterministic muted color per brand name.
 * Used on humidor grid/list cards.
 */
export function BrandPlaceholder({ brand }: { brand: string }) {
  let hash = 0;
  for (let i = 0; i < brand.length; i++) {
    hash = (hash << 5) - hash + brand.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return (
    <div
      className="flex items-center justify-center w-full h-full text-2xl font-semibold select-none"
      style={{
        backgroundColor: `hsl(${hue}, 18%, 16%)`,
        color: `hsl(${hue}, 35%, 60%)`,
        fontFamily: "var(--font-serif)",
      }}
    >
      {brand.charAt(0).toUpperCase()}
    </div>
  );
}
