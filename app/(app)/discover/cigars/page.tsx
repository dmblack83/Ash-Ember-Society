import { createClient }         from "@/utils/supabase/server";
import { DiscoverCigarsClient } from "@/components/cigars/DiscoverCigarsClient";
import type { CatalogResult }   from "@/components/cigar-search";

// Public catalog -- cache for 60 s, revalidate in background
export const revalidate = 60;

export default async function DiscoverCigarsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("cigar_catalog")
    .select(
      "id, brand, series, name, format, ring_gauge, length_inches, wrapper, wrapper_country, usage_count, image_url"
    )
    .order("usage_count", { ascending: false })
    .limit(20);

  const initialResults = (data ?? []) as CatalogResult[];

  return <DiscoverCigarsClient initialResults={initialResults} />;
}
