/* ------------------------------------------------------------------
   Shared 1-100 rating scale helpers.

   One rating scale across the app: burn reports and quick smoke logs
   both store overall_rating as 1-100 in smoke_logs (quick logs were
   1-10 until 2026-07; existing rows were multiplied by 10 in
   supabase/migrations/20260712_quick_log_rating_scale.sql).
   Extracted from BurnReport.tsx so the quick-log modal renders the
   identical grade colors and labels.
   ------------------------------------------------------------------ */

export function ratingColor(v: number): string {
  if (v <= 40) return "#C44536";
  if (v <= 60) return "#8B6020";
  if (v <= 80) return "#3A6B45";
  return "#D4A04A";
}

export function ratingLabel(v: number): string {
  if (v <= 20) return "Poor";
  if (v <= 40) return "Below Average";
  if (v <= 60) return "Average";
  if (v <= 80) return "Good";
  return "Outstanding";
}
