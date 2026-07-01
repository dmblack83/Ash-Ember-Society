/*
 * Shared skeleton for the Stats route. Used by `loading.tsx` (route
 * prefetch) and `StatsRoute.tsx` (session + first data load). Mirrors
 * the header + stat-tile grid + chart cards so the swap to real
 * content doesn't shift layout.
 */

export function StatsShellSkeleton() {
  return (
    <div className="min-h-screen animate-pulse" style={{ background: "var(--background)" }}>
      {/* Header */}
      <div
        className="border-b"
        style={{ borderColor: "var(--border)", paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 space-y-3">
          <div className="h-4 bg-muted rounded w-20" />
          <div className="h-8 bg-muted rounded w-40" />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl border"
              style={{ background: "var(--card)", borderColor: "var(--border)", height: 88 }}
            />
          ))}
        </div>

        {/* Chart cards */}
        {[0, 1].map((i) => (
          <div
            key={i}
            className="rounded-2xl border"
            style={{ background: "var(--card)", borderColor: "var(--border)", height: 240 }}
          />
        ))}
      </div>
    </div>
  );
}
