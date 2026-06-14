# Home Dashboard Pager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the three existing home widgets (Smoking Conditions, Notifications, Aging Shelf) in a looping, one-card-at-a-time pager — dots + arrows + swipe, uniform collapsed height, the active widget collapses when you navigate — without changing each widget's existing look or data fetching.

**Architecture:** A data-agnostic client `DashboardPager` wraps the three (still Suspense-streamed) islands. It shows one slide at a time via per-slide ring transforms (infinite loop, no DOM clones → no double data fetch, all slides stay mounted so nothing refetches on navigate). A tiny `CollapseContext` carries a counter the pager bumps on every navigation; the two expandable widgets reset their own `expanded` state when it changes. The active slide is in normal flow so a widget's inline expand grows the pager and pushes the content below it down.

**Tech Stack:** Next.js App Router client components, React context, CSS transforms, Vitest (node, pure logic only).

---

## Decisions locked in

- Keep each widget's existing chrome/expand (editorial cards, conditions strip) — the pager only adds paging + a collapse-on-navigate signal.
- Uniform collapsed height is enforced by the pager (a min-height on each slide), not by changing the widgets.
- No carousel library; no new deps. No data-fetching changes to the widgets.
- Looping uses a **no-clone ring** (per-slide transform), so islands are never duplicated/refetched and all three stay mounted (no refetch when you swipe back).

## File structure

- **Create** `lib/ui/carousel.ts` — pure index math (`wrapIndex`, `ringOffset`). Tested.
- **Create** `lib/ui/__tests__/carousel.test.ts` — unit tests.
- **Create** `components/dashboard/collapse-context.ts` — `CollapseContext` + `useCollapseSignal`.
- **Create** `components/dashboard/DashboardPager.tsx` — the carousel.
- **Modify** `components/dashboard/Notifications.tsx` — collapse on navigate signal (3 lines).
- **Modify** `components/dashboard/AgingAlerts.tsx` — collapse on navigate signal (3 lines).
- **Modify** `app/(app)/home/page.tsx` — wrap the three islands in `<DashboardPager>`.

`SmokingConditions.tsx` has no expand state, so it needs no collapse subscription.

---

## Task 1: Carousel index math (TDD)

**Files:**
- Create: `lib/ui/carousel.ts`
- Test: `lib/ui/__tests__/carousel.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { wrapIndex, ringOffset } from "@/lib/ui/carousel";

describe("wrapIndex", () => {
  it("wraps in both directions", () => {
    expect(wrapIndex(0, 3)).toBe(0);
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(4, 3)).toBe(1);
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(-3, 3)).toBe(0);
  });
});

describe("ringOffset (n=3)", () => {
  it("places active at 0, next at +1, previous at -1 — wrapping", () => {
    // active = 0
    expect(ringOffset(0, 0, 3)).toBe(0);
    expect(ringOffset(1, 0, 3)).toBe(1);
    expect(ringOffset(2, 0, 3)).toBe(-1); // previous wraps to the left
    // active = 2
    expect(ringOffset(2, 2, 3)).toBe(0);
    expect(ringOffset(0, 2, 3)).toBe(1);  // next wraps to the right
    expect(ringOffset(1, 2, 3)).toBe(-1);
    // active = 1
    expect(ringOffset(1, 1, 3)).toBe(0);
    expect(ringOffset(2, 1, 3)).toBe(1);
    expect(ringOffset(0, 1, 3)).toBe(-1);
  });

  it("handles the single-item case", () => {
    expect(ringOffset(0, 0, 1)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:unit -- carousel`
Expected: FAIL — cannot resolve `@/lib/ui/carousel`.

- [ ] **Step 3: Implement**

