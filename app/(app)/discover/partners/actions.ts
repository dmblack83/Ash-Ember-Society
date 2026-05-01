"use server";

import { getNewsPage } from "@/lib/data/news";
import type { NewsItem } from "@/lib/data/news";

/**
 * Server action invoked by the client "Load more" button.
 * Hits the same `unstable_cache`-wrapped fetcher the server page
 * uses, so subsequent pages within the cache TTL are essentially free.
 */
export async function loadMoreNews(offset: number, limit: number): Promise<NewsItem[]> {
  return getNewsPage(offset, limit);
}
