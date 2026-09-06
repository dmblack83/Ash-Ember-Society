import { DiscoverCigarsClient } from "@/components/cigars/DiscoverCigarsClient";
import { PullToRefresh }        from "@/components/ui/PullToRefresh";

/* Static shell — the brand index and all search results load
   client-side with the user's session (anon catalog reads return
   zero rows by design, so a server fetch here would seed nothing). */
export default function DiscoverCigarsPage() {
  return (
    <PullToRefresh>
      <DiscoverCigarsClient />
    </PullToRefresh>
  );
}
