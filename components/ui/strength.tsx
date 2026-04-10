/* ------------------------------------------------------------------
   Shared strength helpers — used in HumidorItemClient and stats/page
   ------------------------------------------------------------------ */

export const STRENGTH_LABEL: Record<string, string> = {
  mild: "Mild",
  mild_medium: "Mild-Medium",
  medium: "Medium",
  medium_full: "Medium-Full",
  full: "Full",
};

export function strengthStyle(s: string): { backgroundColor: string; color: string } {
  const map: Record<string, { backgroundColor: string; color: string }> = {
    mild:        { backgroundColor: "#1E3A2A", color: "#5A9A72" },
    mild_medium: { backgroundColor: "#2A2A1A", color: "#8A8A42" },
    medium:      { backgroundColor: "var(--secondary)", color: "#C17817" },
    medium_full: { backgroundColor: "#2A1A0A", color: "#C17817" },
    full:        { backgroundColor: "#2A1010", color: "#C44536" },
  };
  return map[s] ?? { backgroundColor: "var(--muted)", color: "var(--muted-foreground)" };
}
