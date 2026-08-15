# The Last Burn — Home Dashboard Card — Design Spec

**Date:** 2026-08-14
**Status:** Approved by Dave (mockup review 2026-08-14; position amended to ABOVE Blind Draw)
**Mockup (authoritative visuals):** `mockups/home-ux/last-burn.html` (untracked)
**Surface:** `/home` static shell — new client island

One card showing the user's most recent smoke log, with an "On This Day"
anniversary face. Rejected siblings from the same review (do not revisit):
Shelf Report strip (redundant with /humidor), replacing the pager (pager
stays). A separate bug was found during the review — numeric HTML entities
in news headlines — fixed independently of this feature.

## Placement

Directly ABOVE the Blind Draw card (after the DashboardPager), inside the
existing `max-w-2xl` column of `app/(app)/home/page.tsx`. Pager untouched.

## Data

- Latest `smoke_logs` row for the user: order `smoked_at` desc,
  `created_at` desc tiebreak, limit 1. Select: id, smoked_at, created_at,
  overall_rating, draw_rating, burn_rating, construction_rating,
  smoke_duration_minutes, pairing_drink, review_text, flavor_tag_ids,
  content_video_id, humidor_item_id, cigar join (brand, series, format),
  burn_report join (id) for the type label.
- On This Day candidates: same select with
  `smoked_at IN (candidate dates)` where candidates are today's MM-DD for
  each of the past 5 years, plus `YYYY-02-29` when today is Mar 1 and the
  candidate year is a leap year. Oldest match wins.
- Flavor names: resolve `flavor_tag_ids` (first 3) via the existing
  `fetchFlavorTags()` cache. Video: `content_videos` lookup by id (same
  pattern as `lib/data/humidor-item-fetchers.ts`).
- One SWR key `keyFor.lastBurn(userId)`; fetched client-side in the
  island. `/home` stays a fully static shell.

## Card faces

1. **Last Burn (quick log):** eyebrow "The Last Burn" + relative time;
   score (serif italic 46px, `ratingColor()`) with `ratingLabel()` grade
   word beneath; brand caps + cigar name + meta line
   `Quick log · {Mmm D}`; notes quote (serif italic, 2-line clamp, real
   curly quotes) when `review_text` present; footer with
   "Burn history ›" link.
2. **Last Burn (full report):** adds to the meta line duration
   (`· 1h 45m`, from smoke_duration_minutes) and pairing (`· Bourbon`)
   when present; label "Full report"; Draw/Burn/Constr. mono chips row;
   footer left slot holds up to 3 flavor tag pills (overflow hidden, no
   wrap, no "+N").
3. **On This Day:** replaces face 1/2 for the whole local calendar day
   when a past-year log matches today's month+day. Gold border
   (`rgba(212,160,74,.45)`) + top-right radial glow; eyebrow
   "On This Day" with the year right-aligned in gold; meta line starts
   "One year ago today" / "{N} years ago today"; flavor tags give way to
   a bridge line: `Your last burn was {relative} · see it ›` linking to
   the latest log's cigar detail.

## Edge states

- No notes: quote block omitted entirely (no placeholder).
- Null rating: en dash in `--dim`, no grade word.
- Video log: red "▶ Watch review" chip in the footer left slot (same
  treatment as the smoke-history YouTube chip), external link.
- Long gap nudge: only when last burn > 30 days ago AND ready count >= 1
  (from the `homeAging` cache: `daysUntil(aging_target_date) <= 0`),
  footer left slot shows serif italic
  `It has been a while. {N} sticks are rested and ready.`
  (singular: `One stick is rested and ready.`). No em dashes.
- Zero logs: island renders nothing (no skeleton, no empty state) — same
  convention as BlindDrawIsland.

## Relative time

`Today` / `Yesterday` / `{N} days ago` (2-13) / `{N} weeks ago` (14-29) /
absolute `{Mmm D}` (30+). Local-time day boundaries.

## Tap targets (three, each min-height 44px)

- Card body → `/humidor/{humidor_item_id}`; when null (entry deleted) →
  `/humidor/burn-reports`.
- "Burn history ›" → `/humidor/burn-reports`.
- Video chip → `https://www.youtube.com/watch?v={id}`, `target="_blank"`
  `rel="noopener noreferrer"`.

## Non-goals / constraints

- No motion beyond the shared card fade-in; no count-up animation.
- No new dependencies; design tokens only; no em dashes in copy.
- `/home` must remain a static shell (`npm run check:shells`).

## Testing

- Unit: relative-time thresholds (boundaries at 1/2/13/14/29/30 days),
  On This Day candidate-date generation (incl. Feb 29 → Mar 1 and
  oldest-year precedence), nudge pluralization.
- Runtime: verify-in-app on `/home` with the fixture account (it has
  smoke logs from prior verification passes).
