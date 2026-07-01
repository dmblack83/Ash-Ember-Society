/*
 * Shared skeleton for the cigar detail route. Used by `loading.tsx`
 * (route prefetch) and `CigarDetailRoute.tsx` (session + first data
 * load). Mirrors the back link + hero + details grid so the swap to
 * real content doesn't shift layout.
 */

export function CigarDetailSkeleton() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-pulse">
      {/* Back link */}
      <div className="h-4 bg-muted rounded w-28" />

      {/* Hero */}
      <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start">
        <div className="w-full sm:w-72 aspect-[4/3] rounded-xl bg-muted flex-shrink-0" />
        <div className="flex flex-col gap-3 flex-1 pt-1 w-full">
          <div className="h-3 bg-muted rounded w-20" />
          <div className="h-7 bg-muted rounded w-2/3" />
          <div className="h-3 bg-muted rounded w-24" />
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-2.5 bg-muted rounded w-20" />
            <div className="h-4 bg-muted rounded w-24" />
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="h-12 bg-muted rounded-2xl sm:hidden" />
    </div>
  );
}
