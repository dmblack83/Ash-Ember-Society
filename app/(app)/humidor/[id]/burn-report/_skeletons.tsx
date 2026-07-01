/*
 * Shared skeleton for the burn-report wizard routes (create + edit).
 * Mirrors the wizard's fixed header + cigar context card + first-step
 * fields so the swap to the mounted wizard doesn't shift layout.
 */

export function BurnReportShellSkeleton() {
  return (
    <div
      className="min-h-screen animate-pulse max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6"
      style={{ background: "var(--background)" }}
    >
      {/* Header row: back + title */}
      <div className="flex items-center justify-between">
        <div className="h-4 bg-muted rounded w-16" />
        <div className="h-5 bg-muted rounded w-36" />
        <div className="h-4 bg-muted rounded w-10" />
      </div>

      {/* Step dots */}
      <div className="flex justify-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-2 w-2 rounded-full bg-muted" />
        ))}
      </div>

      {/* Cigar context card */}
      <div
        className="rounded-2xl border flex items-center gap-4 p-4"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="h-16 w-16 rounded-xl bg-muted flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-muted rounded w-20" />
          <div className="h-5 bg-muted rounded w-2/3" />
        </div>
      </div>

      {/* Form fields */}
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 bg-muted rounded w-24" />
          <div className="h-12 bg-muted rounded-xl" />
        </div>
      ))}

      {/* Footer button */}
      <div className="h-12 bg-muted rounded-2xl" />
    </div>
  );
}
