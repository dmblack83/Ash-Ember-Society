/*
 * Shared skeleton for the Humidor item detail route. Used by
 * `loading.tsx` (route prefetch) and `ItemRoute.tsx` (session + first
 * data load). Mirrors the back row + hero image + detail rows so the
 * swap to real content doesn't shift layout.
 */

export function ItemShellSkeleton() {
  return (
    <div
      className="min-h-screen animate-pulse max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6"
      style={{ background: "var(--background)" }}
    >
      {/* Back link */}
      <div className="h-4 bg-muted rounded w-24" />

      {/* Hero image */}
      <div className="w-full aspect-[4/3] sm:aspect-[16/9] rounded-xl bg-muted" />

      {/* Title block */}
      <div className="space-y-2">
        <div className="h-3 bg-muted rounded w-20" />
        <div className="h-7 bg-muted rounded w-2/3" />
        <div className="h-3 bg-muted rounded w-28" />
      </div>

      {/* Stat chips */}
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl border"
            style={{ background: "var(--card)", borderColor: "var(--border)", height: 72 }}
          />
        ))}
      </div>

      {/* Detail card */}
      <div
        className="rounded-2xl border"
        style={{ background: "var(--card)", borderColor: "var(--border)", height: 220 }}
      />

      {/* Action buttons */}
      <div className="space-y-3">
        <div className="h-12 bg-muted rounded-2xl" />
        <div className="h-12 bg-muted rounded-2xl" />
      </div>
    </div>
  );
}
