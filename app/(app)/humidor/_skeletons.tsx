/*
 * Shared skeleton for the Humidor route. Used by:
 *  - `loading.tsx` (rendered during client-side route prefetch
 *    before the page tree mounts)
 *  - the in-page `<Suspense>` fallback around `HumidorDataIsland`
 *    in `page.tsx` (rendered while the data fetch is still resolving)
 *
 * Same shape both places so the swap between prefetch skeleton →
 * Suspense skeleton → real content doesn't shift the page.
 */

import { SkeletonListRow } from "@/components/ui/skeleton-card";

export function HumidorShellSkeleton() {
  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* Fixed-header skeleton (tab nav row + title row) */}
      <div
        className="fixed top-0 left-0 right-0 z-30 animate-pulse"
        style={{
          background:   "var(--background)",
          borderBottom: "1px solid var(--border)",
          paddingTop:   "env(safe-area-inset-top)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          {/* Tabs */}
          <div className="flex gap-6 border-b border-border/50 pt-4 pb-3">
            <div className="h-4 bg-muted rounded w-16" />
            <div className="h-4 bg-muted rounded w-16" />
            <div className="h-4 bg-muted rounded w-24" />
            <div className="h-4 bg-muted rounded w-12" />
          </div>
          {/* Title + count */}
          <div className="flex items-baseline gap-3 pt-4 pb-3">
            <div className="h-8 bg-muted rounded w-32" />
            <div className="h-3 bg-muted rounded w-16" />
          </div>
        </div>
      </div>

      {/* Spacer matching fixed-header height */}
      <div style={{ height: 124 }} aria-hidden="true" />

      {/* List body */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col gap-2">
        <SkeletonListRow />
        <SkeletonListRow />
        <SkeletonListRow />
        <SkeletonListRow />
      </div>
    </div>
  );
}
