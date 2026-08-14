# The Last Burn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Last Burn card (with On This Day face) on the home dashboard, positioned above the Blind Draw, per `docs/superpowers/specs/2026-08-14-home-last-burn-design.md`.

**Architecture:** Pure-logic helper (time + candidate dates + face selection) → client fetcher + SWR key → presentational card component → island wiring in the static `/home` shell. One PR on `feat/home-last-burn`.

**Tech Stack:** Next.js App Router client islands, SWR, Supabase browser client, vitest.

## Global Constraints

- No em dashes in any user-facing string.
- `/home` stays a fully static shell — no server reads (`npm run check:shells` must pass).
- Design tokens only; no new dependencies; no motion beyond `animate-fade-in`.
- Copy, sizes, and face rules follow the spec verbatim; mockup `mockups/home-ux/last-burn.html` is the visual reference.
- Every Supabase read throws on error so SWR handles it (island renders nothing on error).

---

### Task 1: last-burn logic helper

**Files:**
- Create: `lib/home/last-burn.ts`
- Test: `lib/__tests__/last-burn.test.ts`

**Interfaces:**
- Produces: `relativeBurnTime(smokedAt: string, now?: Date): string` — "Today" | "Yesterday" | "{N} days ago" (2-13) | "{N} weeks ago" (14-29) | "Mmm D" (30+). Local-day boundaries; `smokedAt` is YYYY-MM-DD.
- Produces: `onThisDayCandidates(now?: Date): string[]` — YYYY-MM-DD strings for today's month+day in each of the past 5 years; when today is Mar 1, also `YYYY-02-29` for leap candidate years.
- Produces: `nudgeLine(readyCount: number): string` — `"One stick is rested and ready."` / `` `${n} sticks are rested and ready.` `` (caller prefixes "It has been a while. ").
- Produces: `yearsAgoLabel(smokedAt: string, now?: Date): string` — "One year ago today" | "{N} years ago today".

- [ ] **Step 1: Write the failing tests**

```ts
// lib/__tests__/last-burn.test.ts
import { describe, expect, test } from "vitest";
import {
  relativeBurnTime, onThisDayCandidates, nudgeLine, yearsAgoLabel,
} from "@/lib/home/last-burn";

const NOW = new Date(2026, 7, 14, 15, 30); // local Aug 14 2026, 3:30 PM

describe("relativeBurnTime", () => {
  test("same day", () => expect(relativeBurnTime("2026-08-14", NOW)).toBe("Today"));
  test("yesterday", () => expect(relativeBurnTime("2026-08-13", NOW)).toBe("Yesterday"));
  test("2 days", () => expect(relativeBurnTime("2026-08-12", NOW)).toBe("2 days ago"));
  test("13 days", () => expect(relativeBurnTime("2026-08-01", NOW)).toBe("13 days ago"));
  test("14 days flips to weeks", () => expect(relativeBurnTime("2026-07-31", NOW)).toBe("2 weeks ago"));
  test("29 days still weeks", () => expect(relativeBurnTime("2026-07-16", NOW)).toBe("4 weeks ago"));
  test("30 days becomes absolute", () => expect(relativeBurnTime("2026-07-15", NOW)).toBe("Jul 15"));
});

describe("onThisDayCandidates", () => {
  test("plain day: five prior years", () => {
    expect(onThisDayCandidates(NOW)).toEqual([
      "2025-08-14", "2024-08-14", "2023-08-14", "2022-08-14", "2021-08-14",
    ]);
  });
  test("Mar 1 adds Feb 29 for leap years", () => {
    const mar1 = new Date(2026, 2, 1);
    const c = onThisDayCandidates(mar1);
    expect(c).toContain("2024-02-29");
    expect(c).toContain("2025-03-01");
    expect(c).not.toContain("2025-02-29");
  });
});

describe("nudgeLine", () => {
  test("singular", () => expect(nudgeLine(1)).toBe("One stick is rested and ready."));
  test("plural", () => expect(nudgeLine(3)).toBe("3 sticks are rested and ready."));
});

describe("yearsAgoLabel", () => {
  test("one year", () => expect(yearsAgoLabel("2025-08-14", NOW)).toBe("One year ago today"));
  test("three years", () => expect(yearsAgoLabel("2023-08-14", NOW)).toBe("3 years ago today"));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/__tests__/last-burn.test.ts` — expect module-not-found FAIL.

- [ ] **Step 3: Implement**

```ts
// lib/home/last-burn.ts
/*
 * Pure helpers for the home-page Last Burn card. smoked_at is a
 * YYYY-MM-DD date column; comparisons use LOCAL day boundaries
 * (the user's "yesterday" is their wall-clock yesterday).
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
```

