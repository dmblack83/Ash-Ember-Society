/*
 * Shared skeleton for the unified Lounge feed route. Used by:
 *  - `loading.tsx` (rendered during client-side route prefetch
 *    before the page tree mounts)
 *  - the in-page `<Suspense>` fallback around `LoungeFeedDataIsland`
 *    in `page.tsx` (rendered while the data fetch is still resolving)
 *
 * Same shape both places so the swap between prefetch skeleton →
 * Suspense skeleton → real content doesn't shift the page.
 */

export function LoungeShellSkeleton() {
  return (
    <div style={{ minHeight: "100dvh", backgroundColor: "var(--background)" }}>
      {/* Stacked header placeholder: title + chips + secondary rows */}
      <div
        style={{
          position: "fixed", top: 0, left: "var(--app-content-left)", right: 0,
          zIndex: 40, height: 148, backgroundColor: "rgba(26,18,16,0.97)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="px-4 md:max-w-[50%] md:mx-auto">
          <div className="animate-pulse rounded" style={{ width: 120, height: 22, marginTop: 18, backgroundColor: "var(--card)" }} />
          <div className="flex gap-2" style={{ marginTop: 20 }}>
            {[72, 84, 110, 92].map((w, i) => (
              <div key={i} className="animate-pulse rounded-full" style={{ width: w, height: 30, backgroundColor: "var(--card)" }} />
            ))}
          </div>
          <div className="flex gap-5" style={{ marginTop: 14 }}>
            {[36, 30, 60].map((w, i) => (
              <div key={i} className="animate-pulse rounded" style={{ width: w, height: 14, backgroundColor: "var(--card)" }} />
            ))}
          </div>
        </div>
      </div>

      {/* Feed card placeholders */}
      <div className="px-4 flex flex-col gap-3 w-full md:max-w-[50%] md:mx-auto" style={{ paddingTop: 160 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="animate-pulse rounded-2xl" style={{ height: 150, backgroundColor: "var(--card)", border: "1px solid var(--border)" }} />
        ))}
      </div>
    </div>
  );
}
