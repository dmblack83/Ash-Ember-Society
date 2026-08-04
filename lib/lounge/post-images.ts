/*
 * Normalizes a lounge post's image columns into one display list.
 *
 * forum_posts carries BOTH the legacy single `image_url` (kept in sync
 * with the first image so stale clients keep working) and the newer
 * `image_urls` array (up to MAX_POST_IMAGES). Readers should never
 * touch the columns directly — always go through postImages().
 */

export const MAX_POST_IMAGES = 3;

export function postImages(
  imageUrl: string | null | undefined,
  imageUrls: (string | null)[] | null | undefined,
): string[] {
  const fromArray = (imageUrls ?? []).filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0,
  );
  if (fromArray.length > 0) return fromArray.slice(0, MAX_POST_IMAGES);
  return imageUrl && imageUrl.trim().length > 0 ? [imageUrl] : [];
}
