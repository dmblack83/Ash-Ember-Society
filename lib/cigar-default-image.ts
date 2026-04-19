/**
 * Cigar default image helpers
 *
 * Returns a wrapper-appropriate SVG from public/Cigar Default Images/
 * when a cigar has no real photo.  Uses substring matching so variants
 * like "Connecticut Shade" or "Habano Maduro" resolve correctly.
 */

export function getCigarDefaultImage(wrapper: string | null | undefined): string {
  const w = (wrapper ?? "").toLowerCase();
  if (w.includes("oscuro"))                                          return "/Cigar Default Images/Oscuro.png";
  if (w.includes("maduro"))                                          return "/Cigar Default Images/Maduro.png";
  if (w.includes("colorado claro") || w.includes("colorado clairo")) return "/Cigar Default Images/Colorado Claro.png";
  if (w.includes("colorado"))                                        return "/Cigar Default Images/Colorado.png";
  if (w.includes("connecticut"))                                     return "/Cigar Default Images/Connecticut.png";
  return "/Cigar Default Images/Colorado.png";
}

export function getCigarImage(
  imageUrl: string | null | undefined,
  wrapper: string | null | undefined,
): string {
  return imageUrl ?? getCigarDefaultImage(wrapper);
}
