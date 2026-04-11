/* ------------------------------------------------------------------
   Shared view toggle — grid / list switch.
   Used in the Humidor page and the Discover Cigars page.
   ------------------------------------------------------------------ */

export type ViewMode = "grid" | "list";

function GridIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{ color: active ? "var(--foreground)" : "var(--muted-foreground)" }}
      aria-hidden="true"
    >
      <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function ListIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{ color: active ? "var(--foreground)" : "var(--muted-foreground)" }}
      aria-hidden="true"
    >
      <line x1="1" y1="4"  x2="15" y2="4"  stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="1" y1="8"  x2="15" y2="8"  stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="1" y1="12" x2="15" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div
      className="flex items-center rounded-lg overflow-hidden flex-shrink-0"
      style={{ border: "1px solid rgba(61,46,35,0.5)" }}
      role="group"
      aria-label="View mode"
    >
      <button
        type="button"
        onClick={() => onChange("grid")}
        className="px-3 py-2 transition-colors duration-150"
        style={{
          backgroundColor: view === "grid" ? "var(--secondary)" : "transparent",
        }}
        aria-pressed={view === "grid"}
        aria-label="Grid view"
      >
        <GridIcon active={view === "grid"} />
      </button>
      <button
        type="button"
        onClick={() => onChange("list")}
        className="px-3 py-2 transition-colors duration-150"
        style={{
          backgroundColor: view === "list" ? "var(--secondary)" : "transparent",
        }}
        aria-pressed={view === "list"}
        aria-label="List view"
      >
        <ListIcon active={view === "list"} />
      </button>
    </div>
  );
}