- [ ] **Step 4: Run tests — all PASS**, then `npx vitest run lib/` (full lib green).
- [ ] **Step 5: Commit**

```bash
git add lib/home/last-burn.ts lib/__tests__/last-burn.test.ts
git commit -m "feat: last-burn time and on-this-day helpers"
```

### Task 2: fetcher + SWR key

**Files:**
- Create: `lib/data/last-burn-client.ts`
- Modify: `lib/data/keys.ts` (add `lastBurn`)

**Interfaces:**
- Consumes: `onThisDayCandidates` (Task 1); `fetchFlavorTags` from `@/lib/data/flavor-tags-client`.
- Produces: `keyFor.lastBurn(userId)` → `["last-burn", userId]`.
- Produces:

```ts
export interface LastBurnLog {
  id: string;
  smoked_at: string;
  overall_rating: number | null;
  draw_rating: number | null;
  burn_rating: number | null;
  construction_rating: number | null;
  smoke_duration_minutes: number | null;
  pairing_drink: string | null;
  review_text: string | null;
  humidor_item_id: string | null;
  isFullReport: boolean;
  flavorNames: string[];          // first 3, resolved
  video: { youtube_video_id: string } | null;
  cigar: { brand: string | null; series: string | null; format: string | null };
}
export interface LastBurnBundle {
  latest: LastBurnLog | null;
  onThisDay: LastBurnLog | null;  // oldest past-year match for today, else null
}
export async function fetchLastBurn(userId: string): Promise<LastBurnBundle>
```

- [ ] **Step 1: Add the key** — in `lib/data/keys.ts` near `homeAging`: `lastBurn: (userId: string) => ["last-burn", userId] as const,` with a one-line comment matching neighbors.

- [ ] **Step 2: Implement the fetcher**

```ts
// lib/data/last-burn-client.ts
"use client";

/*
 * Fetcher for the home-page Last Burn island. Two queries in parallel:
 * the single latest smoke log, and any logs matching today's
 * month+day in past years (On This Day). Flavor names + video resolve
 * after, only when needed. Pairs with keyFor.lastBurn(userId).
 */

import { createClient } from "@/utils/supabase/client";
import { fetchFlavorTags } from "@/lib/data/flavor-tags-client";
import { onThisDayCandidates } from "@/lib/home/last-burn";

const SELECT = `
  id, smoked_at, created_at, overall_rating, draw_rating, burn_rating,
  construction_rating, smoke_duration_minutes, pairing_drink, review_text,
  flavor_tag_ids, content_video_id, humidor_item_id,
  cigar:cigar_catalog(brand, series, format),
  burn_report:burn_reports(id)
`;

/* Raw row → LastBurnLog (flavor/video resolution happens in fetchLastBurn). */
type Raw = {
  id: string; smoked_at: string; created_at: string;
  overall_rating: number | null; draw_rating: number | null;
  burn_rating: number | null; construction_rating: number | null;
  smoke_duration_minutes: number | null; pairing_drink: string | null;
  review_text: string | null; flavor_tag_ids: string[] | null;
  content_video_id: string | null; humidor_item_id: string | null;
  cigar: { brand: string | null; series: string | null; format: string | null }
       | Array<{ brand: string | null; series: string | null; format: string | null }> | null;
  burn_report: { id: string } | Array<{ id: string }> | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function fetchLastBurn(userId: string): Promise<LastBurnBundle> {
  const supabase = createClient();
  const [latestRes, otdRes] = await Promise.all([
    supabase.from("smoke_logs").select(SELECT)
      .eq("user_id", userId)
      .order("smoked_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.from("smoke_logs").select(SELECT)
      .eq("user_id", userId)
      .in("smoked_at", onThisDayCandidates())
      .order("smoked_at", { ascending: true })
      .limit(1),
  ]);
  if (latestRes.error) throw new Error(latestRes.error.message);
  if (otdRes.error) throw new Error(otdRes.error.message);

  const rows = [
    (latestRes.data ?? [])[0] as Raw | undefined,
    (otdRes.data ?? [])[0] as Raw | undefined,
  ];

  /* Resolve flavor names once if either row needs them. */
  const needsTags = rows.some((r) => (r?.flavor_tag_ids?.length ?? 0) > 0);
  const tagNames: Record<string, string> = {};
  if (needsTags) {
    for (const t of await fetchFlavorTags()) tagNames[t.id] = t.name;
  }

  /* Resolve videos (0-2 lookups collapse into one .in()). */
  const videoIds = rows.map((r) => r?.content_video_id).filter((v): v is string => !!v);
  const videoMap = new Map<string, { youtube_video_id: string }>();
  if (videoIds.length > 0) {
    const { data: videos } = await supabase
      .from("content_videos").select("id, youtube_video_id").in("id", videoIds);
    for (const v of videos ?? []) videoMap.set(v.id, { youtube_video_id: v.youtube_video_id });
  }

  const toLog = (r: Raw | undefined): LastBurnLog | null => {
    if (!r) return null;
    return {
      id: r.id, smoked_at: r.smoked_at,
      overall_rating: r.overall_rating, draw_rating: r.draw_rating,
      burn_rating: r.burn_rating, construction_rating: r.construction_rating,
      smoke_duration_minutes: r.smoke_duration_minutes,
      pairing_drink: r.pairing_drink, review_text: r.review_text,
      humidor_item_id: r.humidor_item_id,
      isFullReport: one(r.burn_report) != null,
      flavorNames: (r.flavor_tag_ids ?? []).slice(0, 3)
        .map((id) => tagNames[id]).filter((n): n is string => !!n),
      video: r.content_video_id ? (videoMap.get(r.content_video_id) ?? null) : null,
      cigar: one(r.cigar) ?? { brand: null, series: null, format: null },
    };
  };

  return { latest: toLog(rows[0]), onThisDay: toLog(rows[1]) };
}
```

