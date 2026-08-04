# Lounge: Multi-Image Posts + Comment Images — Design

**Date:** 2026-08-03
**Status:** Approved (brainstorming session with Dave); built same session
**Goal:** Regular lounge posts allow up to 3 images (today: 1). Comments and replies allow 1 image each (today: none). Feed shows a grid; tap opens the existing full-screen viewer with click-through, same as burn reports.

## Decisions (from brainstorm)

- Posts: up to **3** images. Comments/replies: **1** image each (Dave's call; keeps threads compact).
- Display: **grid** in the card (1 large, extra images as tiles), tap → `PhotoLightbox` (shared viewer already used by burn reports and lounge) starting at the tapped image.
- Approach A over a join table: extend existing tables. Max 3 images doesn't justify joins.
- No content moderation added (post images have none today) — conscious sign-off, not an oversight.
- Comments still require text (min 3 chars); image is an attachment, not a replacement.
- Deleting posts/comments does not garbage-collect storage objects — matches existing post-image behavior.

## Schema (manual-apply migration, pre-deploy gate)

```sql
alter table forum_posts    add column if not exists image_urls text[];
alter table forum_comments add column if not exists image_url  text;
```

No backfill: readers normalize via `postImages(image_url, image_urls)` (new list wins, else legacy single, capped at 3). New posts write **both** `image_urls` and legacy `image_url` (= first image) so stale clients/SW-cached code keep rendering one image.

## Components / data flow

| Piece | Change |
|---|---|
| `lib/lounge/post-images.ts` (new) | `MAX_POST_IMAGES = 3`, `postImages()` normalizer. Unit-tested. |
| `components/lounge/PostImageGrid.tsx` (new) | Renders 1 (full-width, natural ratio, current look), 2 (equal tiles), or 3 (large left + 2 stacked right) images; `onOpen(index)` callback. Lazy `next/image` tiles. |
| `NewPostSheet` | Multi-select up to 3, removable thumbnails, `compressImage` per file (also fixes the existing >4.5 MB iOS upload failure: today's composer skips compression), parallel uploads, writes `image_urls` + `image_url`. |
| `InlinePost`, `PostDetailClient`, `PostModal` | Render `PostImageGrid`; lightbox gets the full array. PostModal's bespoke inline lightbox replaced with the shared `PhotoLightbox`. |
| `lounge-fetchers`, `post-detail-fetchers`, `PostModal` select | Add `image_urls` to selects + types. |
| `PostComments` | Comment + reply composers get a photo button (1 image): compress → upload → preview → `image_url` on insert. Comment rows render the image (capped height) with `PhotoLightbox` on tap. Select/type extended. |
| `app/api/upload/image` | Add `forum-comments` to the folder allowlist. Same bucket, same 10 MB cap. |

## Testing

- Unit: `postImages` normalizer (null/legacy/array/cap/blank-string cases).
- `tsc --noEmit`, unit suite, production build + `check:shells` (lounge route must stay a static shell).
- Runtime verification via verify-in-app before the PR claims the flows work: 3-image post, comment with image, reply with image, viewer click-through at mobile width.

## Out of scope

- Image moderation, storage garbage collection, feedback-post images (composer keeps images off feedback posts, as today), burn-report photo flows (already multi-image).
