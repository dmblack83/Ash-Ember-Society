/*
 * Suspense fallback skeletons for the home dashboard islands.
 *
 * Each skeleton matches the rendered size of the island it stands in
 * for, so the swap doesn't shift the page (CLS = 0).
 */

/* ── Fixed header skeleton ──────────────────────────────────────────
 * Mirrors WelcomeSection.tsx layout: fixed at top, ~88px tall once the
 * safe-area inset is accounted for. Renders both the fixed bar AND the
 * flow spacer beneath it, matching how WelcomeSection manages its own
 * spacer height — so when the real header swaps in, the page doesn't
 * jump.
 */
export function UserHeaderSkeleton() {
  return (
    <>
      <header
        aria-hidden="true"
        style={{
          position:        "fixed",
          top:             0,
          left:            0,
          right:           0,
          zIndex:          30,
          paddingTop:      "env(safe-area-inset-top)",
          backgroundColor: "#1A1210",
          borderBottom:    "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <div
          className="mx-auto px-4 sm:px-6 py-3"
          style={{ maxWidth: "42rem" }}
        >
          <div className="flex flex-col gap-1.5 animate-pulse">
            <div
              style={{
                height:       22,
                width:        "55%",
                borderRadius: 4,
                background:   "rgba(255,255,255,0.05)",
              }}
            />
            <div
              style={{
                height:       22,
                width:        128,
                borderRadius: 9999,
                background:   "rgba(255,255,255,0.05)",
              }}
            />
          </div>
        </div>
      </header>
      {/* Flow spacer — matches the typical rendered header height so
          downstream content doesn't sit under the fixed bar. The real
          WelcomeSection sets this dynamically via ResizeObserver once
          it mounts, but we need a sensible default for the skeleton. */}
      <div aria-hidden="true" style={{ height: 88, flexShrink: 0 }} />
    </>
  );
}

/* ── QuickActions skeleton — single 44px row of pill buttons ─────── */
export function QuickActionsSkeleton() {
  return (
    <div className="flex gap-2 animate-pulse" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex-1 rounded-xl"
          style={{ minHeight: 44, background: "rgba(255,255,255,0.04)" }}
        />
      ))}
    </div>
  );
}

/* ── SmokingConditions skeleton — thin weather strip ─────────────── */
export function SmokingConditionsSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse"
      style={{
        height:       52,
        borderRadius: 12,
        background:   "rgba(255,255,255,0.03)",
        border:       "1px solid rgba(255,255,255,0.04)",
      }}
    />
  );
}

/* ── Generic glass card skeleton — matches DashboardSkeleton style
 *   but without requiring a DashboardSection wrapper. Tune `height`
 *   per island so the swap is jump-free. */
export function CardSkeleton({ height }: { height: number }) {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse rounded-2xl"
      style={{
        height,
        background: "var(--card)",
        border:     "1px solid rgba(255,255,255,0.06)",
      }}
    />
  );
}