(Include the `LastBurnLog` / `LastBurnBundle` interfaces from the
Interfaces block above in this file, exported.)

- [ ] **Step 3: Verify** — `npx tsc --noEmit --pretty false` clean on touched files; `npx vitest run lib/` green.
- [ ] **Step 4: Commit**

```bash
git add lib/data/last-burn-client.ts lib/data/keys.ts
git commit -m "feat: last-burn fetcher with on-this-day candidates"
```

### Task 3: LastBurn card component

**Files:**
- Create: `components/dashboard/LastBurn.tsx`

**Interfaces:**
- Consumes: `LastBurnBundle`/`LastBurnLog` (Task 2), `relativeBurnTime`/`yearsAgoLabel`/`nudgeLine` (Task 1), `ratingColor`/`ratingLabel` from `@/lib/rating`, `IntentLink` from `@/components/ui/IntentLink`, `useRouter`.
- Produces: `LastBurn({ bundle, readyCount }: { bundle: LastBurnBundle; readyCount: number })` — returns null when `bundle.latest` is null.

Follow the mockup `mockups/home-ux/last-burn.html` (open it, copy its
treatments) and the spec's Card Faces section EXACTLY. Structure:

- Face selection: `const log = bundle.onThisDay ?? bundle.latest;` with
  `const isOtd = bundle.onThisDay != null;`. Return null when
  `bundle.latest == null`.
- Card: section styled like BlindDraw's card chrome (border
  `1px solid var(--card-border)` fallback `var(--line-soft)`, radius 10,
  background `var(--card)`, padding `16px 16px 14px`,
  `animate-fade-in`). OTD adds `borderColor: "rgba(212,160,74,.45)"` and
  the top-right radial glow div (copy the gradient from TonightsPairing,
  gold at .14).
- Eyebrow row: mono 10px, letterSpacing .28em, uppercase, gold; text
  `The Last Burn` or `On This Day`; flex hairline (`--line`); right slot:
  `relativeBurnTime(log.smoked_at)` in `--dim` (Last Burn) or the year
  `String(new Date(log.smoked_at).getFullYear())` in gold (OTD) —
  parse year from the YMD string (`log.smoked_at.slice(0, 4)`), not Date.
- Main row (flex, gap 16): score block — serif italic 46px,
  letterSpacing -0.02em, color `ratingColor(r)`; grade word beneath
  serif italic 12px same color; when `overall_rating == null` render
  an en dash (`–`) in `--dim` and omit the grade word.
- Identity block: brand 9.5px caps `--mute`; name 15px/600 (name =
  `cigar.series ?? cigar.format ?? ""`); meta line 10.5px `--dim` built
  from parts joined with `" · "`:
  1. OTD: `yearsAgoLabel(...)` first; always: `Full report`/`Quick log`
     (by `isFullReport`);
  2. absolute date `Mmm D` (skip on OTD, the years-ago label covers it);
  3. duration when `smoke_duration_minutes != null`: `1h 45m` for >= 60,
     `55m` under;
  4. `pairing_drink` when present.
- Sub-ratings row (full reports only, any of the three non-null): mono
  8.5px chips on `--bg` with `--line-soft` border, radius 5,
  `Draw <b>90</b>` / `Burn` / `Constr.` — omit individual null chips.
