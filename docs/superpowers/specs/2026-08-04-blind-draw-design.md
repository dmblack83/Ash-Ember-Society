# The Blind Draw — Home Page Random-Cigar Card

**Date:** 2026-08-04
**Status:** Approved via interactive mockup (`mockups/cigar-roulette/index.html`); direction A (slot reel), copy finalized by Dave.
**Goal:** A card on /home, below the dashboard carousel, that picks a random cigar from the user's humidor with a slot-reel animation, and flows into a burn report.

## Locked decisions (mockup + Dave's requirements)

- **Animation:** slot reel (direction A). Vertical reel of cigar rows decelerating onto the pick (~2.8s CSS transform, compositor-friendly). Wheel and deck-shuffle directions rejected.
- **Copy:** eyebrow `THE BLIND DRAW`; line "Can't decide? Let fate choose your next burn." on a SINGLE row (type sized responsively so it never wraps, down to 320px); CTA **Draw**; result actions **Light It Up** / "Draw again". No sub-line. No casino language anywhere.
- **Visibility:** card renders ONLY when the user has more than 1 unique cigar in the humidor (distinct catalog cigars, non-wishlist, quantity > 0). Otherwise the card is absent entirely, no empty state.
- **Images:** real cigar images everywhere (reel rows and result) via the existing `CigarImage` component (user photo → catalog image → wrapper-shade default).
- **Result shows:** image, brand, series, vitola (format).
- **Light It Up** → navigates to `/humidor/[itemId]/burn-report` for the drawn item, the existing burn-report create flow.
- **Overlay, not in-card (Dave, mid-build):** tapping Draw opens the existing `BottomSheet` primitive containing the reel + result; the home card itself is a fixed-height teaser that never changes size, so nothing below it shifts. Sheet close resets to idle.

## Behavior

- **Pool:** one entry per unique catalog cigar (so 20 sticks of one cigar don't dominate the odds); uniform random across the pool.
- **Draw again:** re-picks uniformly, excluding the immediately previous pick so a redraw always changes the result.
- **Reduced motion:** `prefers-reduced-motion` skips the reel and fades straight to the result.

## Architecture

| Piece | Detail |
|---|---|
| `lib/home/blind-draw.ts` | Pure logic: `drawPool(items)` (dedupe by cigar_id, quantity > 0), `isDrawEligible(pool)` (length > 1), `pickDraw(pool, excludeItemId?, rng?)`. Unit-tested. |
| `components/dashboard/BlindDraw.tsx` | Client card (fixed-height teaser) + `BottomSheet` holding reel → result states, styled to the dashboard card chrome (eyebrow/mono, Cormorant, card border + ember radial accent). |
| `BlindDrawIsland` in `app/(app)/home/client-islands.tsx` | Session via `useAppSession`, data via SWR `keyFor.humidorItems(userId)` + existing `fetchHumidorItems` (shared cache entry with /humidor, no new query shape). Renders null while loading or ineligible. |
| `app/(app)/home/page.tsx` | Island inserted below `DashboardPagerIsland`. |

## Constraints

- /home stays a fully static shell: the card is a client island fetching via SWR, no server reads (check:shells must stay green).
- No new dependencies; animation is CSS transform only.
- No DB changes, no new API routes.

## Testing

- Unit: pool dedupe, eligibility threshold (0/1/2 unique), exclusion on redraw, quantity-0 filtering.
- `tsc --noEmit`, unit suite, production build + `check:shells`.
- Runtime verification (verify-in-app) before merge: eligible account shows card, draw lands on a real cigar with image, Light It Up opens that cigar's burn report; account with 0-1 unique cigars shows no card.
