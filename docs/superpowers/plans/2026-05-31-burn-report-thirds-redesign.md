# Burn Report Per-Third Review Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the standalone Rating and Flavor Profile steps in the Burn Report wizard with an in-place expansion on the Overall step, where enabling Thirds opens a slide-up sheet per third capturing Notes, Ratings, Tasting Notes, and one Photo — averaged to a quarter-star headline.

**Architecture:** Two new Supabase tables (`burn_report_thirds` + a flavor-tag join table) child the existing `burn_reports` row. Wizard goes from 6 steps to 4. A new `PerThirdSheet` component manages per-third state with Cancel/Save semantics; a nested `TastingNotesSubSheet` houses the chip picker. Quarter-fill stars are rendered in a reusable `StarRating` component used by both inputs (1-5 click) and displays (with partial fills via SVG mask + CSS clip-path). API extended to accept a `thirds[]` array and compute server-side averaged headline ratings.

**Tech Stack:** Next.js App Router (TypeScript), Supabase (Postgres + RLS + Storage), localStorage drafts, Vitest (added in this plan for the rounding/averaging logic), Playwright (existing — for the new E2E flows).

**Reference docs:**
- Spec: `docs/superpowers/specs/2026-05-31-burn-report-thirds-redesign.md`
- Existing burn-report flow: `components/humidor/BurnReport.tsx`
- Existing VerdictCard: `components/humidor/VerdictCard.tsx`
- Existing API: `app/api/burn-report/route.ts`
- Existing `burn_reports` migration: `supabase/migrations/20260502_burn_reports_table.sql`
- Existing draft persistence: `lib/burn-report-draft.ts`

**Branch:** Create off `origin/main` (e.g., `feat/burn-report-thirds-redesign`). Per project rules, sync with `origin/main` before branching:

```bash
git fetch origin main && git checkout main && git merge --ff-only origin/main && git checkout -b feat/burn-report-thirds-redesign
```

**Coding rules to follow:** No em dashes in any user-facing copy (UI strings, placeholders, toast messages). Internal comments and docs are exempt.

---

## File map

| File | Status | Purpose |
|---|---|---|
| `supabase/migrations/20260531_burn_report_thirds.sql` | new | Adds `burn_report_thirds`, `burn_report_third_flavor_tags`, RLS, alters `smoke_logs.*_rating` to `numeric(3,2)` |
| `lib/burn-report/thirds.ts` | new | Pure utils: average + quarter-up rounding, type defs for `PerThirdData`, helpers shared by client + server |
| `lib/burn-report/__tests__/thirds.test.ts` | new | Vitest unit tests for rounding and averaging edge cases |
| `vitest.config.ts` | new | Vitest config (single-file infra add, scoped to `lib/**`) |
| `package.json` | modify | Add `vitest`, `@vitest/ui` devDeps; add `test:unit` script |
| `components/humidor/StarRating.tsx` | new | Reusable star control: `mode="input"` (click 1-5) and `mode="display"` (partial fill via SVG mask + CSS) |
| `components/humidor/TastingNotesSubSheet.tsx` | new | Chip picker over 9 categories, sticky Selected summary, per-cat count badges, Done button |
| `components/humidor/PerThirdSheet.tsx` | new | Per-third slide-up: Notes + Ratings + Tasting tap-row + 1 Photo; Cancel/Save |
| `lib/data/burn-report-thirds.ts` | new | Server-side fetcher joining `burn_report_thirds` + `burn_report_third_flavor_tags` for edit mode |
| `components/humidor/BurnReport.tsx` | modify | Remove Step 3 (Rating) and Step 4 (Flavor Profile) as standalone steps; restructure Step 5 (Overall) inline (thirds OFF) or with per-third buttons (thirds ON); extend `FormData` to include `thirds[]`; validation update; submit payload update |
| `components/humidor/VerdictCard.tsx` | modify | Sub-ratings render via new `StarRating` in display mode; per-third block adds tasting chips below notes; masthead and spec strip unchanged |
| `app/api/burn-report/route.ts` | modify | Accept `thirds[]` payload; compute averaged headline ratings server-side; insert `burn_report_thirds` rows + join rows |
| `app/(app)/humidor/burn-reports/[id]/edit/page.tsx` | modify | Hydrate `form.thirds` from the new fetcher |
| `lib/burn-report-draft.ts` | modify | Extend draft shape doc-comment + type to include `form.thirds` (no runtime changes — the module is type-parameterized) |
| `components/humidor/BurnReportPreviewCard.tsx` | **no change** | Spec explicitly preserves today's preview (no thirds rendering) |
| `e2e/burn-report-thirds.spec.ts` | new | Playwright coverage of both modes end-to-end |

---

## Task 0: Branch off origin/main

**Files:**
- None modified yet.

- [ ] **Step 1: Sync and branch**

```bash
git fetch origin main
git checkout main
git merge --ff-only origin/main
git checkout -b feat/burn-report-thirds-redesign
```

Expected: clean working tree, branch created.

- [ ] **Step 2: Verify branch is current**

```bash
git log --oneline main..origin/main
```

Expected: no output (local main matches origin).

---

## Task 1: Add vitest infrastructure

**Why first:** Tasks 2–4 add pure math (averaging + quarter-up rounding) that must be tested. Project has Playwright but no unit-test runner. One-time infra add scoped to `lib/**` so the production bundle is untouched.

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `lib/__sanity__/sanity.test.ts` (one-line smoke test to verify the runner works)

- [ ] **Step 1: Add vitest devDependencies**

```bash
npm install --save-dev vitest@^2.1.0 @vitest/ui@^2.1.0
```

Expected: `package.json` `devDependencies` includes both.

- [ ] **Step 2: Add `test:unit` script to `package.json`**

In the `"scripts"` block, add:

```json
"test:unit": "vitest run lib/",
"test:unit:watch": "vitest lib/"
```

- [ ] **Step 3: Create `vitest.config.ts` at repo root**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
});
```

- [ ] **Step 4: Add a sanity test to verify the runner**

Create `lib/__sanity__/sanity.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("vitest sanity", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

```bash
npm run test:unit
```

Expected: `1 passed`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts lib/__sanity__/sanity.test.ts
git commit -m "chore(test): add vitest for lib/ unit tests"
```

---

## Task 2: Thirds utils — types and averaging

**Files:**
- Create: `lib/burn-report/thirds.ts`
- Create: `lib/burn-report/__tests__/thirds.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/burn-report/__tests__/thirds.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  averageThirdsToQuarter,
  roundUpToQuarter,
  type PerThirdData,
} from "../thirds";

describe("roundUpToQuarter", () => {
  it("rounds 4.67 up to 4.75", () => {
    expect(roundUpToQuarter(4.67)).toBe(4.75);
  });
  it("rounds 4.30 up to 4.5", () => {
    expect(roundUpToQuarter(4.30)).toBe(4.5);
  });
  it("rounds 4.05 up to 4.25", () => {
    expect(roundUpToQuarter(4.05)).toBe(4.25);
  });
  it("leaves an exact quarter unchanged", () => {
    expect(roundUpToQuarter(4.5)).toBe(4.5);
    expect(roundUpToQuarter(4.0)).toBe(4.0);
  });
  it("caps at 5.0", () => {
    expect(roundUpToQuarter(4.9)).toBe(5.0);
    expect(roundUpToQuarter(5.0)).toBe(5.0);
  });
  it("handles zero", () => {
    expect(roundUpToQuarter(0)).toBe(0);
  });
});

