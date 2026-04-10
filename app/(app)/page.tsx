export default function HomePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-6 animate-fade-in">
      <div
        className="rounded-2xl p-8 text-center space-y-3"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
      >
        <h1 style={{ fontFamily: "var(--font-serif)" }}>Home</h1>
        <p className="text-sm text-muted-foreground">Dashboard coming soon.</p>
      </div>
    </div>
  );
}
