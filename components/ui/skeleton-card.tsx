/* ------------------------------------------------------------------
   Shared skeleton loading cards
   ------------------------------------------------------------------ */

/** 16/9 catalog card skeleton — used in discover/cigars and wishlist */
export function SkeletonCard() {
  return (
    <div className="card animate-pulse flex flex-col gap-3">
      <div className="w-full aspect-[16/9] rounded-lg bg-muted" />
      <div className="flex flex-col gap-2">
        <div className="h-2.5 bg-muted rounded w-1/3" />
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-2.5 bg-muted rounded w-1/4" />
      </div>
    </div>
  );
}

/** 4/3 grid card skeleton — used in humidor grid view */
export function SkeletonGridCard() {
  return (
    <div className="card animate-pulse flex flex-col gap-3">
      <div className="w-full aspect-[4/3] rounded-lg bg-muted" />
      <div className="flex flex-col gap-2">
        <div className="h-2.5 bg-muted rounded w-1/3" />
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-2.5 bg-muted rounded w-1/4" />
        <div className="h-3 bg-muted rounded w-1/2 mt-1" />
      </div>
    </div>
  );
}

/** List-row skeleton — used in humidor list view */
export function SkeletonListRow() {
  return (
    <div className="card animate-pulse flex items-center gap-4 py-3">
      <div className="w-12 h-12 rounded-lg bg-muted flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-2.5 bg-muted rounded w-1/4" />
        <div className="h-4 bg-muted rounded w-1/2" />
      </div>
      <div className="h-3 bg-muted rounded w-12 hidden sm:block" />
      <div className="h-3 bg-muted rounded w-16 hidden sm:block" />
    </div>
  );
}
