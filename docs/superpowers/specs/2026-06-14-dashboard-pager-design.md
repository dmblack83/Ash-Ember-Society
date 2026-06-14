# Home Dashboard Pager (swipe + expand) — design

**Date:** 2026-06-14
**Status:** Approved (validated via interactive mockups in the visual companion)
**Branch:** `feat/dashboard-pager`

---

## Goal

Combine the three home-dashboard widgets — **Smoking Conditions, Notifications, Aging Shelf**
— into a single **looping, one-card-at-a-time pager**: uniform collapsed cards, navigate with
**dots and arrows or swipe/drag**, **tap to expand inline** (pushes content below down),
**swipe collapses**. Looping is **infinite both directions** (past Aging Shelf wraps to
Smoking Conditions and vice versa).

## Approved interaction (from the mockup)

- One card visible at a time inside the existing home column.
- **Looping** carousel: forward and backward wrap seamlessly.
- **Both** dots (position) and arrows (‹ ›) plus horizontal **drag/swipe**.
- **Collapsed cards are a uniform fixed height.** Collapsed shows: icon, title, one-line
  summary.
- **Tap the card → expands inline** (animated height), revealing the full widget detail and
  pushing the content below it (e.g. The Wire) down. A soft gold glow marks the expanded card.
- **Navigating (swipe/arrow/dot) collapses** the expanded card.
- Vertical page scroll must still work over the carousel (horizontal gesture only triggers
  paging past a small threshold).

## Data-sourcing reality (drives the architecture)

The three widgets do NOT share a data path:

- **Smoking Conditions** (`components/dashboard/SmokingConditions.tsx`) — client component;
  fetches weather from a `zip`/`city` prop (the island supplies those from `getProfileLite`).
- **Notifications** (`components/dashboard/Notifications.tsx`) — fully client; SWR on mount
  (its RPC is `auth.uid()`-scoped and only resolves on the browser client).
- **Aging Shelf** (`components/dashboard/AgingAlerts.tsx`) — server-fed via `initialItems`.

Consequence: the collapsed **summary line must be derived inside each widget** (client-side
where the data lives), not precomputed on the server. So the collapse/expand chrome is a
shared presentational wrapper each widget renders into; the **pager itself stays data-agnostic**.

## Architecture

Three small, well-bounded units plus targeted widget edits.

### 1. `DashboardPager` (new client component)

`components/dashboard/DashboardPager.tsx`. Pure UI — no data.

- Receives the three slides as `children` (each an existing island, still Suspense-wrapped so
  streaming is preserved).
- Owns: active index, looping translate, dots, arrows, drag/swipe, keyboard arrows.
- **Looping without double-fetch:** do NOT clone slide DOM (cloning an async island would
  trigger a second data fetch). Use a **no-clone ring**: the same 3 slide nodes are positioned
  by per-slide transform computed from `(i - active)` wrapped to the nearest of `{-1, 0, +1}`;
  on navigation the offscreen wrapping slide repositions without transition while the visible
  ones animate. (Pure index math is extracted and unit-tested — see Testing.)
- Broadcasts a **collapse signal** to cards on every navigation via a context counter
  (`CollapseContext`): the value increments on swipe/arrow/dot, and cards collapse when it
  changes. The pager never needs to know which card is expanded.
- Fixed pager height = the uniform collapsed card height; expansion animates the active card's
  own height below the viewport line (the pager viewport does not clip vertical growth — the
  expanded detail renders below and pushes following content).
- A11y: arrows and dots are real `<button>`s; container has
  `role="region" aria-roledescription="carousel"`; `touch-action: pan-y` on the track so
  vertical scrolling is never trapped.

### 2. `DashboardCard` (new client component)

`components/dashboard/DashboardCard.tsx`. Shared collapsed/expanded chrome.

- Props: `icon: ReactNode`, `title: string`, `summary: ReactNode`, `children: ReactNode`
  (the detail).
- Self-manages `expanded` (useState); tap on the collapsed header toggles it.
- Consumes `CollapseContext`; collapses itself when the counter changes (i.e. on pager
  navigation).
