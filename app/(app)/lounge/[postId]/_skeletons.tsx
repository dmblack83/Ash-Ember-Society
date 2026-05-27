/*
 * Shared skeleton for the Lounge post-detail route. Used by:
 *  - `loading.tsx` (rendered during client-side route prefetch
 *    before the page tree mounts)
 *  - the in-page `<Suspense>` fallback around `PostDetailDataIsland`
 *    in `page.tsx` (rendered while the data fetch is still resolving)
 *
 * Same shape both places so the swap between prefetch skeleton →
 * Suspense skeleton → real content doesn't shift the page.
 */

export function PostDetailSkeleton() {
  return (
    <div className="px-4 sm:px-6 pt-6 pb-6 max-w-2xl mx-auto">
      {/* Back link + category breadcrumb */}
      <div className="animate-pulse mb-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-muted flex-shrink-0" />
        <div className="h-3 bg-muted rounded w-1/3" />
      </div>

      {/* Post card */}
      <div
        className="animate-pulse"
        style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14 }}
      >
        <div className="px-4 pt-4 pb-4">
          {/* Author row */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-full bg-muted flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-muted rounded w-1/3" />
              <div className="h-2.5 bg-muted rounded w-1/4" />
            </div>
          </div>

          {/* Title */}
          <div className="h-5 bg-muted rounded w-3/4 mb-3" />

          {/* Body lines */}
          <div className="space-y-2">
            <div className="h-3 bg-muted rounded w-full" />
            <div className="h-3 bg-muted rounded w-full" />
            <div className="h-3 bg-muted rounded w-5/6" />
            <div className="h-3 bg-muted rounded w-4/6" />
          </div>

          {/* Action bar */}
          <div className="flex gap-4 mt-4">
            <div className="h-4 bg-muted rounded w-12" />
            <div className="h-4 bg-muted rounded w-16" />
          </div>
        </div>
      </div>

      {/* Comments section header */}
      <div className="animate-pulse mt-6 mb-3">
        <div className="h-4 bg-muted rounded w-24" />
      </div>

      {/* Comment placeholders */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse"
            style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }}
          >
            <div className="px-3 pt-3 pb-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-muted rounded w-1/4" />
                  <div className="h-2.5 bg-muted rounded w-1/5" />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="h-3 bg-muted rounded w-full" />
                <div className="h-3 bg-muted rounded w-4/5" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