```ts
/*
 * Pure index math for a looping, one-visible carousel.
 *
 * ringOffset maps each slide to its position relative to the active
 * slide, wrapped to the nearest side so the carousel loops: the active
 * slide is 0, the next is +1, the previous is -1 (the previous of slide
 * 0 wraps to the last slide, etc.). Offscreen slides sit at ±1 and are
 * translated out of view; this is what makes the loop seamless without
 * cloning DOM nodes.
 */

export function wrapIndex(i: number, n: number): number {
  return ((i % n) + n) % n;
}

export function ringOffset(i: number, active: number, n: number): number {
  let d = wrapIndex(i - active, n); // 0 .. n-1
  if (d * 2 > n) d -= n;            // bring the far half to the negative side
  return d;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:unit -- carousel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ui/carousel.ts lib/ui/__tests__/carousel.test.ts
git commit -m "feat(ui): pure carousel index math (wrap + ring offset)"
```

---

## Task 2: Collapse context

**Files:**
- Create: `components/dashboard/collapse-context.ts`

- [ ] **Step 1: Write the file**

```ts
"use client";

import { createContext, useContext } from "react";

/*
 * A monotonically increasing counter the DashboardPager bumps on every
 * navigation (swipe / arrow / dot). Expandable widgets read it and
 * collapse themselves when it changes, so swiping away closes an open
 * card. Defaults to 0 so widgets render fine outside a pager.
 */
export const CollapseContext = createContext(0);

export function useCollapseSignal(): number {
  return useContext(CollapseContext);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/collapse-context.ts
git commit -m "feat(dashboard): collapse-on-navigate context for the pager"
```

---

## Task 3: DashboardPager component

**Files:**
- Create: `components/dashboard/DashboardPager.tsx`

