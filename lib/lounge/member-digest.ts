/**
 * Weekly new-member digest — shared constants + pure logic.
 * Spec: docs/superpowers/specs/2026-08-24-member-digest-design.md
 *
 * The cron route (/api/cron/member-digest) posts every Friday 12:00 PM
 * MST (fixed UTC-7 → 19:00 UTC, vercel.json). The window runs from the
 * previous digest post; the first run ever (launch) covers 14 days.
 */

export const DIGEST_TITLE = "This Week's New Members";

export const LAUNCH_WINDOW_DAYS = 14;

export interface DigestMember {
  user_id:      string;
  display_name: string;
  avatar_url:   string | null;
  position:     number;
}

export function digestWindowStart(lastDigestAt: string | null, now: Date): Date {
  if (lastDigestAt) return new Date(lastDigestAt);
  return new Date(now.getTime() - LAUNCH_WINDOW_DAYS * 86_400_000);
}

export function digestContent(count: number): string {
  return count === 1
    ? "1 new member joined the Society."
    : `${count} new members joined the Society.`;
}
