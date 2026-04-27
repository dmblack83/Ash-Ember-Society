export default function ShopsLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="rounded-2xl p-4 animate-pulse"
          style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 space-y-2">
              <div className="h-4 rounded-full w-40" style={{ backgroundColor: "var(--secondary)" }} />
              <div className="h-3 rounded-full w-56" style={{ backgroundColor: "var(--secondary)" }} />
              <div className="h-3 rounded-full w-24" style={{ backgroundColor: "var(--secondary)" }} />
            </div>
            <div className="w-16 h-16 rounded-xl flex-shrink-0" style={{ backgroundColor: "var(--secondary)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
