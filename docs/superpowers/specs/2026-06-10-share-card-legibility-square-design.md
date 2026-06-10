# Burn Report Share Card — Legible Type + 1080×1080 Square

Date: 2026-06-10
Status: Approved (design), ready for implementation plan
Branch: `feat/share-card-1080-square`

## Problem

The burn report share images (`lib/share-image/`, Satori+Sharp) render text too small to read when shared to social or via text — viewers must pinch-zoom to read anything.

**Root cause (diagnosed, not assumed):** absolute type scale, not aspect ratio. The card is typeset with values suited to a ~480-540px design, then rendered onto a 1080px canvas. As a share of image width, the text people want to read lands at ~1.4-1.6% (cigar name 20px = 1.85%, review/thirds prose 15-17px = 1.4-1.6%, mono labels 7-10px = 0.7-0.9%). Only the 52px score (4.8%) survives. When a feed or an opened iMessage shows the image scaled to fit a phone (~390px wide, a 0.36x downscale), body text is ~5-7 CSS px and labels ~3 CSS px. The 2x supersampling step scales everything uniformly, so it sharpens but does not change the type-to-canvas ratio. Nothing shrinks the text; it was authored small.

A tall, variable-height card compounds the problem in feeds (more downscale).

## Goal

1. Text legible at the size viewers actually see, without zooming.
2. Output optimized for Instagram: each page a fixed **1080×1080** square (clean carousel; full-width, no tall-downscale).
3. Keep every element shown today.

## Format change: fixed 1080×1080 squares

Both pages become fixed 1080×1080. This replaces today's "1080 wide × trimmed variable height." Page 2 still only generates when it has content (`shouldRenderPage2`, unchanged).

A square cannot grow, so content is laid out to fit the box and vertically centered — short reports get even top/bottom margins (elegant, not empty). Content that could overflow is bounded (see Fitting).

## Type scale (the fix)

Centralize the scattered inline font sizes into a `type` scale in `lib/share-image/tokens.ts`, and roughly double it. Tiny mono labels get bumped a bit more so the smallest meaningful text clears a legibility floor: body prose ≈ 3% of width (~32px), labels ≈ 2% (~20px).

| Element | Now | Target |
|---|---:|---:|
| Overall score number | 52 | ~72 |
| Brand / series identity | 20 | ~38 |
| Review / thirds / tasting prose | 15-17 | ~30-34 |
| Sub-rating + spec values | 16 | ~30 |
| Grade / format sub-lines | 12-13 | ~24 |
| Mono labels (masthead, sub-ratings, spec, footer, attribution) | 7-10 | ~18-20 |
| Pull-quote mark | 42 | ~72 |
| Stars | 12 | ~22 |

Centralizing the scale means future tuning is one edit and `page1.tsx` / `page2.tsx` stop hardcoding sizes. Exact values are tuned during implementation against the real rendered PNG; the table is the target, the legibility floor is the constraint.

## Fitting content into the square

Two spots can overflow a fixed box. Both are bounded so type size is never sacrificed:

- **Page 1 photos** scale to fit the band remaining after masthead + hero + sub-ratings + footer (a reserved height), instead of full-width 4:3. They stay; they're just sized to the square.
- **Page 1 brand** currently uses `whiteSpace: nowrap` at 20px; at ~38px a long brand can overflow `CONTENT_WIDTH`. Allow it to wrap (centered) so it never clips.
- **Page 2 prose** (review + each third) clamps to a max line count with a graceful ellipsis via a small `clampText` helper, so a long report can't blow past 1080. Short prose is untouched.

## Render pipeline

`app/api/burn-report/[id]/share-image/route.ts`:

- Satori renders at a fixed **1080×1080** (`width: 1080, height: 1080`) with the card vertically centered, instead of `height: IMAGE_MAX_HEIGHT`.
- The 2x supersampling stays (render at 2160×2160, resize to 1080×1080) for crisp text.
- The variable-height `.trim()` step is **removed** — output is a fixed 1080×1080 square. `flatten` (background) stays.
- The `out=WxH` diagnostic log stays (now always 1080×1080).

Clamps are tuned so the densest realistic report (all three thirds + a long review + tasting notes + spec strip) fits 1080 at the target type scale.

## Components touched

- `lib/share-image/tokens.ts` — add a centralized `type` scale; keep existing color/layout tokens. Add `IMAGE_HEIGHT: 1080`.
- `lib/share-image/page1.tsx` — consume the type scale; size photos to the reserved band; allow brand to wrap; vertically center within the square.
- `lib/share-image/page2.tsx` — consume the type scale; clamp review + thirds prose; vertically center.
- `lib/share-image/helpers.ts` — add `clampText(text, maxChars | maxLines)` (pure, unit-tested).
- `app/api/burn-report/[id]/share-image/route.ts` — fixed 1080×1080 render, drop trim.

## Out of scope

- The share button flow (`ShareReportButton.tsx`) — unchanged; still shares 1-2 PNGs.
- What data is shown — no fields added or removed.
- Page-2 generation rule (`shouldRenderPage2`) — unchanged.

## Testing

- **Unit (Vitest, `lib/**`):** `clampText` (clamps long text, leaves short text, adds ellipsis, handles empty/null); a sanity test that the `type` scale exposes the expected keys and that body/label sizes meet the legibility floor relative to `IMAGE_WIDTH`.
- **Visual:** generate the real PNGs for representative reports (sparse: score + identity only; dense: 3 thirds + long review + 3 photos) and confirm both pages are exactly 1080×1080, nothing clips, text is legible at phone-fit scale.
- **Manual (Dave, on preview):** share to Instagram and via iMessage; confirm readable without zoom; confirm square renders correctly in the IG carousel.

## Risks

- **Overflow / clipping** if content exceeds the square — mitigated by photo-band sizing + prose clamps; tuned against the dense-report case during implementation.
- **Type tuning is visual** — exact px values are iterated against the rendered PNG, not guessed; Dave validates the preview before merge (per the reliability working agreement's validated-merge principle).

## Revert path

Self-contained to `lib/share-image/` + the one route. Revert the commit(s); no migration, no data change, no coupling to the share button.
