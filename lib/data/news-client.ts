"use client";

/*
 * Client-side news fetch — public data, same projection as the server
 * getLatestNews (lib/data/news.ts). news_items is anon-readable, so
 * the browser client (same anon key) reads it directly. Pairs with
 * keyFor.newsLatest; SWR keeps revisits instant while the cron-synced
 * table revalidates in the background.
 */

import { createClient } from "@/utils/supabase/client";
import type { NewsItem } from "@/lib/data/news";

export async function fetchLatestNews(limit: number = 5): Promise<NewsItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("news_items")
    .select("id, source_name, source_slug, title, link, summary, image_url, published_at")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as NewsItem[];
}
