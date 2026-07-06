import { unstable_cache } from "next/cache";
import { createAnonClient } from "@/utils/supabase/anon";

/*
 * Cached read-only access to public forum metadata.
 *
 * Tags:
 *   "forum-categories" — list of categories (rarely changes)
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