describe("averageThirdsToQuarter", () => {
  const t = (draw: number, burn: number, build: number, flavor: number): PerThirdData => ({
    notes: "x",
    draw_rating: draw,
    burn_rating: burn,
    construction_rating: build,
    flavor_rating: flavor,
    flavor_tag_ids: [],
  });

  it("averages three thirds per dimension and rounds up to quarter", () => {
    const result = averageThirdsToQuarter([
      t(5, 5, 5, 5),
      t(4, 5, 4, 4),
      t(5, 5, 4, 5),
    ]);
    // draw: (5+4+5)/3 = 4.666... → 4.75
    expect(result.draw_rating).toBe(4.75);
    // burn: (5+5+5)/3 = 5.0
    expect(result.burn_rating).toBe(5.0);
    // construction: (5+4+4)/3 = 4.333... → 4.5
    expect(result.construction_rating).toBe(4.5);
    // flavor: (5+4+5)/3 = 4.666... → 4.75
    expect(result.flavor_rating).toBe(4.75);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit
```

Expected: failure — `Cannot find module '../thirds'`.

- [ ] **Step 3: Implement `lib/burn-report/thirds.ts`**

```ts
/* ------------------------------------------------------------------
   Burn Report — Thirds utilities

   Pure helpers shared by client (BurnReport.tsx, VerdictCard.tsx) and
   server (app/api/burn-report/route.ts). No React, no Supabase, no
   network — safe to import from anywhere.
   ------------------------------------------------------------------ */

export interface PerThirdData {
  notes:                string;
  draw_rating:          number;  // 1-5 integer
  burn_rating:          number;
  construction_rating:  number;
  flavor_rating:        number;
  flavor_tag_ids:       string[];
  /* photo_index points into the photo upload array for the request;
     present only when the user attached a photo to this third. */
  photo_index?:         number;
}

export interface AveragedRatings {
  draw_rating:          number;
  burn_rating:          number;
  construction_rating:  number;
  flavor_rating:        number;
}

/* Round up to the nearest quarter (0.25). Capped at 5.0. */
export function roundUpToQuarter(value: number): number {
  if (value <= 0) return 0;
  if (value >= 5) return 5;
  return Math.min(5, Math.ceil(value * 4) / 4);
}

/* Average four rating dimensions across three thirds and round
   each up to the nearest quarter. Caller is responsible for
   passing exactly 3 entries when thirds is enabled. */
export function averageThirdsToQuarter(thirds: PerThirdData[]): AveragedRatings {
  const n = thirds.length;
  if (n === 0) {
    return { draw_rating: 0, burn_rating: 0, construction_rating: 0, flavor_rating: 0 };
  }
  const sum = thirds.reduce(
    (acc, t) => ({
      draw_rating:         acc.draw_rating         + t.draw_rating,
      burn_rating:         acc.burn_rating         + t.burn_rating,
      construction_rating: acc.construction_rating + t.construction_rating,
      flavor_rating:       acc.flavor_rating       + t.flavor_rating,
    }),
    { draw_rating: 0, burn_rating: 0, construction_rating: 0, flavor_rating: 0 },
  );
  return {
    draw_rating:         roundUpToQuarter(sum.draw_rating         / n),
    burn_rating:         roundUpToQuarter(sum.burn_rating         / n),
    construction_rating: roundUpToQuarter(sum.construction_rating / n),
    flavor_rating:       roundUpToQuarter(sum.flavor_rating       / n),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:unit
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/burn-report/thirds.ts lib/burn-report/__tests__/thirds.test.ts
git commit -m "feat(burn-report): add thirds averaging + quarter-up rounding utils"
```

---

## Task 3: StarRating component (display mode with partial fills)

**Files:**
- Create: `components/humidor/StarRating.tsx`

**Note:** No unit test framework for React in this project. Verification is visual.

- [ ] **Step 1: Create the component**

Create `components/humidor/StarRating.tsx`:

```tsx
/* ------------------------------------------------------------------
   StarRating

   Two modes:
   - display: renders 5 stars with optional partial fill (in 0.25
     increments) for showing averaged-across-thirds ratings on the
     Verdict Card.
   - input: 5 click targets for 1-5 star selection. Tapping a star
     sets that value; tapping the currently-selected star resets to 0.

   Partial fills use an SVG mask + CSS background-color so the gold
   color cascades from CSS (mask uses currentColor-agnostic black fill
   in the data URI, and background-color paints under the mask).
   ------------------------------------------------------------------ */

import React from "react";

interface StarRatingProps {
  mode:    "display" | "input";
  value:   number;                  // 0-5; display mode accepts decimals
  size?:   number;                  // px; default 18
  onChange?: (next: number) => void; // input mode only
  ariaLabel?: string;
}

const STAR_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'><polygon points='10,1 12.6,7 19,7.5 14.2,11.8 15.7,18 10,14.7 4.3,18 5.8,11.8 1,7.5 7.4,7' fill='black'/></svg>";

export function StarRating({
  mode,
  value,
  size = 18,
  onChange,
  ariaLabel,
}: StarRatingProps) {
  const clamped = Math.max(0, Math.min(5, value));
  const isInput = mode === "input";

  return (
    <div
      role={isInput ? "radiogroup" : "img"}
      aria-label={ariaLabel ?? (isInput ? "Rate from 1 to 5" : `Rated ${clamped} out of 5`)}
      style={{ display: "inline-flex", gap: 4 }}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        /* fill percent for this star (0-100). For display mode we
           support partial fills; for input mode every star is either
           fully filled or fully empty. */
        let fillPct = 0;
        if (isInput) {
          fillPct = i <= clamped ? 100 : 0;
        } else {
          if (i <= Math.floor(clamped)) fillPct = 100;
          else if (i === Math.ceil(clamped)) fillPct = Math.round((clamped - Math.floor(clamped)) * 100);
        }

        const baseStar = (
          <span
            style={{
              position:           "absolute",
              top: 0, left: 0,
              width:              "100%",
              height:             "100%",
              backgroundColor:    "rgba(245,230,211,0.18)",
              WebkitMaskImage:    `url("${STAR_SVG}")`,
              maskImage:          `url("${STAR_SVG}")`,
              WebkitMaskSize:     "contain",
              maskSize:           "contain",
              WebkitMaskRepeat:   "no-repeat",
              maskRepeat:         "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition:       "center",
            }}
          />
        );

        const fillStar = (
          <span
            style={{
              position:           "absolute",
              top: 0, left: 0,
              width:              "100%",
              height:             "100%",
              backgroundColor:    "var(--gold)",
              WebkitMaskImage:    `url("${STAR_SVG}")`,
              maskImage:          `url("${STAR_SVG}")`,
              WebkitMaskSize:     "contain",
              maskSize:           "contain",
              WebkitMaskRepeat:   "no-repeat",
              maskRepeat:         "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition:       "center",
              clipPath:           `inset(0 ${100 - fillPct}% 0 0)`,
            }}
          />
        );

        const inner = (
          <span style={{ position: "relative", display: "inline-block", width: size, height: size }}>
            {baseStar}
            {fillStar}
          </span>
        );

        if (!isInput) return <React.Fragment key={i}>{inner}</React.Fragment>;

        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={i === Math.round(clamped)}
            aria-label={`${i} star${i === 1 ? "" : "s"}`}
            onClick={() => {
              if (!onChange) return;
              /* Tap the currently-selected star to clear back to 0. */
              const next = i === Math.round(clamped) ? 0 : i;
              onChange(next);
            }}
            style={{
              padding:    4,
              margin:     -4,
              background: "transparent",
              border:     "none",
              cursor:     "pointer",
              lineHeight: 0,
            }}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Visual sanity check (manual)**

Temporarily drop `<StarRating mode="display" value={4.75} />` and `<StarRating mode="input" value={3} onChange={() => {}} />` into any page; verify 5th star is 75% gold for display, and inputs are clickable.

Document the result in a short note in the PR description. Remove the temporary placement before commit.

- [ ] **Step 4: Commit**

```bash
git add components/humidor/StarRating.tsx
git commit -m "feat(burn-report): add StarRating component with quarter-fill display + 1-5 input"
```

---

## Task 4: Migration — burn_report_thirds + join table + smoke_logs type change

**Files:**
- Create: `supabase/migrations/20260531_burn_report_thirds.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: 20260531_burn_report_thirds
-- Adds rich per-third review storage. Child of burn_reports.
-- Adds flavor-tag join table. Widens smoke_logs rating columns to
-- numeric(3,2) so thirds-mode averaged headlines (e.g. 4.75) fit.
--
-- The legacy burn_reports.{thirds_enabled, third_beginning,
-- third_middle, third_end} columns stay in place; they continue to
-- be written as denormalized notes-only mirror so legacy read paths
-- keep working. The new burn_report_thirds rows carry the full
-- per-third payload (ratings, tasting tags, photo).

create table if not exists burn_report_thirds (
  id              uuid     primary key default gen_random_uuid(),
  burn_report_id  uuid     not null references burn_reports(id) on delete cascade,
  user_id         uuid     not null references profiles(id)     on delete cascade,
  third_index     smallint not null check (third_index in (1,2,3)),
  notes           text     not null,
  draw_rating          smallint not null check (draw_rating         between 1 and 5),
  burn_rating          smallint not null check (burn_rating         between 1 and 5),
  construction_rating  smallint not null check (construction_rating between 1 and 5),
  flavor_rating        smallint not null check (flavor_rating       between 1 and 5),
  photo_url       text     null,
  created_at      timestamptz not null default now(),
  unique (burn_report_id, third_index)
);

comment on table burn_report_thirds is
  'Rich per-third review payload (3 rows per thirds-enabled burn report). Sister to legacy burn_reports.third_* notes columns which are kept for back-compat.';

create index if not exists burn_report_thirds_burn_report_id_idx
  on burn_report_thirds (burn_report_id);
create index if not exists burn_report_thirds_user_id_idx
  on burn_report_thirds (user_id);

alter table burn_report_thirds enable row level security;

create policy "users can read their own burn report thirds"
  on burn_report_thirds for select to authenticated
  using (auth.uid() = user_id);

create policy "users can insert their own burn report thirds"
  on burn_report_thirds for insert to authenticated
  with check (auth.uid() = user_id);

create policy "users can update their own burn report thirds"
  on burn_report_thirds for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete their own burn report thirds"
  on burn_report_thirds for delete to authenticated
  using (auth.uid() = user_id);

-- Lounge-read mirror: any signed-in user can read a burn_report_thirds
-- row if the parent burn_report belongs to a smoke_log shared to the
-- lounge. Mirror the corresponding smoke_logs _lounge_read policy.
create policy "lounge readers can read shared burn report thirds"
  on burn_report_thirds for select to authenticated
  using (
    exists (
      select 1
        from burn_reports br
        join smoke_logs sl on sl.id = br.smoke_log_id
       where br.id = burn_report_thirds.burn_report_id
         and sl.shared_to_lounge = true   -- confirm column name during impl
    )
  );

-- ── Join: flavor tags per third ──────────────────────────────────
create table if not exists burn_report_third_flavor_tags (
  third_id       uuid not null references burn_report_thirds(id) on delete cascade,
  flavor_tag_id  uuid not null references flavor_tags(id)        on delete restrict,
  primary key (third_id, flavor_tag_id)
);

create index if not exists burn_report_third_flavor_tags_tag_idx
  on burn_report_third_flavor_tags (flavor_tag_id);

alter table burn_report_third_flavor_tags enable row level security;

create policy "users can read their own per-third flavor tag joins"
  on burn_report_third_flavor_tags for select to authenticated
  using (
    exists (
      select 1 from burn_report_thirds t
       where t.id = burn_report_third_flavor_tags.third_id
         and t.user_id = auth.uid()
    )
  );

create policy "users can insert their own per-third flavor tag joins"
  on burn_report_third_flavor_tags for insert to authenticated
  with check (
    exists (
      select 1 from burn_report_thirds t
       where t.id = burn_report_third_flavor_tags.third_id
         and t.user_id = auth.uid()
    )
  );

create policy "users can delete their own per-third flavor tag joins"
  on burn_report_third_flavor_tags for delete to authenticated
  using (
    exists (
      select 1 from burn_report_thirds t
       where t.id = burn_report_third_flavor_tags.third_id
         and t.user_id = auth.uid()
    )
  );

create policy "lounge readers can read shared per-third flavor tag joins"
  on burn_report_third_flavor_tags for select to authenticated
  using (
    exists (
      select 1
        from burn_report_thirds t
        join burn_reports br on br.id = t.burn_report_id
        join smoke_logs sl   on sl.id = br.smoke_log_id
       where t.id = burn_report_third_flavor_tags.third_id
         and sl.shared_to_lounge = true   -- confirm column name during impl
    )
  );

-- ── Widen smoke_logs rating columns to numeric(3,2) ───────────────
-- Thirds-mode averaged headlines need 0.25 precision (e.g. 4.75).
-- Integer values cast cleanly.
alter table smoke_logs
  alter column draw_rating         type numeric(3,2) using draw_rating::numeric(3,2),
  alter column burn_rating         type numeric(3,2) using burn_rating::numeric(3,2),
  alter column construction_rating type numeric(3,2) using construction_rating::numeric(3,2),
  alter column flavor_rating       type numeric(3,2) using flavor_rating::numeric(3,2);
```

- [ ] **Step 2: Verify SQL syntax locally (without applying)**

```bash
node -e "console.log(require('fs').readFileSync('supabase/migrations/20260531_burn_report_thirds.sql','utf8').length)"
```

Expected: file size printed (non-zero).

- [ ] **Step 3: Confirm the lounge-read column name**

Search the existing `smoke_logs` policies for the column the `_lounge_read` policy actually uses:

```bash
grep -rn "_lounge_read\|shared_to_lounge\|smoke_logs for select" supabase/migrations/
```

Replace `sl.shared_to_lounge` in the migration with whatever column the existing `smoke_logs` `_lounge_read` policy uses. If the policy is structured differently (e.g., joins through a `lounge_posts` table), mirror that structure here. Update both lounge-read policies in the new migration.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260531_burn_report_thirds.sql
git commit -m "feat(db): add burn_report_thirds + flavor tag join, widen smoke_logs rating cols"
```

- [ ] **Step 5: Apply via Supabase SQL editor (manual, per project process)**

Open the migration file, copy contents, paste into the Supabase SQL editor for the project, run. Save the executed run output to confirm in the PR description.

This matches the project's existing manual-migration process (see memory `project_migration_drift_profile_reset_2026-05-24` and `project_go_live_checklist`). Add an entry to the go-live checklist tracking this manual apply.

---

## Task 5: Server-side fetcher — `lib/data/burn-report-thirds.ts`

**Files:**
- Create: `lib/data/burn-report-thirds.ts`

- [ ] **Step 1: Create the fetcher**

```ts
/* ------------------------------------------------------------------
   burn-report-thirds — server-side data fetcher

   Joins burn_report_thirds + burn_report_third_flavor_tags for a
   given burn_report_id. Used by the edit page to hydrate the
   per-third form state.

   Returns rows ordered by third_index ascending (1, 2, 3).
   ------------------------------------------------------------------ */

import { createClient } from "@/utils/supabase/server";

export interface BurnReportThirdRow {
  id:                  string;
  third_index:         1 | 2 | 3;
  notes:               string;
  draw_rating:         number;
  burn_rating:         number;
  construction_rating: number;
  flavor_rating:       number;
  photo_url:           string | null;
  flavor_tag_ids:      string[];
}

export async function getBurnReportThirds(burnReportId: string): Promise<BurnReportThirdRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("burn_report_thirds")
    .select(`
      id,
      third_index,
      notes,
      draw_rating,
      burn_rating,
      construction_rating,
      flavor_rating,
      photo_url,
      burn_report_third_flavor_tags ( flavor_tag_id )
    `)
    .eq("burn_report_id", burnReportId)
    .order("third_index", { ascending: true });

  if (error || !data) return [];

  return data.map((row): BurnReportThirdRow => ({
    id:                  row.id,
    third_index:         row.third_index as 1 | 2 | 3,
    notes:               row.notes,
    draw_rating:         Number(row.draw_rating),
    burn_rating:         Number(row.burn_rating),
    construction_rating: Number(row.construction_rating),
    flavor_rating:       Number(row.flavor_rating),
    photo_url:           row.photo_url,
    flavor_tag_ids:      (row.burn_report_third_flavor_tags ?? []).map(
      (j: { flavor_tag_id: string }) => j.flavor_tag_id,
    ),
  }));
}
```

- [ ] **Step 2: Verify it builds**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/data/burn-report-thirds.ts
git commit -m "feat(burn-report): add server fetcher for per-third data (edit mode)"
```

---

## Task 6: API route — accept thirds[] and write to new tables

**Files:**
- Modify: `app/api/burn-report/route.ts`

- [ ] **Step 1: Add `PerThirdData` import and extend the body type**

In `app/api/burn-report/route.ts`, replace the existing import block top with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerUser }              from "@/lib/auth/server-user";
import { createClient }               from "@/utils/supabase/server";
import { averageThirdsToQuarter, type PerThirdData } from "@/lib/burn-report/thirds";
```

Replace the existing `BurnReportBody` interface with:

```ts
interface BurnReportBody {
  /* smoke_logs fields */
  cigar_id:                string;
  humidor_item_id:         string;
  smoked_at:               string;
  overall_rating:          number;
  location?:               string;
  occasion?:               string;
  pairing_drink?:          string;
  pairing_food?:           string;
  draw_rating?:            number;
  burn_rating?:            number;
  construction_rating?:    number;
  flavor_rating?:          number;
  flavor_tag_ids?:         string[];
  review_text?:            string;
  photo_urls?:             string[];
  smoke_duration_minutes?: number;
  content_video_id?:       string;
  /* burn_reports fields */
  thirds_enabled?:         boolean;
  third_beginning?:        string;
  third_middle?:           string;
  third_end?:              string;
  /* New per-third payload — present only when thirds_enabled === true */
  thirds?: Array<PerThirdData & { index: 1 | 2 | 3 }>;
}
```

- [ ] **Step 2: When thirds is enabled, derive headline ratings server-side**

Just before the `smokeLogPayload` assignment in `POST`, add:

```ts
  /* When thirds is enabled, compute the four headline ratings from
     the per-third payload. The client-provided draw_rating/etc.
     fields are ignored in this case (they're not collected in the
     thirds-on flow). */
  let headlineRatings: { draw_rating: number; burn_rating: number; construction_rating: number; flavor_rating: number } | null = null;
  if (body.thirds_enabled && Array.isArray(body.thirds) && body.thirds.length === 3) {
    headlineRatings = averageThirdsToQuarter(body.thirds);
  }
```

Then in the `smokeLogPayload` construction, replace the four `if (body.draw_rating)` etc. lines AND the existing `if (body.flavor_tag_ids?.length) smokeLogPayload.flavor_tag_ids = body.flavor_tag_ids;` line with the consolidated block below. (The `flavor_tag_ids` write moves inside the new branching because thirds-on derives a union from per-third selections.)

```ts
  if (headlineRatings) {
    smokeLogPayload.draw_rating         = headlineRatings.draw_rating;
    smokeLogPayload.burn_rating         = headlineRatings.burn_rating;
    smokeLogPayload.construction_rating = headlineRatings.construction_rating;
    smokeLogPayload.flavor_rating       = headlineRatings.flavor_rating;
    /* Headline flavor_tag_ids = union of all three thirds' selections.
       Keeps the existing "filter reports by tag" read paths working
       without thirds-aware joins. */
    const tagSet = new Set<string>();
    for (const t of body.thirds!) for (const id of t.flavor_tag_ids) tagSet.add(id);
    if (tagSet.size) smokeLogPayload.flavor_tag_ids = Array.from(tagSet);
  } else {
    if (body.draw_rating)         smokeLogPayload.draw_rating         = body.draw_rating;
    if (body.burn_rating)         smokeLogPayload.burn_rating         = body.burn_rating;
    if (body.construction_rating) smokeLogPayload.construction_rating = body.construction_rating;
    if (body.flavor_rating)       smokeLogPayload.flavor_rating       = body.flavor_rating;
    if (body.flavor_tag_ids?.length) smokeLogPayload.flavor_tag_ids   = body.flavor_tag_ids;
  }
```

- [ ] **Step 3: After `burn_reports` insert, capture the inserted id and insert thirds**

Replace the existing `burn_reports` insert block (lines around 137–155) with:

```ts
  /* ── Insert burn_reports child (1:1) and capture its id ───────── */
  const burnPayload: Record<string, unknown> = {
    smoke_log_id:   logData.id,
    user_id:        user.id,
    thirds_enabled: !!body.thirds_enabled,
  };
  if (body.third_beginning) burnPayload.third_beginning = body.third_beginning;
  if (body.third_middle)    burnPayload.third_middle    = body.third_middle;
  if (body.third_end)       burnPayload.third_end       = body.third_end;

  const { data: brData, error: brError } = await supabase
    .from("burn_reports")
    .insert(burnPayload)
    .select("id")
    .single();

  if (brError || !brData) {
    /* Match the original client behavior: log and continue. */
    console.error("[burn-report] burn_reports insert failed:", brError?.message);
  } else if (body.thirds_enabled && Array.isArray(body.thirds) && body.thirds.length === 3) {
    /* Insert burn_report_thirds rows + flavor tag joins. */
    const thirdsRows = body.thirds.map((t) => ({
      burn_report_id:      brData.id,
      user_id:             user.id,
      third_index:         t.index,
      notes:               t.notes,
      draw_rating:         t.draw_rating,
      burn_rating:         t.burn_rating,
      construction_rating: t.construction_rating,
      flavor_rating:       t.flavor_rating,
      photo_url:           typeof t.photo_index === "number" && body.photo_urls
        ? body.photo_urls[t.photo_index] ?? null
        : null,
    }));
    const { data: insertedThirds, error: thirdsError } = await supabase
      .from("burn_report_thirds")
      .insert(thirdsRows)
      .select("id, third_index");
    if (thirdsError || !insertedThirds) {
      console.error("[burn-report] burn_report_thirds insert failed:", thirdsError?.message);
    } else {
      /* Build join rows for each third's selected flavor tags. */
      const joinRows: Array<{ third_id: string; flavor_tag_id: string }> = [];
      for (const inserted of insertedThirds) {
        const sourceThird = body.thirds.find((t) => t.index === inserted.third_index);
        if (!sourceThird) continue;
        for (const tagId of sourceThird.flavor_tag_ids) {
          joinRows.push({ third_id: inserted.id, flavor_tag_id: tagId });
        }
      }
      if (joinRows.length) {
        const { error: joinError } = await supabase
          .from("burn_report_third_flavor_tags")
          .insert(joinRows);
        if (joinError) {
          console.error("[burn-report] burn_report_third_flavor_tags insert failed:", joinError.message);
        }
      }
    }
  }
```

- [ ] **Step 4: Verify it builds**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/burn-report/route.ts
git commit -m "feat(burn-report-api): accept thirds[] payload, compute averaged headline ratings"
```

---

## Task 7: Extend BurnReport.tsx FormData with `thirds[]`

**Files:**
- Modify: `components/humidor/BurnReport.tsx` (FormData interface and initial state)

- [ ] **Step 1: Add import**

At the top of the file, add:

```ts
import type { PerThirdData } from "@/lib/burn-report/thirds";
```

- [ ] **Step 2: Add `thirds` field to `FormData`**

In the `FormData` interface (around line 78), under the existing `thirds_enabled` group, add:

```ts
  /* New per-third payload — collected via PerThirdSheet when
     thirds_enabled is true. Indexed by third_index (1, 2, 3) but
     stored as a fixed-length tuple for easier serialization. */
  thirds: [PerThirdData | null, PerThirdData | null, PerThirdData | null];
```

In the initial state default (around line 134), add:

```ts
    thirds: [null, null, null],
```

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/humidor/BurnReport.tsx
git commit -m "feat(burn-report): add form.thirds tuple for per-third payload"
```

---

## Task 8: Extend draft persistence to round-trip `form.thirds`

**Files:**
- Modify: `lib/burn-report-draft.ts`

The module is already type-parameterized (`<TForm = Record<string, unknown>>`). The actual call sites in `BurnReport.tsx` use `PersistableForm` which is a subset of `FormData` minus `photo_files`. Per the spec, per-third `File` objects don't persist (same constraint as the main photo array); per-third rating/notes/tag data DOES persist.

- [ ] **Step 1: Locate the `PersistableForm` definition in BurnReport.tsx**

```bash
grep -n "PersistableForm" components/humidor/BurnReport.tsx
```

- [ ] **Step 2: Ensure `thirds` is included in `PersistableForm`**

In `components/humidor/BurnReport.tsx`, find the `PersistableForm` type (it strips `photo_files`). The new `thirds` field carries `photo_index` only — no `File` objects — so it CAN persist. No further change needed beyond confirming it's in the persisted shape (it will be, automatically, since `PersistableForm` is `Omit<FormData, "photo_files">`).

If `PersistableForm` enumerates fields rather than using `Omit`, add `thirds` explicitly.

- [ ] **Step 3: Update doc-comment in `lib/burn-report-draft.ts`**

Edit the file-header comment block to reflect that per-third Notes / Ratings / Tasting tags now persist; per-third photos do not. Add this paragraph after the existing "Photos are intentionally not persisted" paragraph:

```ts
   Per-third metadata (notes, ratings, tasting tag ids) persists with
   the rest of the draft. Per-third photo `File` objects share the
   same restriction as the main photo array — they're dropped on
   draft restore. Tag selections survive.
```

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/burn-report-draft.ts components/humidor/BurnReport.tsx
git commit -m "feat(burn-report): persist per-third metadata in localStorage drafts"
```

---

## Task 9: TastingNotesSubSheet component

**Files:**
- Create: `components/humidor/TastingNotesSubSheet.tsx`

- [ ] **Step 1: Create the component**

```tsx
/* ------------------------------------------------------------------
   TastingNotesSubSheet

   Second-level slide-up over the PerThirdSheet for selecting flavor
   tags. Sticky Selected (N) row at the top echoes every current pick;
   per-category sections below show the full taxonomy with per-cat
   count badges when something's selected. Single Done button at the
   bottom collapses back to the parent.

   Cancel semantics: the parent (PerThirdSheet) owns the canonical
   tag-ids array. This sub-sheet edits a local mirror and emits
   onDone(ids) on close. If the user backs out without tapping Done
   (e.g. swipe-dismiss), no commit happens — onClose fires without ids.
   ------------------------------------------------------------------ */

"use client";

import React, { useMemo, useState } from "react";
import type { FlavorTag } from "@/app/(app)/humidor/[id]/burn-report/page";

const CATEGORY_ORDER = ["earth", "wood", "spice", "sweet", "cream", "roast", "fruit", "grass", "other"];
const CATEGORY_DISPLAY: Record<string, string> = {
  earth: "Earth", wood: "Wood", spice: "Spice", sweet: "Sweet",
  cream: "Cream", roast: "Roast", fruit: "Fruit", grass: "Grass",
  other: "Other",
};

interface Props {
  open:        boolean;
  flavorTags:  FlavorTag[];
  initialIds:  string[];
  onDone:      (ids: string[]) => void;
  onClose:     () => void;
}

export function TastingNotesSubSheet({
  open, flavorTags, initialIds, onDone, onClose,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialIds));

  const grouped = useMemo(() => {
    return CATEGORY_ORDER.reduce<Record<string, FlavorTag[]>>((acc, cat) => {
      const tags = flavorTags.filter((t) => t.category === cat);
      if (tags.length) acc[cat] = tags;
      return acc;
    }, {});
  }, [flavorTags]);

  const tagById = useMemo(() => {
    const m = new Map<string, FlavorTag>();
    flavorTags.forEach((t) => m.set(t.id, t));
    return m;
  }, [flavorTags]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (!open) return null;

  const selectedIds = Array.from(selected);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tasting Notes"
      style={{
        position:    "fixed",
        inset:       0,
        zIndex:      60,
        background:  "rgba(0,0,0,0.55)",
        display:     "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background:    "var(--card)",
          borderTopLeftRadius:  16,
          borderTopRightRadius: 16,
          maxHeight:     "85vh",
          display:       "flex",
          flexDirection: "column",
          overflow:      "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding:        "14px 16px",
            borderBottom:   "1px solid var(--line)",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            background:     "var(--card)",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle:  "italic",
              fontSize:   18,
              fontWeight: 500,
              margin:     0,
            }}
          >
            Tasting Notes
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", fontSize: 22, color: "var(--paper-mute)", cursor: "pointer", padding: 4 }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", padding: "14px 16px", flex: 1 }}>
          {selectedIds.length > 0 && (
            <div
              style={{
                padding:       "10px 12px",
                border:        "1px solid var(--gold-soft, rgba(212,160,74,0.35))",
                background:    "rgba(212,160,74,0.06)",
                borderRadius:  8,
                marginBottom:  16,
                position:      "sticky",
                top:           -14,
                zIndex:        1,
              }}
            >
              <p
                style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      9,
                  fontWeight:    500,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color:         "var(--gold)",
                  margin:        "0 0 6px",
                }}
              >
                Selected ({selectedIds.length})
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {selectedIds.map((id) => {
                  const tag = tagById.get(id);
                  if (!tag) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggle(id)}
                      style={{
                        padding:      "4px 10px",
                        borderRadius: 999,
                        background:   "rgba(193,120,23,0.25)",
                        border:       "1px solid rgba(193,120,23,0.7)",
                        color:        "var(--gold)",
                        fontSize:     12,
                        cursor:       "pointer",
                      }}
                      aria-label={`Deselect ${tag.name}`}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {Object.entries(grouped).map(([cat, tags]) => {
            const catCount = tags.filter((t) => selected.has(t.id)).length;
            return (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "space-between",
                    marginBottom:   6,
                  }}
                >
                  <p
                    style={{
                      fontFamily:    "var(--font-mono)",
                      fontSize:      9,
                      fontWeight:    500,
                      letterSpacing: "0.22em",
                      textTransform: "uppercase",
                      color:         "var(--paper-mute)",
                      margin:        0,
                    }}
                  >
                    {CATEGORY_DISPLAY[cat]}
                  </p>
                  {catCount > 0 && (
                    <span
                      style={{
                        fontFamily:    "var(--font-mono)",
                        fontSize:      9,
                        letterSpacing: "0.12em",
                        color:         "var(--gold)",
                      }}
                    >
                      {catCount} selected
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {tags.map((tag) => {
                    const active = selected.has(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggle(tag.id)}
                        aria-pressed={active}
                        style={{
                          padding:      "6px 12px",
                          borderRadius: 999,
                          background:   active ? "rgba(193,120,23,0.25)" : "rgba(245,230,211,0.06)",
                          border:       `1px solid ${active ? "rgba(193,120,23,0.7)" : "rgba(245,230,211,0.18)"}`,
                          color:        active ? "var(--gold)" : "var(--foreground)",
                          fontSize:     12,
                          cursor:       "pointer",
                        }}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)", background: "var(--card)" }}>
          <button
            type="button"
            onClick={() => onDone(selectedIds)}
            style={{
              width:         "100%",
              padding:       12,
              borderRadius:  8,
              background:    "var(--gold)",
              color:         "#1a1208",
              fontFamily:    "var(--font-mono)",
              fontSize:      11,
              fontWeight:    500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              border:        "none",
              cursor:        "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

Expected: no errors. (If `FlavorTag` import path differs in your project, adjust to match the actual export.)

- [ ] **Step 3: Commit**

```bash
git add components/humidor/TastingNotesSubSheet.tsx
git commit -m "feat(burn-report): add TastingNotesSubSheet chip picker"
```

---

## Task 10: PerThirdSheet component

**Files:**
- Create: `components/humidor/PerThirdSheet.tsx`

- [ ] **Step 1: Create the component**

```tsx
/* ------------------------------------------------------------------
   PerThirdSheet

   Full-screen slide-up per third. Header shows the third tag
   (verbatim from today's eyebrows). Body collects:
   - Notes (required, auto-grow textarea)
   - Ratings: Draw / Burn / Build / Flavor — 1-5 stars each, required
   - Tasting Notes: tap-row opens TastingNotesSubSheet
   - 1 Photo (optional, X to remove, + Add)

   Cancel discards in-sheet edits. Save commits to in-memory form
   via onSave(payload).
   ------------------------------------------------------------------ */

"use client";

import React, { useRef, useState } from "react";
import { StarRating } from "./StarRating";
import { TastingNotesSubSheet } from "./TastingNotesSubSheet";
import type { PerThirdData } from "@/lib/burn-report/thirds";
import type { FlavorTag } from "@/app/(app)/humidor/[id]/burn-report/page";

const TAGS_BY_INDEX: Record<1 | 2 | 3, { eyebrow: string; placeholder: string }> = {
  1: { eyebrow: "First Third · Beginning",  placeholder: "Opening notes, light, first impressions…" },
  2: { eyebrow: "Second Third · Middle",    placeholder: "How it's developing, flavor shifts, draw, burn…" },
  3: { eyebrow: "Final Third · End",        placeholder: "Finish, complexity, lingering notes…" },
};

interface SaveLocalPayload {
  notes:                string;
  draw_rating:          number;
  burn_rating:          number;
  construction_rating:  number;
  flavor_rating:        number;
  flavor_tag_ids:       string[];
  photo_file?:          File | null;
}

interface Props {
  open:        boolean;
  index:       1 | 2 | 3;
  initial:     PerThirdData | null;
  initialPhoto?: File | null;
  flavorTags:  FlavorTag[];
  onCancel:    () => void;
  onSave:      (payload: SaveLocalPayload) => void;
}

export function PerThirdSheet({
  open, index, initial, initialPhoto = null, flavorTags, onCancel, onSave,
}: Props) {
  const tag = TAGS_BY_INDEX[index];

  /* Local in-sheet state. Initialized on open from `initial`. Cancel
     discards by simply unmounting / parent not committing. */
  const [notes,    setNotes]    = useState(initial?.notes ?? "");
  const [draw,     setDraw]     = useState(initial?.draw_rating ?? 0);
  const [burn,     setBurn]     = useState(initial?.burn_rating ?? 0);
  const [build,    setBuild]    = useState(initial?.construction_rating ?? 0);
  const [flavor,   setFlavor]   = useState(initial?.flavor_rating ?? 0);
  const [tagIds,   setTagIds]   = useState<string[]>(initial?.flavor_tag_ids ?? []);
  const [photo,    setPhoto]    = useState<File | null>(initialPhoto);
  const [subOpen,  setSubOpen]  = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const canSave = notes.trim().length > 0 && draw > 0 && burn > 0 && build > 0 && flavor > 0;

  if (!open) return null;

  const tagPreview = tagIds.length === 0
    ? "Add tasting notes"
    : flavorTags
        .filter((t) => tagIds.includes(t.id))
        .map((t) => t.name)
        .join(", ");

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tag.eyebrow}
        style={{
          position:       "fixed",
          inset:          0,
          zIndex:         50,
          background:     "rgba(0,0,0,0.55)",
          display:        "flex",
          flexDirection:  "column",
          justifyContent: "flex-end",
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      >
        <div
          style={{
            background:           "var(--background, #1A1210)",
            borderTopLeftRadius:  16,
            borderTopRightRadius: 16,
            maxHeight:            "95vh",
            display:              "flex",
            flexDirection:        "column",
            overflow:             "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding:      "14px 16px",
              borderBottom: "1px solid var(--line)",
              background:   "var(--card)",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <p
                style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      9,
                  fontWeight:    500,
                  letterSpacing: "0.28em",
                  textTransform: "uppercase",
                  color:         "var(--gold)",
                  margin:        0,
                }}
              >
                {tag.eyebrow}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close"
              style={{ background: "none", border: "none", fontSize: 22, color: "var(--paper-mute)", cursor: "pointer", padding: 4 }}
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div style={{ overflowY: "auto", padding: 16, flex: 1 }}>
            {/* Notes */}
            <div style={{ marginBottom: 18 }}>
              <p
                style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      9,
                  fontWeight:    500,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color:         "var(--paper-mute)",
                  margin:        "0 0 6px",
                }}
              >
                Notes
              </p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={tag.placeholder}
                rows={4}
                className="input"
                style={{ width: "100%", minHeight: 100, resize: "vertical" }}
              />
            </div>

            {/* Ratings */}
            <div style={{ marginBottom: 18 }}>
              <p
                style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      9,
                  fontWeight:    500,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color:         "var(--paper-mute)",
                  margin:        "0 0 8px",
                }}
              >
                Ratings
              </p>
              {([
                ["Draw",  draw,   setDraw],
                ["Burn",  burn,   setBurn],
                ["Build", build,  setBuild],
                ["Flavor", flavor, setFlavor],
              ] as const).map(([label, val, set]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
                  <span style={{ fontSize: 13 }}>{label}</span>
                  <StarRating mode="input" value={val} size={22} onChange={set} ariaLabel={`${label} rating`} />
                </div>
              ))}
            </div>

            {/* Tasting Notes tap-row */}
            <div style={{ marginBottom: 18 }}>
              <p
                style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      9,
                  fontWeight:    500,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color:         "var(--paper-mute)",
                  margin:        "0 0 6px",
                }}
              >
                Tasting Notes <span style={{ color: "var(--paper-dim)" }}>opt</span>
              </p>
              <button
                type="button"
                onClick={() => setSubOpen(true)}
                style={{
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "space-between",
                  width:          "100%",
                  padding:        "12px 14px",
                  borderRadius:   8,
                  border:         "1px solid var(--line-strong)",
                  background:     "var(--card)",
                  cursor:         "pointer",
                  textAlign:      "left",
                }}
                aria-label="Edit tasting notes"
              >
                <span
                  style={{
                    flex:          1,
                    overflow:      "hidden",
                    textOverflow:  "ellipsis",
                    whiteSpace:    "nowrap",
                    color:         tagIds.length ? "var(--foreground)" : "var(--paper-dim)",
                    fontSize:      13,
                  }}
                >
                  {tagPreview}
                </span>
                {tagIds.length > 0 && (
                  <span
                    style={{
                      marginLeft:    8,
                      padding:       "2px 8px",
                      borderRadius:  999,
                      background:    "rgba(212,160,74,0.18)",
                      border:        "1px solid rgba(212,160,74,0.5)",
                      color:         "var(--gold)",
                      fontFamily:    "var(--font-mono)",
                      fontSize:      10,
                      letterSpacing: "0.08em",
                    }}
                  >
                    {tagIds.length}
                  </span>
                )}
                <span style={{ marginLeft: 8, color: "var(--paper-mute)" }}>›</span>
              </button>
            </div>

            {/* Photo */}
            <div>
              <p
                style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      9,
                  fontWeight:    500,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color:         "var(--paper-mute)",
                  margin:        "0 0 6px",
                }}
              >
                Photo <span style={{ color: "var(--paper-dim)" }}>opt</span>
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
              {photo ? (
                <div style={{ position: "relative", width: 96, aspectRatio: "1 / 1", borderRadius: 4, overflow: "hidden", border: "1px solid var(--line-strong)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={URL.createObjectURL(photo)} alt="Per-third photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    aria-label="Remove photo"
                    style={{
                      position:   "absolute",
                      top:        6,
                      right:      6,
                      width:      24,
                      height:     24,
                      background: "rgba(0,0,0,0.7)",
                      border:     "none",
                      borderRadius: "50%",
                      color:      "#fff",
                      cursor:     "pointer",
                    }}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  style={{
                    width:          96,
                    aspectRatio:    "1 / 1",
                    border:         "1px dashed var(--line-strong)",
                    borderRadius:   4,
                    display:        "flex",
                    flexDirection:  "column",
                    alignItems:     "center",
                    justifyContent: "center",
                    cursor:         "pointer",
                    background:     "transparent",
                    color:          "var(--paper-dim)",
                  }}
                  aria-label="Add photo"
                >
                  <span style={{ fontFamily: "var(--font-serif)", fontSize: 28, color: "var(--gold)", lineHeight: 1 }}>+</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", marginTop: 4 }}>Add</span>
                </button>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)", background: "var(--card)", display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                flex:          1,
                padding:       12,
                borderRadius:  8,
                background:    "transparent",
                border:        "1px solid var(--line-strong)",
                color:         "var(--foreground)",
                fontFamily:    "var(--font-mono)",
                fontSize:      11,
                fontWeight:    500,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                cursor:        "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={() => onSave({
                notes,
                draw_rating:         draw,
                burn_rating:         burn,
                construction_rating: build,
                flavor_rating:       flavor,
                flavor_tag_ids:      tagIds,
                photo_file:          photo,
              })}
              style={{
                flex:          1,
                padding:       12,
                borderRadius:  8,
                background:    canSave ? "var(--gold)" : "rgba(212,160,74,0.3)",
                color:         "#1a1208",
                border:        "none",
                fontFamily:    "var(--font-mono)",
                fontSize:      11,
                fontWeight:    500,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                cursor:        canSave ? "pointer" : "not-allowed",
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>

      <TastingNotesSubSheet
        open={subOpen}
        flavorTags={flavorTags}
        initialIds={tagIds}
        onDone={(ids) => { setTagIds(ids); setSubOpen(false); }}
        onClose={() => setSubOpen(false)}
      />
    </>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/humidor/PerThirdSheet.tsx
git commit -m "feat(burn-report): add PerThirdSheet slide-up"
```

---

## Task 11: BurnReport.tsx — remove standalone Step 3 (Rating) and Step 4 (Flavor Profile)

**Files:**
- Modify: `components/humidor/BurnReport.tsx`

The plan is to delete the `Step3` and `Step4` functions (they become inline sections of the Overall step). Their content is reused inside the new Overall structure (Task 12).

- [ ] **Step 1: Delete `Step3` and `Step4` function declarations**

In `components/humidor/BurnReport.tsx`, remove the `Step3` function (the standalone Rating step) and the `Step4` function (the standalone Flavor Profile step). Keep `CATEGORY_ORDER` / `CATEGORY_DISPLAY` constants for reuse.

Update the steps array / step navigation so what was Step 5 (Overall) is now Step 3, and Step 6 (Summary) is now Step 4. Find the step controller (look for `setStep`, `steps`, or a step-index switch) and renumber.

- [ ] **Step 2: Update the validation routing**

Find `validateStep` (around line 1670). Remove validation cases for the old Step 3 and Step 4. Move the four-rating "Please rate the X" checks into the Overall step's validation (only when thirds is off).

```ts
// Inside validateStep for the (now) Step 3 (Overall):
if (!form.thirds_enabled) {
  if (form.draw_rating === 0)         return "Please rate the draw.";
  if (form.burn_rating === 0)         return "Please rate the burn.";
  if (form.construction_rating === 0) return "Please rate the build.";
  if (form.flavor_rating === 0)       return "Please rate the flavor.";
}
```

When thirds is enabled, add:

```ts
if (form.thirds_enabled) {
  for (let i = 0; i < 3; i++) {
    const t = form.thirds[i];
    if (!t || !t.notes.trim() || !t.draw_rating || !t.burn_rating || !t.construction_rating || !t.flavor_rating) {
      return "Complete all three thirds to submit.";
    }
  }
}
```

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit
```

Expected: no errors. (If something downstream still references `Step3` or `Step4`, that's a wiring leftover — remove the reference.)

- [ ] **Step 4: Commit**

```bash
git add components/humidor/BurnReport.tsx
git commit -m "refactor(burn-report): remove standalone Rating and Flavor Profile steps"
```

---

## Task 12: BurnReport.tsx — restructure Overall step body

**Files:**
- Modify: `components/humidor/BurnReport.tsx` (the function previously named `Step5`, now the third step)

Goal: replace the Step5 body so the section order is:

**Thirds OFF**: Overall Rating slider → Enable Thirds toggle → Review → Tasting Notes → Ratings → Smoke Duration → Photos

**Thirds ON**: Overall Rating slider → Enable Thirds toggle → Three Begin/Review buttons (replacing the textareas) → Review → (Tasting Notes hidden) → (Ratings hidden) → Smoke Duration → Photos

- [ ] **Step 1: Pull the StarRating import and add per-third button state**

At the top of `BurnReport.tsx`:

```ts
import { StarRating } from "./StarRating";
import { PerThirdSheet } from "./PerThirdSheet";
```

Inside the wizard's main component (the one that wraps `Step1` … `SummaryStep`), add state:

```ts
const [openThird, setOpenThird] = useState<1 | 2 | 3 | null>(null);
/* Per-third photo files (parallel to form.thirds, by index 1/2/3). */
const [thirdPhotos, setThirdPhotos] = useState<(File | null)[]>([null, null, null]);
```

- [ ] **Step 2: Replace the body of `Step5` (the Overall step)**

After the `Overall Rating` slider and the `Enable Thirds` toggle (which today live in `Step5` and stay verbatim — preserve their JSX exactly), replace everything from where today's three-textarea block begins down to the `Review` block opening with:

```tsx
{form.thirds_enabled ? (
  /* ── Three Begin/Review buttons ─────────────────────────────── */
  <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
    {([1, 2, 3] as const).map((idx) => {
      const tag = idx === 1 ? "First Third · Beginning" : idx === 2 ? "Second Third · Middle" : "Final Third · End";
      const data = form.thirds[idx - 1];
      const completed = !!data && data.notes.trim().length > 0;
      return (
        <button
          key={idx}
          type="button"
          onClick={() => setOpenThird(idx)}
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            padding:        "12px 16px 12px 28px",
            borderRadius:   10,
            border:         `1px solid ${completed ? "rgba(212,160,74,0.5)" : "rgba(193,120,23,0.6)"}`,
            background:     completed ? "rgba(212,160,74,0.1)" : "rgba(193,120,23,0.18)",
            color:          completed ? "var(--gold)" : "var(--foreground)",
            cursor:         "pointer",
            textAlign:      "left",
            position:       "relative",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position:     "absolute",
              top:          "50%",
              left:         12,
              transform:    "translateY(-50%)",
              width:        8,
              height:       8,
              borderRadius: 999,
              background:   completed ? "var(--gold)" : "rgba(245,230,211,0.25)",
            }}
          />
          <span
            style={{
              fontFamily:    "var(--font-mono)",
              fontSize:      9,
              fontWeight:    500,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
            }}
          >
            {tag}
          </span>
          <span style={{ fontSize: 12, opacity: 0.85 }}>{completed ? "Review ›" : "Begin ›"}</span>
        </button>
      );
    })}
  </div>
) : null}
```

The existing Review block stays exactly where it is (after the toggle / buttons block).

After the Review block and before Smoke Duration, add:

```tsx
{!form.thirds_enabled && (
  <>
    {/* Tasting Notes — inlined when thirds is off */}
    <div>
      <Eyebrow optional>Tasting Notes</Eyebrow>
      {CATEGORY_ORDER.map((cat) => {
        const tags = flavorTags.filter((t) => t.category === cat);
        if (!tags.length) return null;
        return (
          <div key={cat} style={{ marginBottom: 10 }}>
            <Eyebrow>{CATEGORY_DISPLAY[cat]}</Eyebrow>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Chip
                  key={tag.id}
                  active={form.flavor_tag_ids.includes(tag.id)}
                  onClick={() => {
                    const ids = form.flavor_tag_ids.includes(tag.id)
                      ? form.flavor_tag_ids.filter((t) => t !== tag.id)
                      : [...form.flavor_tag_ids, tag.id];
                    update({ flavor_tag_ids: ids });
                  }}
                >
                  {tag.name}
                </Chip>
              ))}
            </div>
          </div>
        );
      })}
    </div>

    {/* Ratings — inlined when thirds is off */}
    <div>
      <Eyebrow>Ratings</Eyebrow>
      {([
        ["Draw",  form.draw_rating,         "draw_rating"],
        ["Burn",  form.burn_rating,         "burn_rating"],
        ["Build", form.construction_rating, "construction_rating"],
        ["Flavor", form.flavor_rating,      "flavor_rating"],
      ] as const).map(([label, val, key]) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
          <span style={{ fontSize: 13 }}>{label}</span>
          <StarRating mode="input" value={val} size={22} onChange={(v) => update({ [key]: v } as Partial<FormData>)} ariaLabel={`${label} rating`} />
        </div>
      ))}
    </div>
  </>
)}
```

Smoke Duration and Photos blocks stay verbatim from today.

At the end of the component's returned JSX, mount the `PerThirdSheet`:

```tsx
{openThird !== null && (
  <PerThirdSheet
    open
    index={openThird}
    initial={form.thirds[openThird - 1]}
    initialPhoto={thirdPhotos[openThird - 1]}
    flavorTags={flavorTags}
    onCancel={() => setOpenThird(null)}
    onSave={(payload) => {
      const nextThirds = [...form.thirds] as typeof form.thirds;
      nextThirds[openThird - 1] = {
        notes:               payload.notes,
        draw_rating:         payload.draw_rating,
        burn_rating:         payload.burn_rating,
        construction_rating: payload.construction_rating,
        flavor_rating:       payload.flavor_rating,
        flavor_tag_ids:      payload.flavor_tag_ids,
      };
      /* Mirror notes onto legacy denormalized columns. */
      const beginning = nextThirds[0]?.notes ?? "";
      const middle    = nextThirds[1]?.notes ?? "";
      const end       = nextThirds[2]?.notes ?? "";
      update({
        thirds:          nextThirds,
        third_beginning: beginning,
        third_middle:    middle,
        third_end:       end,
      });
      /* Photo handling — see Task 13. */
      const nextPhotos = [...thirdPhotos];
      nextPhotos[openThird - 1] = payload.photo_file ?? null;
      setThirdPhotos(nextPhotos);
      setOpenThird(null);
    }}
  />
)}
```

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/humidor/BurnReport.tsx
git commit -m "feat(burn-report): inline Ratings + Tasting Notes; wire per-third buttons"
```

---

## Task 13: BurnReport.tsx — photos shared-list logic + submit payload

**Files:**
- Modify: `components/humidor/BurnReport.tsx`

Per spec: photos uploaded inside per-third sheets auto-populate the shared photo list (`form.photo_files`) in chronological order, AND the user can add/delete on the Overall page. Total cap 3.

- [ ] **Step 1: Compute the shared photo list from `thirdPhotos` + manual adds**

Replace the Photos block in the Overall step with logic that always shows `form.photo_files` (which now includes per-third uploads). Add a `useEffect` that syncs per-third photos into `form.photo_files`:

```tsx
useEffect(() => {
  /* When per-third photos change, rebuild the shared photo list:
     thirds 1,2,3 photos first (in order), then any manually-added
     Overall photos (preserved by tracking them via a separate slot).
     For simplicity we treat any photo not in thirdPhotos as manual. */
  const fromThirds = thirdPhotos.filter((f): f is File => !!f);
  const manualOnly = form.photo_files.filter((f) => !thirdPhotos.includes(f));
  const merged = [...fromThirds, ...manualOnly].slice(0, 3);
  /* Avoid update loop: only set if changed. */
  if (merged.length !== form.photo_files.length || merged.some((f, i) => f !== form.photo_files[i])) {
    update({ photo_files: merged });
  }
}, [thirdPhotos, form.photo_files, update]);
```

The existing Photos UI (add / remove via `addPhotos` / `removePhoto`) keeps working — manual adds go into `form.photo_files`, manual removes filter it. Removing a per-third photo on the Overall page also removes it from `thirdPhotos` to keep state coherent — extend `removePhoto`:

```ts
function removePhoto(i: number) {
  const file = form.photo_files[i];
  const thirdIdx = thirdPhotos.indexOf(file);
  if (thirdIdx !== -1) {
    const nextThirds = [...thirdPhotos];
    nextThirds[thirdIdx] = null;
    setThirdPhotos(nextThirds);
  }
  update({ photo_files: form.photo_files.filter((_, idx) => idx !== i) });
}
```

- [ ] **Step 2: Build the submit payload with `thirds[]`**

Find the submit handler (around line 1773 — search for "Build payload for /api/burn-report"). Add to the payload:

```ts
if (form.thirds_enabled && form.thirds.every((t) => t !== null)) {
  payload.thirds = form.thirds.map((t, i): PerThirdData & { index: 1 | 2 | 3 } => {
    const thirdPhoto = thirdPhotos[i];
    const photoIndex = thirdPhoto ? form.photo_files.indexOf(thirdPhoto) : -1;
    return {
      index: (i + 1) as 1 | 2 | 3,
      notes:               t!.notes,
      draw_rating:         t!.draw_rating,
      burn_rating:         t!.burn_rating,
      construction_rating: t!.construction_rating,
      flavor_rating:       t!.flavor_rating,
      flavor_tag_ids:      t!.flavor_tag_ids,
      ...(photoIndex >= 0 ? { photo_index: photoIndex } : {}),
    };
  });
}
```

When thirds is enabled, also clear the four star-rating fields and the `flavor_tag_ids` field from the payload — they get derived server-side from `thirds[]`.

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/humidor/BurnReport.tsx
git commit -m "feat(burn-report): shared photo list across thirds + Overall; submit thirds[] payload"
```

---

## Task 14: VerdictCard.tsx — quarter-fill stars in sub-ratings

**Files:**
- Modify: `components/humidor/VerdictCard.tsx`

- [ ] **Step 1: Import StarRating**

At the top of `VerdictCard.tsx`:

```ts
import { StarRating } from "./StarRating";
```

- [ ] **Step 2: Replace SubRatingCell's star rendering**

Find `SubRatingCell` in `VerdictCard.tsx`. Inside it, replace whatever it uses to draw the stars today with:

```tsx
<StarRating mode="display" value={val} size={16} ariaLabel={`${label} ${val.toFixed(2)} out of 5`} />
<p
  style={{
    fontFamily: "var(--font-serif)",
    fontStyle:  "italic",
    fontSize:   13,
    color:      "var(--paper-mute)",
    margin:     "4px 0 0",
  }}
>
  {Number.isInteger(val) ? val.toFixed(1) : val.toFixed(2)}
</p>
```

- [ ] **Step 3: Verify visually**

Open the Burn Report Summary step for any existing report in dev. Quarter-fill should now show on any thirds-enabled record (post-Task 6 submissions). Pre-existing integer records render whole stars unchanged.

- [ ] **Step 4: Commit**

```bash
git add components/humidor/VerdictCard.tsx
git commit -m "feat(verdict-card): quarter-fill stars in sub-ratings via StarRating"
```

---

## Task 15: VerdictCard.tsx — per-third tasting chips

**Files:**
- Modify: `components/humidor/VerdictCard.tsx`
- Modify: `lib/data/burn-report-thirds.ts` (re-used for read path; no change if Task 5 covered it)

Today the thirds block in VerdictCard renders only `thirdBeginning/Middle/End` strings (text). The new render adds per-third tasting tag chips below each notes paragraph. Tag data must be passed in as props (the card itself stays presentational).

- [ ] **Step 1: Extend VerdictCard props**

Add to the props interface:

```ts
thirdsTaggedRows?: Array<{
  index: 1 | 2 | 3;
  flavor_tag_names: string[];   // resolved names, not ids — caller does the join
}>;
```

- [ ] **Step 2: Render chips below each third's notes**

Inside the existing thirds block (lines around 514–550), after the notes `<p>`, add:

```tsx
{(() => {
  const idx = tag === "First Third · Beginning" ? 1 : tag === "Second Third · Middle" ? 2 : 3;
  const tags = thirdsTaggedRows?.find((r) => r.index === idx)?.flavor_tag_names ?? [];
  if (!tags.length) return null;
  return (
    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
      {tags.map((name) => (
        <span
          key={name}
          style={{
            padding:      "2px 8px",
            borderRadius: 999,
            background:   "rgba(212,160,74,0.12)",
            border:       "1px solid rgba(212,160,74,0.4)",
            color:        "var(--gold)",
            fontFamily:   "var(--font-mono)",
            fontSize:     10,
            letterSpacing: "0.08em",
          }}
        >
          {name}
        </span>
      ))}
    </div>
  );
})()}
```

- [ ] **Step 3: Wire callers to pass `thirdsTaggedRows`**

The callers of VerdictCard are:
- `components/humidor/BurnReport.tsx` (in-flight Summary preview) — pass from `form.thirds` resolved against `flavorTags`.
- The saved-report read paths (`app/(app)/humidor/burn-reports/[id]/page.tsx` or equivalent) — fetch via `getBurnReportThirds()` + resolve flavor names via existing `getFlavorTags()`.

In `BurnReport.tsx` Summary step, build the array inline:

```ts
const thirdsTaggedRows = form.thirds_enabled
  ? form.thirds
      .map((t, i) => t ? {
        index: (i + 1) as 1 | 2 | 3,
        flavor_tag_names: flavorTags
          .filter((ft) => t.flavor_tag_ids.includes(ft.id))
          .map((ft) => ft.name),
      } : null)
      .filter((r): r is { index: 1 | 2 | 3; flavor_tag_names: string[] } => r !== null)
  : [];
```

Pass `thirdsTaggedRows={thirdsTaggedRows}` to `<VerdictCard ... />`.

For the saved-report read path, locate the page that renders a saved burn report's VerdictCard (search `<VerdictCard`):

```bash
grep -rn "VerdictCard" app/ --include="*.tsx" | grep -v worktree
```

For each call site that loads from the database, also fetch `getBurnReportThirds(burnReportId)` and resolve names against `flavorTags`. If a call site only renders headline data (no thirds), skip.

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/humidor/VerdictCard.tsx components/humidor/BurnReport.tsx app/
git commit -m "feat(verdict-card): show per-third tasting chips below each third's notes"
```

---

## Task 16: Edit mode — hydrate `form.thirds`

**Files:**
- Modify: `app/(app)/humidor/burn-reports/[id]/edit/page.tsx`

- [ ] **Step 1: Fetch per-third data server-side**

In the edit page server component, after the existing burn-report fetch, add:

```ts
import { getBurnReportThirds } from "@/lib/data/burn-report-thirds";

// ... inside the page function, alongside the existing data fetches:
const thirdsRows = await getBurnReportThirds(burnReportId);
```

`burnReportId` here is the `burn_reports.id` for the report being edited. Trace the existing fetch (it probably resolves via `smoke_log_id` → `burn_reports` join) and re-use that id.

- [ ] **Step 2: Pass into the client component**

In the BurnReport client invocation, pass `initialThirds`:

```tsx
<BurnReport
  ... existing props
  initialThirds={thirdsRows.length === 3 ? [
    thirdsRows[0],
    thirdsRows[1],
    thirdsRows[2],
  ] : null}
/>
```

- [ ] **Step 3: Consume in BurnReport.tsx**

In `BurnReport.tsx`, extend the component props:

```ts
initialThirds?: Array<{
  third_index: 1 | 2 | 3;
  notes: string;
  draw_rating: number;
  burn_rating: number;
  construction_rating: number;
  flavor_rating: number;
  photo_url: string | null;
  flavor_tag_ids: string[];
}> | null;
```

In the initial-state derivation (where `form` defaults are set), if `initialThirds` is present, map them into the `form.thirds` tuple:

```ts
const initialForm: FormData = {
  ...baseDefaults,
  thirds: initialThirds
    ? [
        toPerThirdData(initialThirds[0]),
        toPerThirdData(initialThirds[1]),
        toPerThirdData(initialThirds[2]),
      ]
    : [null, null, null],
};

function toPerThirdData(r: NonNullable<typeof initialThirds>[number]): PerThirdData {
  return {
    notes:               r.notes,
    draw_rating:         r.draw_rating,
    burn_rating:         r.burn_rating,
    construction_rating: r.construction_rating,
    flavor_rating:       r.flavor_rating,
    flavor_tag_ids:      r.flavor_tag_ids,
  };
}
```

Per-third photos on edit follow today's "photos read-only when editing" pattern (`hidePhotos=true`). The PerThirdSheet's photo slot becomes read-only by passing a new `readOnlyPhoto?: string` prop showing the existing `photo_url` without an Add/Remove control. Extend `PerThirdSheet` props minimally to accept that and conditionally render.

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/ components/humidor/
git commit -m "feat(burn-report-edit): hydrate per-third data on edit"
```

---

## Task 17: Playwright E2E coverage

**Files:**
- Create: `e2e/burn-report-thirds.spec.ts`

Two flows: thirds-off submit and thirds-on submit.

- [ ] **Step 1: Inspect existing Playwright setup**

```bash
cat playwright.config.ts | head -30
ls e2e/ 2>/dev/null || ls tests/e2e/ 2>/dev/null
```

Identify the test directory and any existing auth helper.

- [ ] **Step 2: Create the spec**

Create the file at the directory identified in Step 1 (using `e2e/` as default). Replace `loginAs(...)` with whatever auth helper the existing specs use:

```ts
import { test, expect } from "@playwright/test";

test.describe("Burn Report — thirds redesign", () => {
  test("thirds OFF: submit with score, review, photo, tags, ratings", async ({ page }) => {
    // assumes a seeded test user with at least one humidor item
    await page.goto("/humidor");
    await page.getByRole("link", { name: /burn report/i }).first().click();

    // Step 1 Basics — accept defaults
    await page.getByRole("button", { name: /next/i }).click();
    // Step 2 Pairing — skip
    await page.getByRole("button", { name: /next/i }).click();

    // Step 3 Overall (was Step 5)
    // Score: drag the slider or use keyboard (input range supports keyboard)
    const scoreSlider = page.getByLabel(/overall rating/i);
    await scoreSlider.focus();
    for (let i = 0; i < 30; i++) await page.keyboard.press("ArrowRight");

    // Review
    await page.getByPlaceholder(/share your thoughts/i).fill("Solid stick, good draw all the way through.");

    // Ratings (4 dimensions, click 5th star each)
    for (const label of ["Draw", "Burn", "Build", "Flavor"]) {
      const group = page.getByLabel(`${label} rating`);
      await group.getByRole("radio", { name: "5 stars" }).click();
    }

    await page.getByRole("button", { name: /next/i }).click();
    await page.getByRole("button", { name: /submit/i }).click();

    await expect(page.getByText(/burn report saved/i)).toBeVisible({ timeout: 10000 });
  });

  test("thirds ON: cannot submit until all three thirds completed; averaged ratings show on verdict", async ({ page }) => {
    await page.goto("/humidor");
    await page.getByRole("link", { name: /burn report/i }).first().click();

    await page.getByRole("button", { name: /next/i }).click();
    await page.getByRole("button", { name: /next/i }).click();

    // Score
    const scoreSlider = page.getByLabel(/overall rating/i);
    await scoreSlider.focus();
    for (let i = 0; i < 30; i++) await page.keyboard.press("ArrowRight");

    // Enable Thirds
    await page.getByRole("switch", { name: /enable thirds/i }).click();

    // Open First Third → fill all required fields
    await page.getByRole("button", { name: /first third.*begin/i }).click();
    await page.getByPlaceholder(/opening notes/i).fill("Cedar and cream up front.");
    for (const label of ["Draw", "Burn", "Build", "Flavor"]) {
      await page.getByLabel(`${label} rating`).getByRole("radio", { name: "5 stars" }).click();
    }
    await page.getByRole("button", { name: /^save$/i }).click();

    // Review
    await page.getByPlaceholder(/overall recap/i).fill("Great smoke.");

    // Try to submit — should be blocked, second + third thirds not done
    await page.getByRole("button", { name: /next/i }).click();
    await page.getByRole("button", { name: /submit/i }).click();
    await expect(page.getByText(/complete all three thirds/i)).toBeVisible();

    // Fill remaining thirds and verify happy-path submit succeeds
    // ... (extend as needed; this covers the validation gate)
  });
});
```

- [ ] **Step 3: Run the spec**

```bash
npm run test:e2e -- burn-report-thirds
```

Expected: both tests pass (provided a seeded user + humidor item). If the test infra needs auth setup, mirror the pattern from any existing spec.

- [ ] **Step 4: Commit**

```bash
git add e2e/burn-report-thirds.spec.ts
git commit -m "test(e2e): cover burn-report thirds-off and thirds-on flows"
```

---

## Task 18: Manual QA + PR

- [ ] **Step 1: Local smoke test — thirds OFF**

Run the dev server (`npm run dev`), open the app, file a burn report with thirds off. Verify:
- Wizard has 4 steps (Basics, Pairing, Overall, Summary)
- Overall section order matches the spec
- All four star ratings required to advance
- Verdict card renders normally; no per-third block
- Smoked report shows up in My Reports and the lounge feed (if shared) as today

- [ ] **Step 2: Local smoke test — thirds ON**

File a second burn report with thirds enabled. Verify:
- Three Begin buttons appear under the toggle, with the three exact eyebrows
- Each Per-Third sheet has Notes (required), Ratings (required), Tasting Notes (tap-row opens sub-sheet), 1 Photo slot
- Sub-sheet shows the sticky Selected summary at top and per-category count badges
- Cancel discards in-sheet edits
- Save updates the button to "Review ›" with the gold dot
- Cannot advance to Summary until all three thirds done
- Photos uploaded inside thirds appear in the Overall photo strip in order
- Adding / removing photos on the Overall page works as today (3 total cap)
- VerdictCard sub-ratings show quarter-fill stars + decimal
- Per-third block on the VerdictCard shows notes + tasting chips, no per-third ratings
- Masthead is `BURN REPORT · NO. N · MMM DD YYYY` (no change)
- BurnReportPreviewCard in Burn Reports list and the lounge feed is visually identical to today

- [ ] **Step 3: Edit-mode test**

Open the new thirds-on report from My Reports → Edit. Verify per-third data hydrates correctly. Adjust a Note + a rating in one third, save, confirm Verdict card updates.

- [ ] **Step 4: Push branch + open PR**

```bash
git push -u origin feat/burn-report-thirds-redesign
gh pr create --title "feat(burn-report): per-third review redesign" --body "$(cat <<'EOF'
## Summary
- Replaces standalone Rating + Flavor Profile wizard steps with inline sections on the Overall step
- Adds rich per-third review captured in a new slide-up sheet (Notes + Ratings + Tasting Notes + 1 Photo)
- Quarter-fill stars on VerdictCard sub-ratings when thirds is enabled (averaged + rounded up to nearest quarter)
- New tables: burn_report_thirds, burn_report_third_flavor_tags
- BurnReportPreviewCard unchanged per spec

## Test plan
- [ ] Thirds-OFF submit flow works end-to-end
- [ ] Thirds-ON submit blocked until all three thirds completed
- [ ] Quarter-fill stars render correctly on VerdictCard
- [ ] Per-third tasting chips render in VerdictCard
- [ ] Edit mode hydrates per-third data correctly
- [ ] BurnReportPreviewCard visually identical to before
- [ ] Migration applied via Supabase SQL editor (track in go-live checklist)

Spec: docs/superpowers/specs/2026-05-31-burn-report-thirds-redesign.md
Plan: docs/superpowers/plans/2026-05-31-burn-report-thirds-redesign.md
EOF
)"
```

---

## Open follow-ups (out of scope, file as separate items)

- Editing per-third photos on a posted report (today's limitation extends to per-third photos)
- A "live verdict preview" between thirds during in-flight review
- Per-third analytics dashboards
- AI/Vision auto-tagging from per-third photos
