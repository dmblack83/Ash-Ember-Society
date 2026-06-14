# Floating Pill Bottom Nav (mobile/PWA) — design

**Date:** 2026-06-14
**Status:** Approved (validated via live mockups in the visual companion)
**Branch:** `feat/pill-nav-mobile`

---

## Goal

Replace the current solid, edge-to-edge bottom navigation with a **floating, translucent
"pill" bar** in the lounge palette, with a glow-pill active state and two new icons. Mobile/
PWA only. Labels stay.

## Approved visual (from mockups)

- **Bar:** floats above content with side margins and a hairline gold edge — not edge-to-edge.
  Translucent dark walnut with a backdrop blur so app content shows faintly behind it.
- **Active state ("Option B — glass pill + glow"):** the active tab sits in a soft
  translucent gold pill with an inset gold ring and a faint outer glow; its icon + label turn
  gold. Inactive tabs are muted (`--muted-foreground`).
- **Order / center:** Humidor · Lounge · **Home (center)** · Discover · Account. Home is in
  the center slot but **flat** — the elevated/raised center treatment is removed.
- **Labels:** kept (10px), under each icon.
- **Icons:** Humidor → **cabinet**; Lounge → **modern sofa**; Home, Discover, Account →
  unchanged.

### Exact styling (ported from the approved mockup)

Bar (the `<nav>`):
- `padding: 8px`
- `border-radius: 26px`
- `background: rgba(36,28,23,0.72)` (translucent `--card`)
- `backdrop-filter: blur(18px)` + `-webkit-backdrop-filter: blur(18px)`
- `border: 1px solid rgba(212,160,74,0.16)` (faint gold)
- `box-shadow: 0 8px 30px rgba(0,0,0,0.5)`
- horizontal margin from screen edges (wrapper side padding ~12px)
- sits above `env(safe-area-inset-bottom)` with ~16px gap

Each tab:
- column layout, icon over label, `gap: 3px`, `padding: 6px 4px`, `border-radius: 18px`
- inactive `color: var(--muted-foreground)`; transition
  `all .22s cubic-bezier(.16,1,.3,1)` (matches the app's `--ease-out-expo`)
- icon box 34×34, svg 21px; label 10px

Active tab:
- `background: rgba(212,160,74,0.15)`
- `color: var(--gold, #D4A04A)` (icon + label)
- `box-shadow: inset 0 0 0 1px rgba(212,160,74,0.4), 0 0 16px rgba(212,160,74,0.22)`

### New icon SVGs (stroke = currentColor so they inherit active/inactive color)

Cabinet (Humidor), 24×24, strokeWidth 1.7, round caps/joins:
```
<rect x="5" y="3" width="14" height="18" rx="1.5"/>
<line x1="12" y1="3.5" x2="12" y2="20.5"/>
<line x1="9.6" y1="10.6" x2="9.6" y2="13"/>
<line x1="14.4" y1="10.6" x2="14.4" y2="13"/>
<line x1="6.5" y1="21" x2="6.5" y2="22.5"/>
<line x1="17.5" y1="21" x2="17.5" y2="22.5"/>
```

Modern sofa (Lounge), 24×24, strokeWidth 1.7, round caps/joins:
```
<path d="M20 9V6.5A2.5 2.5 0 0 0 17.5 4h-11A2.5 2.5 0 0 0 4 6.5V9"/>
<path d="M2.5 11A1.5 1.5 0 0 1 4 12.5V15h16v-2.5A1.5 1.5 0 0 1 21.5 11 1.5 1.5 0 0 1 23 12.5V17a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-4.5A1.5 1.5 0 0 1 2.5 11Z"/>
<path d="M5 18v2"/>
<path d="M19 18v2"/>
```

## Architecture / scope

- **Only `app/(app)/layout.tsx`** is touched — specifically the `BottomNav` function and the
  `NAV_ITEMS` icon definitions for Humidor and Lounge.
- Remove the `center: true` special-casing in `NAV_ITEMS` / `BottomNav` (the raised circle for
  Home). Home renders as a normal flat tab in the center slot.
- **`SideRailNav` (desktop, lg+) is out of scope** — it keeps its current look. (Optional
  consistency pass on its active color is a separate, later change.)
- **Layout/padding:** the page content already reserves bottom space for the old fixed bar
  (`pb-[calc(88px+env(safe-area-inset-bottom))]`). Keep equivalent bottom clearance so a
  floating bar never overlaps content; adjust the constant only if the floating bar's height
  differs.
- **Toasts** must still appear above the nav (existing z-index behavior preserved).
- The `hideNav` rule (hidden on `/onboarding`) is unchanged.

## Non-goals

- No change to navigation behavior, routes, prefetch, or the active-route matching logic
  (`match(pathname)`), only its visual treatment.
- No icon changes beyond Humidor + Lounge.
- No desktop side-rail redesign.
- No labels removed.

## Performance

`backdrop-filter: blur()` is GPU-cheap for a single small bar and is well-supported on iOS
Safari (with the `-webkit-` prefix). No new dependencies, no bundle impact (inline SVG +
CSS). Keep `will-change` off the bar (it's static); the only animated property is the active
pill's background/box-shadow on tab change, which is compositor-friendly.

## Testing / verification

- Visual: run locally, confirm on an iPhone-width viewport that the bar floats with the blur,
  the active glow pill reads correctly, Home is centered and flat, and the cabinet + sofa
  icons render.
- Confirm content isn't occluded by the floating bar at the bottom of scrollable screens.
- Confirm both themes/states: active vs inactive tabs, and the `/onboarding` hidden case.
- Dave reviews locally (the stated requirement: verify and iterate locally before prod).
