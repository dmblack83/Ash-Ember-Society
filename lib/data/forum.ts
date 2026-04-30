import { unstable_cache } from "next/cache";
import { createAnonClient } from "@/utils/supabase/anon";

/*
 * Cached read-only access to public forum metadata.
 *
 * Tags:
 *   "forum-categories" — list of categories (rarely changes)
 *   "forum-stats"      — per-category post counts (5-min TTL; OK to be slightly stale)
 *
 * Forum post mutations happen client-side via the Supabase JS client, so
 * `revalidateTag("forum-stats")` cannot be invoked from those paths. The
 * 5-minute TTL is the bound on staleness for category counts shown on the
 * Lounge home page.
 */

export interface ForumCategory {
  id:           string;
  name:         string;
  slug:         string;
  description:  string | null;
  sort_order:   number;
  is_locked:    boolean;
  is_gate:      boolean;
  is_feedback:  boolean;
}

export interface ForumCategoryStat {
  category_id:   string;
  post_count:    number;
  last_post_at:  string | null;
}

export const getAllForumCategories = unstable_cache(
  async (): Promise<ForumCategory[]> => {
    const supabase = createAnonClient();
    const { data } = await supabase
      .from("forum_categories")
      .select("id, name, slug, description, sort_order, is_locked, is_gate, is_feedback")
      .order("sort_order");
    return (data ?? []) as ForumCategory[];
  },
  ["forum-categories"],
  { tags: ["forum-categories"], revalidate: 3600 }
);

export const getForumCategoryStats = unstable_cache(
  async (): Promise<ForumCategoryStat[]> => {
    const supabase = createAnonClient();
    const { data } = await supabase.rpc("get_forum_category_stats");
    const rows = (data ?? []) as { category_id: string; post_count: number | string; last_post_at: string | null }[];
    return rows.map((r) => ({
      category_id:  r.category_id,
      post_count:   Number(r.post_count),
      last_post_at: r.last_post_at,
    }));
  },
  ["forum-category-stats"],
  { tags: ["forum-stats"], revalidate: 300 }
);
