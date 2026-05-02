import { unstable_cache } from "next/cache";
import { createAnonClient } from "@/utils/supabase/anon";

/*
 * Cached read-only access to the news_items table.
 *
 * Tag: "news-items"
 * The cron sync route calls revalidateTag("news-items", { expire: 0 })
 * after each run so freshly-pulled articles propagate immediately. The
 * 5-min TTL is a fallback bound on staleness if revalidation ever
 * silently no-ops.
 */

export interface NewsItem {
  id:           string;
  source_name:  string;
  source_slug:  string;
  title:        string;
  link:         string;
  summary:      string | null;
  image_url:    string | null;
  published_at: string;
}

const SELECT_COLS = "id, source_name, source_slug, title, link, summary, image_url, published_at";

export const getLatestNews = unstable_cache(
  async (limit: number = 5): Promise<NewsItem[]> => {
    const supabase = createAnonClient();
    const { data } = await supabase
      .from("news_items")
      .select(SELECT_COLS)
      .order("published_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as NewsItem[];
  },
  ["news-latest"],
  { tags: ["news-items"], revalidate: 300 }
);

export const getNewsPage = unstable_cache(
  async (offset: number, limit: number): Promise<NewsItem[]> => {
    const supabase = createAnonClient();
    const { data } = await supabase
      .from("news_items")
      .select(SELECT_COLS)
      .order("published_at", { ascending: false })
      .range(offset, offset + limit - 1);
    return (data ?? []) as NewsItem[];
  },
  ["news-page"],
  { tags: ["news-items"], revalidate: 300 }
);
