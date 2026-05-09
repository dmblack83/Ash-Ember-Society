/*
 * In-page Suspense fallback skeletons for the home dashboard islands.
 *
 * Distinct from `loading.tsx`: that one renders during route prefetch,
 * before the page tree mounts. These render INSIDE the page once it
 * mounts, while individual sections are still resolving. Each is sized
 * to match the rendered island so the swap doesn't shift the page.
 *
 * Use the `card` class so spacing and shadow match the rendered cards
 * exactly — keeps CLS at zero.
 */

/* ── Masthead skeleton — ~140px tall, scrolls with page ──────────── */
export function MastheadSkeleton() {
  return (
    <header
      aria-hidden="true"
      className="animate-pulse"
      style={{
        paddingTop:    "calc(env(safe-area-inset-top) + 14px)",
        paddingBottom: 18,
        background:    "rgba(26,18,16,0.88)",
        borderBottom:  "1px solid var(--line)",
      }}
    >
      <div className="px-4 sm:px-6 max-w-2xl mx-auto">
        <div
          style={{
            height:       1,
            background:   "var(--gold)",
            opacity:      0.5,
            marginBottom: 14,
          }}
        />
        <div className="h-8 bg-muted rounded w-2/3 mb-3" />
        <div className="h-5 bg-muted rounded w-1/2" />
      </div>
    </header>
  );
}

/* ── Smoking conditions strip — thin weather card ────────────────── */
export function SmokingConditionsSkeleton() {
  return (
    <div className="card animate-pulse" aria-hidden="true">
      <div className="h-3 bg-muted rounded w-1/3 mb-3" />
      <div className="grid grid-cols-3 gap-3">
        <div className="h-12 bg-muted rounded" />
        <div className="h-12 bg-muted rounded" />
        <div className="h-12 bg-muted rounded" />
      </div>
    </div>
  );
}

/* ── Aging shelf skeleton — 2-row preview ────────────────────────── */
export function AgingSkeleton() {
  return (
    <div className="card animate-pulse" aria-hidden="true">
      <div className="h-3 bg-muted rounded w-1/4 mb-4" />
      <div className="space-y-3">
        <div className="h-10 bg-muted rounded" />
        <div className="h-10 bg-muted rounded w-5/6" />
      </div>
    </div>
  );
}

/* ── News skeleton — 5 article rows ──────────────────────────────── */
export function NewsSkeleton() {
  return (
    <div className="card animate-pulse" aria-hidden="true">
      <div className="h-3 bg-muted rounded w-1/4 mb-4" />
      <div className="space-y-3">
        <div className="h-16 bg-muted rounded" />
        <div className="h-16 bg-muted rounded" />
        <div className="h-16 bg-muted rounded" />
        <div className="h-16 bg-muted rounded" />
        <div className="h-16 bg-muted rounded" />
      </div>
      <div className="h-10 bg-muted rounded mt-5" />
    </div>
  );
}

/* ── LocalShops skeleton — single row ────────────────────────────── */
export function LocalShopsSkeleton() {
  return (
    <div className="card animate-pulse" aria-hidden="true">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 bg-muted rounded" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-3 bg-muted rounded w-1/3" />
        </div>
      </div>
    </div>
  );
}
