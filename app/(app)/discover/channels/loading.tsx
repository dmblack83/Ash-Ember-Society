export default function ChannelsLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {[1, 2].map((i) => (
        <div
          key={i}
          className="rounded-2xl overflow-hidden animate-pulse"
          style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
        >
          {/* Channel header */}
          <div className="flex items-center gap-3 p-4">
            <div className="w-12 h-12 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--secondary)" }} />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 rounded-full w-32" style={{ backgroundColor: "var(--secondary)" }} />
              <div className="h-2.5 rounded-full w-20" style={{ backgroundColor: "var(--secondary)" }} />
            </div>
          </div>

          {/* Video rows */}
          {[1, 2, 3].map((j) => (
            <div key={j} className="flex items-start gap-3 px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="flex-shrink-0 rounded-lg" style={{ width: 112, height: 63, backgroundColor: "var(--secondary)" }} />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3 rounded-full w-full" style={{ backgroundColor: "var(--secondary)" }} />
                <div className="h-3 rounded-full w-3/4" style={{ backgroundColor: "var(--secondary)" }} />
                <div className="h-2.5 rounded-full w-1/3" style={{ backgroundColor: "var(--secondary)" }} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
