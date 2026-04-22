/**
 * Cigar default image helpers
 *
 * Returns a wrapper-appropriate SVG from public/Cigar Default Images/
 * when a cigar has no real photo.  Uses substring matching so variants
 * like "Connecticut Shade" or "Habano Maduro" resolve correctly.
 */

import { wrapperDisplay } from "@/lib/country-name";

export function getCigarDefaultImage(wrapper: string | null | undefined): string {
  const w = wrapperDisplay(wrapper ?? "").toLowerCase().trim();

  // Oscuro (darkest)
  if (w.includes("oscuro")) return "/Cigar Default Images/Oscuro.png";

  // Maduro (dark)
  if (w.includes("maduro")) return "/Cigar Default Images/Maduro.png";

  // Connecticut / light wrappers
  if (
    w.includes("connecticut") ||
    w === "shade" ||
    w.includes("shade") ||
    w === "claro" ||
    w.includes("candela") ||
    w.includes("havana seed")
  ) return "/Cigar Default Images/Connecticut.png";

  // Colorado and medium wrappers
  if (w.includes("colorado")) return "/Cigar Default Images/Colorado.png";

  // Everything else (Habano, Corojo, Criollo, San Andres, Sumatra, Cameroon,
  // Broadleaf, Rosado, Arapiraca, Besuki, H-2000, Sungrown, etc.) → Colorado
  return "/Cigar Default Images/Colorado.png";
}

export function getCigarImage(
  imageUrl: string | null | undefined,
  wrapper: string | null | undefined,
): string {
  return imageUrl ?? getCigarDefaultImage(wrapper);
}
