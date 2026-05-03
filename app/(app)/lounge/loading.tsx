/* ------------------------------------------------------------------
   Lounge home loading skeleton

   The Lounge home renders a list of forum categories. The actual page
   fetches categories + per-category stats. This skeleton renders ~6
   category-card placeholders.
   ------------------------------------------------------------------ */

export default function LoungeLoading() {
  return (
    <div className="px-4 sm:px-6 pt-6 pb-6 max-w-2xl mx-auto">
      {/* Page header */}
      <div className="animate-pulse mb-6">
        <div className="h-8 bg-muted rounded w-32 mb-3" />
        <div className="h-4 bg-muted rounded w-2/3" />
      </div>

      {/* Category cards */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-1/2" />
                <div className="h-3 bg-muted rounded w-3/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