- Renders the uniform collapsed header (icon + title + summary) always; the detail
  (`children`) is in an animated collapsible region (max-height/opacity transition, the same
  feel as the mockup). Expanded state adds the gold glow ring.
- `aria-expanded` on the toggle.

### 3. Widget edits (Smoking Conditions, Notifications, Aging Shelf)

Each widget keeps its own data fetching and renders its content **through `DashboardCard`**,
supplying its own `icon`, `title`, `summary`, and detail body:

- **Smoking Conditions** — summary e.g. `72°F · 55% RH · Ideal` (derived from its weather
  state; a sensible loading/﻿unavailable summary when weather hasn't resolved). Detail: the
  existing conditions breakdown.
- **Notifications** — summary e.g. `3 new · Marcus replied to you`, or `All caught up` when
  zero. Detail: the existing activity list.
- **Aging Shelf** — summary e.g. `2 ready soon · Padrón 1964`, or `Nothing aging yet`. Detail:
  the existing aging list.

Each widget's current full render becomes its `DashboardCard` detail; the summary is a new
compact line each derives from data it already has.

### 4. `app/(app)/home/page.tsx`

Replace the three stacked `<Suspense>` blocks (Smoking Conditions, Notifications, Aging) with
a single `<DashboardPager>` wrapping those same three Suspense-wrapped islands. Order:
Smoking Conditions · Notifications · Aging Shelf. Everything else on the page (Masthead,
Tonight's Pairing, The Wire/News, Field Guide, Local Shops) is unchanged and stays stacked.

### 5. Skeletons

`app/(app)/home/_skeletons.tsx` gains a single uniform **pager skeleton** (one collapsed-card
placeholder + dots) used as the fallback while the active slide streams. The per-widget
skeletons remain for their Suspense boundaries inside the pager.

## Scope

- **In:** the pager + card components, the three widget refactors, `page.tsx` wiring, the
  pager skeleton.
- **Applies wherever the home dashboard renders** (it's a single centered column at all
  widths). Arrows/dots give a non-touch affordance on desktop; swipe covers mobile/PWA.
- **Out:** Masthead, Tonight's Pairing, News/The Wire, Field Guide, Local Shops — untouched.
  No data-fetching changes to the widgets (no migration entanglement). No new dependencies
  (hand-rolled carousel, no carousel library).

## Performance

- Animation is transform/opacity/max-height only (compositor-friendly). No backdrop-filter.
- **No double data fetch** — the no-clone ring keeps each island rendered once.
- Streaming preserved: each slide is still its own Suspense boundary, so a slow widget doesn't
  block the others or the page shell.
- The pager keeps all three slides mounted (cheap once resolved); only the active one is
  on-screen. Acceptable — these are small cards.

## Error / edge handling

- A widget that errors or has no data still shows its collapsed card with an appropriate
  summary (`All caught up` / `Nothing aging yet` / conditions-unavailable). The pager never
  shows an empty slot.
- Single-item degenerate case is irrelevant (always exactly 3), but the wrap math handles any
  N ≥ 1.

## Testing

- **Unit (pure logic, `lib/`):** extract the carousel index math into
  `lib/ui/carousel.ts` — `wrapIndex(i, n)` and `slideOffset(i, active, n)` (the
  nearest-of-{-1,0,1} ring offset) — and unit-test wrap-around both directions and offset
  assignment. This is the part most likely to have an off-by-one; it's the testable core.
- **No component DOM tests** (repo convention: pure logic only; presentational verified
  visually).
- **Local verification (Dave's requirement):** run locally, confirm on a phone-width viewport:
  loop both directions, inline expand pushes The Wire down, swipe collapses, dots + arrows
  work, uniform collapsed height, vertical scroll still smooth over the card, all three
  summaries read correctly.

## Open questions deferred to the plan

- Exact swipe threshold and animation timing (ported from the mockup: ~40px threshold,
  `.3s cubic-bezier(.16,1,.3,1)`), tuned locally.
- Whether tapping a dot animates through intermediate slides or jumps (default: jump to that
  index, collapse).