No DOM unit test (repo convention: pure logic only — that's Task 1). Gate is typecheck + lint + local.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { Children, useCallback, useRef, useState } from "react";
import { CollapseContext } from "./collapse-context";
import { wrapIndex, ringOffset } from "@/lib/ui/carousel";

const SWIPE_THRESHOLD_PX = 40;
const UNIFORM_MIN_HEIGHT = 96; // collapsed cards share this height

/*
 * DashboardPager — looping one-card-at-a-time carousel.
 *
 * Data-agnostic: it arranges its children (the dashboard islands) and
 * owns paging only. The active slide is in normal flow so a child's
 * inline expand grows the pager and pushes following content down; the
 * other slides are absolutely positioned and translated offscreen via
 * ringOffset (seamless loop, no clones, all children stay mounted).
 *
 * Every navigation bumps a CollapseContext counter so expandable
 * children collapse themselves.
 */
export function DashboardPager({
  children,
  initialIndex = 0,
}: {
  children: React.ReactNode;
  initialIndex?: number;
}) {
  const slides = Children.toArray(children);
  const n = slides.length;
  const [active, setActive] = useState(initialIndex);
  const [navTick, setNavTick] = useState(0);
  const startX = useRef<number | null>(null);

  const goTo = useCallback(
    (i: number) => {
      setActive(wrapIndex(i, n));
      setNavTick((t) => t + 1); // signal children to collapse
    },
    [n],
  );
  const next = useCallback(() => goTo(active + 1), [goTo, active]);
  const prev = useCallback(() => goTo(active - 1), [goTo, active]);

  function onPointerDown(e: React.PointerEvent) {
    startX.current = e.clientX;
  }
  function onPointerUp(e: React.PointerEvent) {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX) (dx < 0 ? next() : prev());
  }

  const arrowStyle: React.CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: "50%",
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--foreground)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontSize: 18,
    lineHeight: 1,
  };

  return (
    <CollapseContext.Provider value={navTick}>
      <section role="region" aria-roledescription="carousel" aria-label="Dashboard highlights">
        <div
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          style={{ position: "relative", overflow: "hidden", touchAction: "pan-y" }}
        >
          {slides.map((slide, i) => {
            const offset = ringOffset(i, active, n);
            const isActive = offset === 0;
            return (
              <div
                key={i}
                aria-hidden={!isActive}
                style={{
                  position: isActive ? "relative" : "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  minHeight: UNIFORM_MIN_HEIGHT,
                  transform: `translateX(${offset * 100}%)`,
                  transition: "transform .3s cubic-bezier(.16,1,.3,1)",
                  pointerEvents: isActive ? "auto" : "none",
                  opacity: isActive ? 1 : 0,
                }}
              >
                {slide}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-4 mt-3">
          <button type="button" onClick={prev} aria-label="Previous" style={arrowStyle}>
            &#8249;
          </button>
          <div className="flex items-center gap-[7px]">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to item ${i + 1} of ${n}`}
                aria-current={i === active ? "true" : undefined}
                style={{
                  width: i === active ? 18 : 7,
                  height: 7,
                  borderRadius: 4,
                  border: "none",
                  padding: 0,
                  background: i === active ? "var(--gold, #D4A04A)" : "var(--border)",
                  transition: "all .2s",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
          <button type="button" onClick={next} aria-label="Next" style={arrowStyle}>
            &#8250;
          </button>
        </div>
      </section>
    </CollapseContext.Provider>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit` → PASS
Run: `npx eslint components/dashboard/DashboardPager.tsx` → exit 0

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/DashboardPager.tsx
git commit -m "feat(dashboard): looping pager (dots, arrows, swipe, collapse-on-nav)"
```

---

## Task 4: Wire the pager into the home page

**Files:**
- Modify: `app/(app)/home/page.tsx`

- [ ] **Step 1: Add the import**

Add with the other component imports near the top of `app/(app)/home/page.tsx`:

```tsx
import { DashboardPager } from "@/components/dashboard/DashboardPager";
```

- [ ] **Step 2: Wrap the three islands**

The page currently has three consecutive `<Suspense>` blocks: Smoking Conditions (section 2), Notifications (section 2.5), and Aging Shelf (section 3). Replace those three consecutive blocks with a single `DashboardPager` wrapping them (keep each island's own `<Suspense>` so streaming is preserved). The replacement:

```tsx
        {/* ── 2. Dashboard pager: conditions · notifications · aging ──
            initialIndex={1} opens on Notifications (the middle slide). */}
        <DashboardPager initialIndex={1}>
          <Suspense fallback={<SmokingConditionsSkeleton />}>
            <SmokingConditionsIsland userId={user.id} />
          </Suspense>
          <Suspense fallback={<NotificationsSkeleton />}>
            <NotificationsIsland userId={user.id} />
          </Suspense>
          <Suspense fallback={<AgingSkeleton />}>
            <AgingIsland userId={user.id} />
          </Suspense>
        </DashboardPager>
```

Leave everything else (Masthead, Tonight's Pairing, News/The Wire, Field Guide, Local Shops) exactly as-is. Do not change the imports of the islands or skeletons (still used above).

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit` → PASS
Run: `npm run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/home/page.tsx"
git commit -m "feat(home): group conditions/notifications/aging into the dashboard pager"
```

---

## Task 5: Collapse the expandable widgets on navigation

**Files:**
- Modify: `components/dashboard/Notifications.tsx`
- Modify: `components/dashboard/AgingAlerts.tsx`

Both widgets own an `expanded` `useState`. Make each collapse when the pager's navigation counter changes.

- [ ] **Step 1: Notifications — import the signal**

In `components/dashboard/Notifications.tsx`, change the React import from:

```tsx
import { useState }   from "react";
```

to:

```tsx
import { useState, useEffect } from "react";
```

and add this import alongside the other local imports:

```tsx
import { useCollapseSignal } from "./collapse-context";
```

- [ ] **Step 2: Notifications — collapse on signal change**

Immediately after the existing `const [expanded, setExpanded] = useState(false);` line in the `Notifications` component, add:

```tsx
  const collapseSignal = useCollapseSignal();
  useEffect(() => {
    setExpanded(false);
  }, [collapseSignal]);
```

- [ ] **Step 3: AgingAlerts — import the signal**

In `components/dashboard/AgingAlerts.tsx`, change:

```tsx
import { useState } from "react";
```

to:

```tsx
import { useState, useEffect } from "react";
```

and add:

```tsx
import { useCollapseSignal } from "./collapse-context";
```

- [ ] **Step 4: AgingAlerts — collapse on signal change**

Immediately after the existing `const [expanded, setExpanded] = useState(false);` line in the `AgingAlerts` component, add:

```tsx
  const collapseSignal = useCollapseSignal();
  useEffect(() => {
    setExpanded(false);
  }, [collapseSignal]);
```

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit` → PASS
Run: `npx eslint components/dashboard/Notifications.tsx components/dashboard/AgingAlerts.tsx` → exit 0

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/Notifications.tsx components/dashboard/AgingAlerts.tsx
git commit -m "feat(dashboard): widgets collapse when the pager navigates"
```

---

## Task 6: Verify

**Files:** none.

- [ ] **Step 1: Gates**

Run: `npm run test:unit` → PASS (incl. `carousel`)
Run: `npx tsc --noEmit` → PASS
Run: `npm run lint` (or eslint on the touched files) → no new errors in touched files
Run: `npm run build` → succeeds

- [ ] **Step 2: Local visual review (phone-width)**

Run `npm run dev`, open `/home` at an iPhone-width viewport. Confirm:
- One widget shows at a time inside the home column; the others are offscreen.
- **Loop both ways:** arrows/dots/drag move Conditions → Notifications → Aging → (next) → Conditions, and backward.
- Collapsed cards occupy a **uniform height**.
- Tapping a widget's View/expand grows it inline and **pushes The Wire below down**.
- **Swiping/arrows collapse** an expanded widget.
- Dots show position; arrows work; vertical page scroll still works when dragging vertically over the pager.
- Each widget keeps its existing editorial look.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feat/dashboard-pager
gh pr create --base main --title "Home dashboard pager (swipe + inline expand)" --body "Implements docs/superpowers/plans/2026-06-14-dashboard-pager.md. Wraps Smoking Conditions / Notifications / Aging Shelf in a looping one-at-a-time pager (dots + arrows + swipe), uniform collapsed height, collapse-on-navigate. Widgets keep their existing look and data fetching; no clones (no double fetch); streaming preserved. Verify on a phone-width preview before merge."
```

---

## Self-review notes

- **Spec coverage:** looping one-at-a-time pager (Task 3) ✓; dots + arrows + swipe (Task 3) ✓; uniform collapsed height (Task 3 `UNIFORM_MIN_HEIGHT`) ✓; inline expand pushes content (active slide in normal flow, Task 3) ✓; swipe/nav collapses (Tasks 2+3+5) ✓; keep widget look (Task 5 only adds collapse, no chrome change) ✓; no double-fetch / all mounted (no-clone ring, Task 3) ✓; streaming preserved (Task 4 keeps per-island Suspense) ✓; pure index math tested (Task 1) ✓; other home sections untouched (Task 4) ✓; applies all widths (no width gating) ✓.
- **Placeholder scan:** none.
- **Type consistency:** `wrapIndex`/`ringOffset` signatures match Task 1 and their use in Task 3; `useCollapseSignal`/`CollapseContext` from Task 2 used in Tasks 3 and 5; `DashboardPager` default-imported in Task 4 matches its named export — corrected: it's a **named** export, so Task 4 uses `import { DashboardPager }`. ✓
- **Default slide:** the pager opens on **Notifications** via `initialIndex={1}` (Notifications is the 2nd of the three children) — per Dave's request.
- **Known minor edge (acceptable for v1):** if a widget renders `null` (e.g. Aging with zero items, Notifications before first fetch) its slide is an empty uniform-height card. Not a regression of behavior; a follow-up could hide empty slides, out of scope here.
