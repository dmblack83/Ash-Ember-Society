/*
 * Single source of truth for aging display states, driven by the
 * aging_target_date the user set. Used by the humidor list badges and
 * the detail page aging bar so both surfaces agree.
 * Dates are YYYY-MM-DD strings compared in UTC (same convention as
 * lib/format's agingDays).
 */
export type AgingState =
  | { kind: "none" }
  | { kind: "plain"; days: number }
  | { kind: "aging"; days: number; readyLabel: string }
  | { kind: "almost"; days: number; daysToTarget: number }
  | { kind: "ready"; days: number };

const ALMOST_WINDOW_DAYS = 14;
const MS_PER_DAY = 86_400_000;

function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function parseYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function formatShortDate(ymd: string): string {
  return new Date(parseYmd(ymd)).toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });
}

export function agingState(
  startDate: string | null,
  targetDate: string | null,
  now: Date = new Date(),
): AgingState {
  const today = utcMidnight(now);
  const days = startDate
    ? Math.max(0, Math.floor((today - parseYmd(startDate)) / MS_PER_DAY))
    : 0;

  if (!targetDate) {
    return startDate ? { kind: "plain", days } : { kind: "none" };
  }
  const daysToTarget = Math.ceil((parseYmd(targetDate) - today) / MS_PER_DAY);
  if (daysToTarget <= 0) return { kind: "ready", days };
  if (daysToTarget <= ALMOST_WINDOW_DAYS) return { kind: "almost", days, daysToTarget };
  return { kind: "aging", days, readyLabel: formatShortDate(targetDate) };
}
