import { unstable_cache } from "next/cache";
import { createAnonClient } from "@/utils/supabase/anon";

/*
 * Cached read-only access to the public cigar_catalog table.
 *
 * Cache tag: "cigar-catalog"
 * Mutations (admin approval, catalog imports) call revalidateTag to bust.
 */

export interface PopularCigar {
  id:              string;
  brand:           string | null;
  series:          string | null;
  format:          string | null;
  ring_gauge:      number | null;
  length_inches:   number | null;
  wrapper:         string | null;
  wrapper_country: string | null;
  usage_count:     number;
  image_url:       string | null;
}

export interface CigarDetail extends PopularCigar {
  binder_country:    string | null;
  filler_countries:  string[] | null;
  community_added:   boolean;
  approved:          boolean;
}

export const getPopularCigars = unstable_cache(
  async (limit: number = 20): Promise<PopularCigar[]> => {
    const supabase = createAnonClient();
    const { data } = await supabase
      .from("cigar_catalog")
      .select("id, brand, series, format, ring_gauge, length_inches, wrapper, wrapper_country, usage_count, image_url")
      .order("usage_count", { ascending: false })
      .limit(limit);
    return (data ?? []) as PopularCigar[];
  },
  ["cigar-popular"],
  { tags: ["cigar-catalog"], revalidate: 3600 }
);

export const getCigarById = unstable_cache(
  async (id: string): Promise<CigarDetail | null> => {
    const supabase = createAnonClient();
    const { data } = await supabase
      .from("cigar_catalog")
      .select("id, brand, series, format, wrapper, wrapper_country, binder_country, filler_countries, ring_gauge, length_inches, usage_count, community_added, approved, image_url")
      .eq("id", id)
      .single();
    return (data as CigarDetail | null) ?? null;
  },
  ["cigar-by-id"],
  { tags: ["cigar-catalog"], revalidate: 3600 }
);
