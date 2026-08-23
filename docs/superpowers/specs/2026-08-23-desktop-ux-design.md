# Desktop UX pass — design spec

Date: 2026-08-23
Status: APPROVED (all seven items; Dave granted full execution authority through PR)
Visual reference (authoritative): `mockups/desktop-ux/index.html`
Scope: **lg+ (1024px and wider) only.** Mobile DOM, behavior, and the static-shell
rule for bottom-nav routes are untouched by every item below.

## Global decision — centering

All constrained columns center within the content area to the right of the side
rail (`mx-auto`, the app's existing pattern). On wide screens spare width splits
evenly on both sides; never a lopsided right gutter. Confirmed by Dave 2026-08-23.

## Prior decisions honored

- The home DashboardPager **stays a pager** (rejected replacement, 2026-08-14
  review). Item 02 relocates it into the left column unchanged: same slides
  (Smoking Conditions / Notifications / Aging Alerts / conditional Govee),
  same arrows/dots.

## Approved items

### 01 — Humidor list: centered column + hover quick actions
- List page containers (`components/humidor/HumidorClient.tsx`, sticky header +
  content, currently `max-w-6xl`) narrow to `max-w-3xl` (768px), centered.
  All existing chrome retained: tabs row, title + count/value, Add Cigar,
  + New Humidor, search + filter + view toggles, wrapper tag, qty chip, chevron.
- List rows reveal the two swipe actions as buttons on hover (and focus-within):
  Quick Log → existing QuickLogModal handler; Burn Report →
  `/humidor/[id]/burn-report`. On hover the qty chip + wrapper tag hide (both
  remain in the meta line). Gated to hover-capable pointers; touch swipe
  unchanged. Grid view layout untouched.
- Humidor search gets the "/" focus shortcut + visible kbd hint at lg (04).

### 02 — Home: two-column at lg+
- `app/(app)/home/page.tsx`: sections flow into a centered lg grid
  (`max-w-5xl`): left column TonightsPairing, DashboardPagerIsland,
  LastBurnIsland, BlindDrawIsland; right column NewsClientIsland, FieldGuide,
  LocalShopsIsland. Two wrapper divs preserve mobile DOM/stacking order.
- Masthead width matches the grid at lg. Pure CSS; no server change, no new
  fetch; `/home` stays a static shell.

### 03 — Side rail: signal, quick actions, identity
- `app/(app)/layout.tsx` SideRailNav additions, top to bottom:
  a) Humidor item: aging-ready count badge (reuses the unwindowed ready
     head-count the Last Burn fetcher computes); hidden when 0.
  b) Lounge item: ember activity dot (same thread-activity signal as the home
     Notifications card); hidden when 0.
  c) Quick-action cluster above the identity chip: "+ Burn Report",
     "+ Add Cigar" — open the same flows as the Tonight card via
     `next/dynamic` lazy imports (no initial-bundle cost).
  d) Identity chip at rail bottom: avatar + display name + "Member since",
     links to /account.
- All session-gated; renders nothing until the client session is ready.

### 04 — Keyboard: "/" focuses search
- Global-feel, per-page implementation: "/" focuses the page search field on
  /humidor (ships in 01's PR) and /discover/cigars (ships in 07's PR). Ignored
  while typing in inputs/textareas/contenteditable. kbd hint chip rendered in
  the field at lg. No command palette, no other chords.

### 05 — Lounge: fixed centered feed width
- `components/lounge/LoungeFeedClient.tsx`: every `md:max-w-[50%]` wrapper
  (title row, chips row, secondary row, feed column) becomes a fixed centered
  `md:max-w-[600px]`. No other feed changes. Trending/rules side rail is a
  possible later phase — NOT in scope.

### 06 — Cigar detail: paired columns, capped buttons
- `/humidor/[id]` below-header content becomes a centered `max-w-[960px]`
  two-column grid at lg: Your Entry (quantity stepper, aging, purchased,
  notes, both action buttons) left; Stats + Smoke History right. Action
  buttons sit side by side, no longer full-bleed. All header elements
  retained (back, overflow menu, photo + Contribute a Photo, vitola/binder/
  filler chips, Suggest an Edit). Mobile stacking order unchanged.

### 07 — Micro-polish roll-up
- Discover section tabs (Channels / Industry News / Vendors): centered over
  the content column instead of spread across the full width.
- Account copy: "Tap pencil to edit display name" → "Edit your display name
  with the pencil" (and any other desktop-visible "tap").
- Cigar-news cover images: height cap at lg (~280px, object-fit cover).
- Hover states on clickable cards/rows (discover grid, news cards, lounge
  posts; humidor rows ship in 01): border warms toward gold, pointer cursor.
  Tailwind v4 `hover:` is already gated to hover-capable devices.

## PR split

| PR | Items | Surfaces |
|----|-------|----------|
| 1 | 01 + humidor "/" (04) + spec doc | HumidorClient |
| 2 | 02 | home/page.tsx, Masthead |
| 3 | 03 | app/(app)/layout.tsx |
| 4 | 05 + 06 + 07 + discover "/" (04) | lounge, humidor detail, discover, account, news |

Each PR: fresh branch off synced origin/main, build + `npm run check:shells`
(nav-route PRs), verify-in-app desktop capture against localhost, PASS table
in the PR test plan.

## Out of scope (tracked separately)

- PROD BUG: /discover/cigars renders "No cigars found" on all viewports —
  `getPopularCigars` swallows the Supabase error and caches empty. Own
  diagnosis pass per docs/runbooks/prod-diagnosis.md.
- News numeric-entity headline fix (already queued from home review).
- Lounge trending/rules right rail (possible later phase).
