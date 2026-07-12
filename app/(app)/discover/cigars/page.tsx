import { DiscoverCigarsClient } from "@/components/cigars/DiscoverCigarsClient";
import { PullToRefresh }        from "@/components/ui/PullToRefresh";
import type { CatalogResult }   from "@/components/cigar-search";
import { getPopularCigars }     from "@/lib/data/cigar-catalog";

// Public catalog -- cache for 60 s, revalidate in background
export const runtime    = "edge";
export const revalidate = 60;

export default async function DiscoverCigarsPage() {
  const initialResults: CatalogResult[] = await getPopularCigars(20);
  return (
    <PullToRefresh>
      <DiscoverCigarsClient initialResults={initialResults} />
    </PullToRefresh>
  );
}
