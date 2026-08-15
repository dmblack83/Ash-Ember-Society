/*
 * Pure helpers for the home-page Last Burn card. These helpers expect
 * plain YYYY-MM-DD strings; smoked_at is actually a timestamptz column
 * storing midnight-UTC values, and lib/data/last-burn-client.ts
 * normalizes it to YYYY-MM-DD before it reaches here. Comparisons use
 * LOCAL day boundaries (the user's "yesterday" is their wall-clock
 * yesterday).
 */

const WEEK_FLOOR = 14;
const ABSOLUTE_FLOOR = 30;
const OTD_YEARS_BACK = 5;

function localMidnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function parseLocalYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}
const pad = (n: number) => String(n).padStart(2, "0");

export function relativeBurnTime(smokedAt: string, now: Date = new Date()): string {
  const days = Math.round(
    (localMidnight(now) - localMidnight(parseLocalYmd(smokedAt))) / 86_400_000,
  );
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < WEEK_FLOOR) return `${days} days ago`;
  if (days < ABSOLUTE_FLOOR) return `${Math.floor(days / 7)} weeks ago`;
  return parseLocalYmd(smokedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function onThisDayCandidates(now: Date = new Date()): string[] {
  const y = now.getFullYear();
  const isMar1 = now.getMonth() === 2 && now.getDate() === 1;
  const out: string[] = [];
  for (let i = 1; i <= OTD_YEARS_BACK; i++) {
    const yr = y - i;
    out.push(`${yr}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    if (isMar1 && isLeap(yr)) out.push(`${yr}-02-29`);
  }
  return out;
}

export function nudgeLine(readyCount: number): string {
  return readyCount === 1
    ? "One stick is rested and ready."
    : `${readyCount} sticks are rested and ready.`;
}

export function yearsAgoLabel(smokedAt: string, now: Date = new Date()): string {
  const years = now.getFullYear() - parseLocalYmd(smokedAt).getFullYear();
  return years === 1 ? "One year ago today" : `${years} years ago today`;
}
