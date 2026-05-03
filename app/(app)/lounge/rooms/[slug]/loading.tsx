/* ------------------------------------------------------------------
   Lounge category feed loading skeleton

   The category feed is the heaviest fetch in the lounge: forum_posts
   + author profiles + smoke_logs + burn_reports + flavor_tag names.
   Renders ~4 post-card placeholders to set expectations during the
   server fetch. Skips burn-report card variants — generic post shape
   is close enough for a skeleton.
   ------------------------------------------------------------------ */

export default function LoungeCategoryLoading() {
  return (
    <div className="px-4 sm:px-6 pt-6 pb-6 max-w-2xl mx-auto">
      {/* Header — back button + category title */}
      <div className="animate-pulse mb-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-muted flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-muted rounded w-1/4" />
          <div className="h-6 bg-muted rounded w-1/2" />
        </div>
      </div>

      {/* Post cards */}
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse"
            style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14 }}
          >
            <div className="px-4 pt-4 pb-3">
              {/* Author row */}
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-muted rounded w-1/3" />
                  <div className="h-2.5 bg-muted rounded w-1/4" />
                </div>
              </div>

              {/* Title */}
              <div className="h-4 bg-muted rounded w-3/4 mb-2" />

              {/* Body lines */}
              <div className="space-y-2 mt-2">
                <div className="h-3 bg-muted rounded w-full" />
                <div className="h-3 bg-muted rounded w-5/6" />
                <div className="h-3 bg-muted rounded w-4/6" />
              </div>

              {/* Action bar */}
              <div className="flex justify-end gap-4 mt-4">
                <div className="h-4 bg-muted rounded w-12" />
                <div className="h-4 bg-muted rounded w-12" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
