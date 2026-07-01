/*
 * Shared skeleton for the Wishlist route. Used by `loading.tsx`
 * (route prefetch) and `WishlistRoute.tsx` (session + first data
 * load). Mirrors the fixed header + card grid so the swap to real
 * content doesn't shift layout.
 */

import { SkeletonGridCard } from "@/components/ui/skeleton-card";

export function WishlistShellSkeleton() {
  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* Fixed-header skeleton (back row + title row) */}
      <div
        className="fixed top-0 left-0 right-0 z-30 animate-pulse"
        style={{
          background:   "var(--background)",
          borderBottom: "1px solid var(--border)",
          paddingTop:   "env(safe-area-inset-top)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-3 pt-4 pb-3">
            <div className="h-4 bg-muted rounded w-20" />
          </div>
          <div className="flex items-baseline gap-3 pb-3">
            <div className="h-8 bg-muted rounded w-36" />
            <div className="h-3 bg-muted rounded w-14" />
          </div>
        </div>
      </div>

      <div style={{ height: 118 }} aria-hidden="true" />

      {/* Card grid */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <SkeletonGridCard />
        <SkeletonGridCard />
        <SkeletonGridCard />
        <SkeletonGridCard />
      </div>
    </div>
  );
}
