"use client";

function LegalRow({ label, href }: { label: string; href: string }) {
  return (
    <button
      type="button"
      onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
      className="w-full flex items-center justify-between px-4 py-4 transition-colors active:opacity-70"
      style={{
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
        background: "none",
        border: "none",
        cursor: "pointer",
        minHeight: 56,
      }}
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M5 3L9 7L5 11" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

export function LegalTab() {
  return (
    <div className="animate-fade-in pb-10">
      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
      >
        <LegalRow label="Terms of Service"           href="/terms" />
        <div style={{ height: 1, backgroundColor: "var(--border)" }} />
        <LegalRow label="Privacy Policy"             href="/privacy" />
        <div style={{ height: 1, backgroundColor: "var(--border)" }} />
        <LegalRow label="End User License Agreement" href="/eula" />
      </div>
    </div>
  );
}
