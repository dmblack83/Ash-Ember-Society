/**
 * Industry News scroll restoration.
 *
 * Tapping a news card opens the source article externally; on iOS PWA
 * the page can be evicted while the user reads, and the relaunch lands
 * back at the top of the feed with pagination reset. The feed persists
 * { scroll y, loaded page count } as the user scrolls and restores both
 * when the document is freshly (re)loaded.
 *
 * serialize/parse are pure (injected clock) for unit tests; NewsList
 * owns the storage access and the restore choreography.
 */

export const NEWS_RESTORE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface NewsRestoreState {
  y:    number; // window scroll position
  size: number; // useSWRInfinite loaded page count
}

export function serializeNewsRestore(state: NewsRestoreState, now: number): string {
  return JSON.stringify({ ...state, savedAt: now });
}

export function parseNewsRestore(json: string | null, now: number): NewsRestoreState | null {
  if (!json) return null;
  try {
    const obj = JSON.parse(json) as { y?: unknown; size?: unknown; savedAt?: unknown };
    if (
      typeof obj.savedAt !== "number" ||
      now - obj.savedAt > NEWS_RESTORE_TTL_MS ||
      typeof obj.y !== "number" ||
      typeof obj.size !== "number" ||
      obj.y < 0 ||
      obj.size < 1
    ) {
      return null;
    }
    return { y: obj.y, size: Math.floor(obj.size) };
  } catch {
    return null;
  }
}
