/* ------------------------------------------------------------------
   Home loading skeleton

   The home dashboard does several server-side fetches in parallel
   (profile, aging shelf, shop count, latest news). On a slow 4G
   connection that's 400–900ms of blank screen without a skeleton.
   This renders the masthead area + four stacked card placeholders
   that approximate the real layout.
   ------------------------------------------------------------------ */

export default function HomeLoading() {
  return (
    <>
      {/* Masthead-shaped skeleton — sticky-ish height matches Masthead */}
      <header
        className="animate-pulse"
        style={{
          paddingTop:    "calc(env(safe-area-inset-top) + 14px)",
          paddingBottom: 18,
          background:    "rgba(26,18,16,0.88)",
          borderBottom:  "1px solid var(--line)",
        }}
      >
        <div className="px-4 sm:px-6 max-w-2xl mx-auto">
          <div style={{ height: 1, background: "var(--gold)", opacity: 0.5, marginBottom: 14 }} />
          <div className="h-8 bg-muted rounded w-2/3 mb-3" />
          <div className="h-5 bg-muted rounded w-1/2" />
        </div>
      </header>

      <div className="px-4 sm:px-6 pt-6 pb-6 flex flex-col gap-6 max-w-2xl mx-auto">
        {/* TonightsPairing — large primary CTA card */}
        <div className="card animate-pulse">
          <div className="h-3 bg-muted rounded w-1/4 mb-3" />
          <div className="h-6 bg-muted rounded w-3/4 mb-4" />
          <div className="h-12 bg-muted rounded" />
        </div>

        {/* Smoking conditions strip */}
        <div className="card animate-pulse">
          <div className="h-3 bg-muted rounded w-1/3 mb-3" />
          <div className="grid grid-cols-3 gap-3">
            <div className="h-12 bg-muted rounded" />
            <div className="h-12 bg-muted rounded" />
            <div className="h-12 bg-muted rounded" />
          </div>
        </div>

        {/* Aging shelf */}
        <div className="card animate-pulse">
          <div className="h-3 bg-muted rounded w-1/4 mb-4" />
          <div className="space-y-3">
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded w-5/6" />
          </div>
        </div>

        {/* News strip */}
        <div className="card animate-pulse">
          <div className="h-3 bg-muted rounded w-1/4 mb-4" />
          <div className="space-y-3">
            <div className="h-16 bg-muted rounded" />
            <div className="h-16 bg-muted rounded" />
          </div>
        </div>
      </div>
    </>
  );
}