- Quote: `review_text` present → serif italic 14px `--mute`,
  lineHeight 1.45, marginTop 12, 2-line clamp (`display: -webkit-box`
  etc.), wrapped in curly quotes `“...”`.
- Footer (marginTop 12, paddingTop 11, borderTop `--line-soft`, flex
  space-between, minHeight 24):
  - Left slot priority: OTD → nothing here (bridge line replaces the
    whole footer, below); video → the red chip
    (`▶ Watch review`, mono 8.5px, color #FF4444, border
    rgba(255,0,0,.35), radius 999, external link, stopPropagation);
    nudge (gap > 30 days via `relativeBurnTime` returning an absolute
    date is NOT the test — compute days directly, > 30, AND
    readyCount >= 1) → serif italic 10.5px `--dim`
    `It has been a while. {nudgeLine(readyCount)}`;
    else full-report flavor pills (up to 3, mono 8px caps, gold-deep,
    hairline gold border, radius 999, overflow hidden no wrap); else
    empty span.
  - Right slot: `Burn history ›` mono 9px gold — IntentLink to
    `/humidor/burn-reports`.
- OTD footer: replace the standard footer's left/right with a single
  line 10.5px `--dim`:
  `Your last burn was {relativeBurnTime(bundle.latest.smoked_at)} · `
  + gold `see it ›` linking to the latest log's target (below). When
  the OTD log IS the latest log (same id), omit the bridge line and
  show the standard footer instead.
- Tap targets: whole card `onClick` → `router.push` to
  `/humidor/${log.humidor_item_id}` or `/humidor/burn-reports` when
  null; cursor pointer; inner links call `e.stopPropagation()`.
  `role="button"`? No — use a real click on the section with
  `aria-label` `Last burn: {name}`; footer link and video chip are
  real anchors above it (zIndex/stopPropagation).

- [ ] **Step 1: Implement per the structure above.**
- [ ] **Step 2: Verify** — `npx tsc --noEmit --pretty false` clean; `npx vitest run lib/` green.
- [ ] **Step 3: Commit**

```bash
git add components/dashboard/LastBurn.tsx
git commit -m "feat: LastBurn dashboard card with on-this-day face"
```

### Task 4: island wiring

**Files:**
- Modify: `app/(app)/home/client-islands.tsx` (new island)
- Modify: `app/(app)/home/page.tsx` (render above BlindDrawIsland)

**Interfaces:**
- Consumes: `fetchLastBurn` + `keyFor.lastBurn` (Task 2), `LastBurn` (Task 3), `fetchAgingItems` + `keyFor.homeAging` (existing).

- [ ] **Step 1: Island** — in `client-islands.tsx`, next to BlindDrawIsland:

```tsx
/* The Last Burn — most recent smoke log / On This Day. No skeleton:
   absent until the first log exists (same convention as Blind Draw). */
export function LastBurnIsland() {
  const { ready, session } = useAppSession();
  const userId = session?.userId ?? null;
  const { data } = useSWR(
    userId ? keyFor.lastBurn(userId) : null,
    () => fetchLastBurn(userId as string),
  );
  const { data: aging } = useSWR(
    userId ? keyFor.homeAging(userId) : null,
    () => fetchAgingItems(userId as string),
  );
  if (!ready || !session || !data) return null;
  const readyCount = (aging ?? []).filter((i) => daysUntilLocal(i.aging_target_date) <= 0).length;
  return <LastBurn bundle={data} readyCount={readyCount} />;
}
```

with a small local `daysUntilLocal(ymd)` (local-midnight diff, same
math as AgingAlerts' `daysUntil`) at module level, and imports for
`fetchLastBurn` + `LastBurn`.

- [ ] **Step 2: Page order** — in `page.tsx`, import `LastBurnIsland` and render it BETWEEN `<DashboardPagerIsland />` and `<BlindDrawIsland />`, with comment `{/* 3. The Last Burn — latest log / On This Day; hidden with no logs. */}` (renumber the comments below it).
- [ ] **Step 3: Verify** — `npx tsc --noEmit --pretty false` clean; `npm run build && npm run check:shells` (home still static `○`).
- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/home/client-islands.tsx app/\(app\)/home/page.tsx
git commit -m "feat: Last Burn island on home above the Blind Draw"
```

### Task 5: gate

- [ ] `npm run test:unit` all green; `npx tsc --noEmit` clean; `npm run build && npm run check:shells` OK.
- [ ] Runtime verify-in-app on `/home` (fixture account has logs): Last Burn card renders between pager and Blind Draw; screenshot review of the rendered face.
- [ ] `gh pr list --head feat/home-last-burn --state all` (expect none) → push `-u` → PR titled `feat: The Last Burn — home dashboard card with On This Day` referencing the spec.
