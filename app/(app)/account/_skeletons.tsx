/*
 * Shared skeleton for the Account route. Used by:
 *  - `loading.tsx` (rendered during client-side route prefetch
 *    before the page tree mounts)
 *  - `AccountRoute.tsx` (rendered while the client session resolves
 *    and while the profile row loads)
 *
 * Mirrors the real page's sticky header (56px) + 640px column of
 * rounded cards so the skeleton → content swap doesn't shift layout.
 */

export function AccountShellSkeleton() {
  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* Sticky header — same 56px bar the real page renders */}
      <div
        className="sticky top-0 z-30"
        style={{
          backgroundColor:      "rgba(26,18,16,0.97)",
          backdropFilter:       "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom:         "1px solid var(--border)",
          minHeight:            56,
          display:              "flex",
          alignItems:           "center",
        }}
      >
        <div
          style={{
            width:    "100%",
            maxWidth: 640,
            margin:   "0 auto",
            padding:  "0 20px",
          }}
        >
          <h1
            style={{
              fontSize:   18,
              fontWeight: 700,
              fontFamily: "var(--font-serif)",
              color:      "var(--foreground)",
            }}
          >
            Account
          </h1>
        </div>
      </div>

      {/* Card stack */}
      <div
        className="animate-pulse"
        style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 100px" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Profile card — avatar + name lines */}
          <div
            className="rounded-[20px] border"
            style={{ background: "var(--card)", borderColor: "var(--border)", padding: 24 }}
          >
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-36" />
                <div className="h-3 bg-muted rounded w-24" />
              </div>
            </div>
          </div>

          {/* Section cards — badge, personal info, notifications, account */}
          {[112, 220, 168, 224].map((h, i) => (
            <div
              key={i}
              className="rounded-[20px] border"
              style={{
                background:  "var(--card)",
                borderColor: "var(--border)",
                height:      h,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
