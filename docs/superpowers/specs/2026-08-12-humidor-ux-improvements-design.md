# Humidor UX Improvements — Design Spec

**Date:** 2026-08-12
**Status:** Approved by Dave (mockup review, 2026-08-12)
**Mockups:** `mockups/humidor-ux/index.html` (list) + `mockups/humidor-ux/detail.html` (detail), untracked
**Surfaces:** `/humidor` (HumidorClient) and `/humidor/[id]` (HumidorItemClient)

Eight improvements found in a UX review of the humidor list and cigar detail
pages, iterated through mockups and approved. The Humidor Conditions (Govee)
row, header tabs, humidor chips, notes section, and smoke history are
explicitly unchanged.

---

## List page (`/humidor`)

### 1. Search field

- A search input joins the toolbar row (below the Conditions row, above the
  list), filtering as-you-type across brand, series, and wrapper.
  Case-insensitive substring match, client-side over the already-loaded SWR
  list — no server round-trips.
- The sort `<select>` compresses to an icon button that opens the same sort
  options as a menu. The grid/list view toggle is unchanged.
- No filter chips of any kind (explicitly rejected in review).
- Search applies within the currently selected humidor chip scope.

### 2. Aging states driven by `aging_target_date`

The list badge today shows raw day counts only, while the target date the
user set drives home-page Aging Alerts and push. New row badge states:

| State | Condition | Treatment |
|---|---|---|
| Aging | target set, >14d away | muted: `Aging 84d · ready Nov 12` |
| Almost there | target within 14d | amber: `Almost there · 9d to go` |
| Ready | target reached | gold: `✦ Ready to smoke` |
| No target | `aging_target_date` null | unchanged: `Aging 41d` (nothing if no aging start) |

- New sort option **"Ready first"** (ready → almost → aging → no target,
  ties by days aging descending).
- Badge logic lives in a shared helper (e.g. `lib/humidor/aging-state.ts`)
  so list and detail (item 6) render identical states.
- Applies to both list rows and grid cards.

### 3. Swipe-to-log on list rows

- Swiping a list row left reveals two actions, Mail-style:
  - **Quick Log** (ember, outermost, full-swipe default): opens the existing
    quick-log modal in place; on submit inserts the smoke log, decrements
    quantity, revalidates the humidor cache (same behavior as the detail
    page's Quick Smoke Log).
  - **Burn Report** (gold): navigates to `/humidor/[id]/burn-report`.
- Grid view: **no swipe.** Cards tap through to detail as today.
- Gesture care: must not fight vertical scrolling or the route-level
  pull-to-refresh (PRs #566-573) — horizontal intent lock (e.g. only claim
  the gesture after |dx| > |dy| threshold), passive listeners, transform-only
  animation.
- The quick-log modal is extracted from `HumidorItemClient` into a shared
  component so both surfaces use one implementation.
- If quick-log from the list takes quantity to 0, show the last-stick prompt
  (item 8).

### 4. Last-one indicator

- When `quantity === 1`, the `×1` count badge turns ember (color only — no
  extra text, explicitly trimmed in review).
- List rows only. Grid cards are unchanged (they hide the badge at
  quantity 1 today, and stay that way).

---

## Detail page (`/humidor/[id]`)

### 5. Vitola spec strip

- New spec chips under the hero: **Vitola** (`{format} · {length}″ × {ring}`,
  highlighted), **Wrapper** (shade + country, as today), **Binder**,
  **Filler**. Chips render only when their data exists.
- `length_inches` is currently fetched but never displayed; ring gauge
  currently sits in the Stats section — it moves here and leaves Stats
  (item 8 bonus).

### 6. Aging bar honors the user's target

- With `aging_target_date` set: progress = elapsed / (target − start),
  endpoint labels = start date and `{target} · your target`.
- Target reached: bar fills gold, and a gold "Ready to smoke" strip appears
  ("Rested past your {date} target"), matching the list's Ready badge.
- No target set: current 180-day fallback behavior, unchanged.

### 7. Action stack → two buttons + overflow menu

- Page keeps two action buttons: **File Burn Report** (primary) and
  **Quick Smoke Log** (secondary).
- A `…` button in the top row (opposite "Back to humidor") opens a menu
  sheet: Edit Details · Move to another humidor (only with 2+ humidors) ·
  **Add to Wishlist** (new) · Remove from Humidor (danger, visually
  separated last).
- Add to Wishlist inserts a wishlist row (`is_wishlist = true`) for the same
  `cigar_id` (no-op with toast if already wishlisted). Wishlist is exempt
  from the free-tier limit, so no gating.
- Remove keeps its existing confirm dialog.

### 8. Last-stick moment (both logging paths)

- When a quick log drops quantity to 0 (from detail or the list swipe), a
  centered modal appears: **"That was your last one"** with three choices:
  1. Add to Wishlist for a re-buy (primary)
  2. Keep at 0 for my records (secondary, dismiss)
  3. Remove from Humidor (danger)
- The burn-report finish screen's existing "You're out of this cigar" notice
  adopts the same three options so both flows end identically.
- **Stats bonus:** Ring Gauge card is replaced by **On Hand** value
  (`quantity × price_paid_cents`, e.g. `$96` with sub `4 × $24`); hidden
  when no price is set.

---

## Non-goals / unchanged

- Humidor Conditions (Govee) row: position and behavior untouched.
- Header (tabs, title, Add Cigar, humidor chips), wishlist, burn-reports,
  stats tabs: untouched.
- Grid view gains no swipe actions and no ×1 treatment.
- No new dependencies; swipe is hand-rolled with the gesture guards above.

## Performance guardrails

- Search is a client-side filter over data already in SWR cache.
- `/humidor` stays a static shell; nothing here adds server cost to the
  route (static-shell nav rule).
- Swipe uses transform/opacity only; content-visibility optimizations on
  rows are preserved.

## Testing

- Unit: aging-state helper (all four states + boundary at 14d and target
  day), on-hand value formatting, search filter matching.
- Runtime: `verify-in-app` pass across list (search, swipe, badges) and
  detail (specs, aging target, menu, last-stick) before any PR merges.
