/* ------------------------------------------------------------------
   Burn Reports list loading skeleton

   Each saved report renders as a full Verdict Card now (no collapse).
   Each card is tall (~500–700px) so showing two skeleton placeholders
   is enough to set expectations without making the loading state
   feel busier than the loaded state.
   ------------------------------------------------------------------ */

export default function BurnReportsLoading() {
  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* Fixed-header skeleton */}
      <div
        className="fixed top-0 left-0 right-0 z-30 animate-pulse"
        style={{
          background:   "var(--background)",
          borderBottom: "1px solid var(--border)",
          paddingTop:   "env(safe-area-inset-top)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex gap-6 border-b border-border/50 pt-4 pb-3">
            <div className="h-4 bg-muted rounded w-16" />
            <div className="h-4 bg-muted rounded w-16" />
            <div className="h-4 bg-muted rounded w-24" />
            <div className="h-4 bg-muted rounded w-12" />
          </div>
          <div className="flex items-baseline gap-3 pt-4 pb-3">
            <div className="h-8 bg-muted rounded w-32" />
            <div className="h-3 bg-muted rounded w-16" />
          </div>
        </div>
      </div>

      <div style={{ height: 124 }} aria-hidden="true" />

      {/* Verdict-card-shaped skeletons */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col gap-10">
        <VerdictCardSkeleton />
        <VerdictCardSkeleton />
      </div>
    </div>
  );
}

function VerdictCardSkeleton() {
  return (
    <div
      className="animate-pulse"
      style={{
        background:   "var(--card)",
        border:       "1px solid var(--line)",
        borderRadius: 4,
        padding:      22,
      }}
    >
      {/* Masthead */}
      <div style={{ height: 1, background: "var(--line)", marginBottom: 12 }} />
      <div className="h-3 bg-muted rounded mx-auto mb-3" style={{ width: "60%" }} />
      <div style={{ height: 1, background: "var(--line)", marginBottom: 22 }} />

      {/* Identity */}
      <div className="flex flex-col items-center gap-2 mb-6">
        <div className="h-3 bg-muted rounded w-24" />
        <div className="h-7 bg-muted rounded w-3/4" />
      </div>

      {/* Score block */}
      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "auto 1fr",
          gap:                 18,
          alignItems:          "center",
          padding:             "22px 0",
          borderTop:           "1px solid var(--line-soft)",
          borderBottom:        "1px solid var(--line-soft)",
        }}
      >
        <div className="h-16 bg-muted rounded" style={{ width: 72 }} />
        <div className="space-y-2">
          <div className="h-5 bg-muted rounded w-1/2" />
          <div className="h-3 bg-muted rounded w-1/3" />
        </div>
      </div>

      {/* Sub-ratings stripe */}
      <div className="grid grid-cols-4 gap-2 mt-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2 flex flex-col items-center">
            <div className="h-2 bg-muted rounded w-full" />
            <div className="h-3 bg-muted rounded w-3/4" />
          </div>
        ))}
      </div>

      {/* Photo strip */}
      <div className="bg-muted rounded mt-6" style={{ aspectRatio: "16 / 10" }} />

      {/* Specs strip */}
      <div className="grid grid-cols-3 gap-2 mt-7 pt-5 border-t border-[var(--line-soft)]">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 flex flex-col items-center">
            <div className="h-2 bg-muted rounded w-2/3" />
            <div className="h-4 bg-muted rounded w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
