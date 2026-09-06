# Mobile Menu + Catalog Search + Admin Nav — Design

**Date:** 2026-09-06
**Status:** APPROVED. Mockups: `mockups/mobile-nav/01-topbar-side-sheet.html`, `mockups/mobile-nav/02-catalog-search.html` (both reviewed by Dave).

## What this is

Three connected pieces, mostly navigation plumbing:

1. **Mobile top bar + side-sheet nav** — the only new UI. Desktop has the side rail (PR #597); mobile has only the 5-tab bottom nav, so anything off those tabs is unreachable. A slim global top bar (hamburger left, wordmark center) opens a left side sheet.
2. **Catalog search** — re-link the existing orphaned `/discover/cigars` browse + `/discover/cigars/[id]` detail pages (kept in Aug 2026 for exactly this revival). One feature addition: the Suggest Edit button (today humidor-item-only) gets wired into catalog detail.
3. **Admin in nav** — link to the existing `/admin` page (already server-gated by `is_admin` redirect), visible only to admin accounts, on both the mobile sheet and the desktop rail.

## Decisions (Dave)

- Hamburger placement: slim global top bar, mobile only (52px + safe-area, glass blur matching nav chrome). Desktop unchanged: rail, no top bar.
- Sheet contents: the 5 main tabs (active highlighted) + "Explore → Catalog Search" + "Manage → Admin" (admin only) + identity chip footer. Wishlist/Stats/Field Guide links declined.
- Close affordances: ✕ button in sheet header, scrim tap, Escape, swipe-left, auto-close on navigation.
- Keep the `/discover/cigars` URL (no rename to /catalog).
- Bottom nav untouched.

## Architecture

### New: `components/nav/MobileNav.tsx`

One client component owning top bar + sheet + open state (no cross-component state needed):

- Top bar: `lg:hidden`, fixed top, `z-40`, height `52px + env(safe-area-inset-top)`, background `rgba(26,18,16,0.95)` + blur — same chrome recipe as BottomNav/SideRailNav.
- Sheet: 300px left drawer, `z-50` + scrim, `transform: translateX` animation (compositor-only), `prefers-reduced-motion` honored. Focus trap while open, body scroll lock, Escape + scrim + ✕ + swipe-left to close, `usePathname` effect closes on navigation.
- Data: session via `useAppSession`, profile via existing `keyFor.profile` SWR (already includes `is_admin` in `fetchProfileLite`) — zero new fetch paths; profile fetch gated on sheet having been opened at least once (lazy).
- Nav items: reuse the layout's `NAV_ITEMS` (export it); Catalog + Admin links defined alongside.
- Prefetch: main-tab links `prefetch={true}` (static shells, same as bottom nav); Catalog + Admin `prefetch={false}` (deep/dynamic routes; static-shell rule says check before making anything heavier).

### Fixed-header offset system (the risky part, done once, mechanically)

Several routes render their own `position: fixed; top: 0` headers with `paddingTop: env(safe-area-inset-top)` (Humidor + skeletons, Wishlist, Burn Reports, Lounge, Account, Home). The top bar must push these down on mobile without touching desktop. Two CSS variables in `globals.css`:

```css
:root {
  --mobile-topbar-h: calc(52px + env(safe-area-inset-top));
  --page-top-offset: var(--mobile-topbar-h);   /* mobile: below the top bar */
  --page-header-safe-pad: 0px;                  /* top bar already ate the notch */
}
@media (min-width: 1024px) {
  :root { --page-top-offset: 0px; --page-header-safe-pad: env(safe-area-inset-top); }
}
```

- Every fixed page header: `top: var(--page-top-offset)` and `paddingTop: var(--page-header-safe-pad)` (replacing `top: 0` / `env(...)`). Matching skeleton headers get the same edit so loading states don't jump.
- `<main>` in the app layout: `paddingTop: var(--page-top-offset)` on mobile (0 on lg via the var). Pages with fixed headers keep their measured-height spacers, which now stack correctly below the bar; scroll-flow pages just start 52px lower.
- Onboarding (`hideNav`) renders no top bar and keeps zero offset (`--page-top-offset` consumed only when nav visible — layout applies the padding conditionally, same `hideNav` branch as today).

### Desktop rail additions (`SideRailNav` in `app/(app)/layout.tsx`)

- Below the 5 rail items: divider, Catalog Search link, Admin link (ember-tinted) rendered only when `profile.is_admin`. Profile is already fetched in the rail. `prefetch={false}` on both.

### Catalog dust-off

- No changes to `DiscoverCigarsClient` / browse behavior.
- `CigarDetailClient`: add `CigarEditSuggestButton` (existing component, lazy-loads `SuggestCigarEditSheet`) to the actions section, passing the cigar's current field values.
- Runtime shakedown of the whole journey (search → detail → add to humidor → wishlist → suggest edit) via `verify-in-app`; fix bitrot found, nothing more.
- PROJECT_STATE.md: correct the stale page-table row (route is live again, was "orphaned").

### Admin

- No security changes. `/admin` keeps its server-side `is_admin` redirect as the enforcement; nav links are cosmetic visibility on top.

## Testing / verification

- `npm run build` green; `npm run check:shells` (bottom-nav routes must stay static — this change adds no server cost to them).
- Visual: 320/375/768/1024/1440; sheet open/closed; admin on/off; fixed-header pages (Humidor, Lounge, Account) aligned under the bar with no gap/overlap; onboarding unaffected.
- A11y: focus trap, Escape, `aria-modal`, `aria-expanded` on hamburger, reduced motion.
- `verify-in-app` on: any tab (top bar + sheet), catalog journey, `/admin` as admin and as regular member (member sees no link; direct URL still redirects).

## Out of scope

- Bottom-nav changes; URL rename; catalog page feature work beyond the Suggest Edit button; Wishlist/Stats/Field Guide sheet links; any desktop rail redesign.

## Build order

1. `globals.css` vars + `MobileNav` component + layout integration (render, main padding, `NAV_ITEMS` export).
2. Fixed-header conversions (headers + skeletons) — one mechanical pass, verified page by page.
3. Rail additions (Catalog + Admin).
4. `CigarDetailClient` + Suggest Edit button.
5. Build, shells check, runtime verification, PROJECT_STATE correction, PR.
