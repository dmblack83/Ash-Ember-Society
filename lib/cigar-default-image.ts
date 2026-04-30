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
  if (w.includes("oscuro")) return "/Cigar Default Images/Oscuro.webp";

  // Maduro (dark)
  if (w.includes("maduro")) return "/Cigar Default Images/Maduro.webp";

  // Connecticut / light wrappers
  if (
    w.includes("connecticut") ||
    w === "shade" ||
    w.includes("shade") ||
    w === "claro" ||
    w.includes("candela") ||
    w.includes("havana seed")
  ) return "/Cigar Default Images/Connecticut.webp";

  // Colorado and medium wrappers
  if (w.includes("colorado")) return "/Cigar Default Images/Colorado.webp";

  // Everything else (Habano, Corojo, Criollo, San Andres, Sumatra, Cameroon,
  // Broadleaf, Rosado, Arapiraca, Besuki, H-2000, Sungrown, etc.) → Colorado
  return "/Cigar Default Images/Colorado.webp";
}

export function getCigarImage(
  imageUrl: string | null | undefined,
  wrapper: string | null | undefined,
): string {
  return imageUrl ?? getCigarDefaultImage(wrapper);
}
