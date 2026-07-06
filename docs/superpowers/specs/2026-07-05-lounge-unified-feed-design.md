# Lounge Unified Feed — Design Spec

Date: 2026-07-05
Status: Approved by Dave (mockup-validated: `mockups/lounge-feed/`)

## Goal

Replace the lounge's room-based navigation with a single unified feed.
All posts flow into one scrollable surface; category chips at the top
filter it. Rooms stop existing as destinations.

## Approved decisions

1. **Full replacement.** No room pages remain; chips ARE the room view.
2. **All feed includes everything** — discussion, burn reports, feedback.
3. **Categories: All | General | Burn Reports | Feedback.** Welcome
   posts are folded into General (data migration).
4. **Default sort: newest first.** Secondary view row: New (default) |
   Hot | My Posts.
5. **Burn reports open fullscreen** (existing BurnReportModal/VerdictCard
   pattern), with comments available both inline on feed cards and
   inside the fullscreen view.
6. **Condensed burn card gains the report's first photo** below the
   4-cell rating stripe (omitted when the report has no photos).

## Navigation and URL state

- `/lounge` renders the feed.
- Active chip in the URL: `/lounge?c=burn-reports`. Secondary view:
  `&v=hot` / `&v=mine` (absent = New). Back button, sharing, and PWA
  resume all preserve state.
- `/lounge/rooms/[slug]` becomes a server redirect to `/lounge?c=<slug>`
  (`welcome` redirects to `/lounge?c=general`). No existing links or
  notifications break.
- `/lounge/[postId]` detail route unchanged — canonical deep link for
  sharing stays as-is.

## Header

Three stacked elements, in the app-shell sticky header:

1. Title row: "The Lounge" + New Post button (unchanged).
2. Chip row: All, General, Burn Reports, Feedback. Active chip uses the
   ember treatment. Horizontally scrollable if needed.
3. Secondary row — a single contextual slot, plain text buttons,
   selected item gold + gold underline:
   - Feedback chip active: **Open | Closed | My posts** (existing
     feedback status filter, relocated).
   - Every other chip: **New | Hot | My Posts**.

## Feed behavior

- **New:** `created_at desc`, infinite scroll. Generalizes the existing
  per-room SWR machinery — category becomes nullable in the fetcher and
  cache key (`keyFor.loungeFeed`).
- **Hot:** posts ranked by comment count over the trailing 7 days,
  tie-break `created_at desc`. Implemented as a Postgres RPC
  (`get_hot_posts(category_id nullable, page params)`); SQL is a
  manual-apply block for Dave per the usual workflow. Falls back to New
  if the RPC is missing (same fallback pattern as `get_report_numbers`).
- **My Posts:** current user's posts, newest first.
- **Category tag** on each card in the All view only; tapping it
  activates that chip. Hidden when a specific chip is active.
- **Inline comments** on every card type via the existing InlinePost
  comment machinery, extended to burn-report preview cards.
- **Burn report cards:** existing BurnReportPreviewCard + first photo
  (first third with an image) below the stripe. Tapping the card body
  opens the fullscreen report (VerdictCard in BurnReportModal) with a
  full comments section appended.
- **Pinned posts** render only when their category's chip is active;
  All stays clean.
- **Rules gate** keeps its mechanics but detaches from the Welcome room:
  the agree-before-posting check triggers from the composer, rules open
  in the existing modal.

## Data changes

- **Migration (manual SQL):** reassign Welcome-category posts to
  General. Whether the welcome category row itself is deleted or kept
  (it may anchor the rules post via `is_gate`) is decided at
  implementation after tracing the `rulesPost` wiring — the feed never
  shows a Welcome chip either way.
- **Hot RPC** (above), manual SQL.
- **Index check:** verify `forum_posts` has an index serving
  `created_at desc` for the unfiltered feed; add if missing (manual
  SQL).

## Composer

- Category dropdown offers General / Burn Reports / Feedback only
  (no gate/locked categories).
- The active chip preselects the category.

## Deletions

- Room directory UI in `LoungeForumClient` (grid of rooms, counts).
- `/lounge/rooms/[slug]` page contents (route remains as redirect).
- Per-room `post_count` / `today_count` queries.

Net code and query count both shrink.

## Performance

- One feed query replaces the room-directory count queries.
- New SWR cache key shape; stale persisted keys from the old lounge are
  orphaned and harmless.
- No new dependencies; bundle delta minimal (reshuffling existing
  components). Respect existing dynamic imports (NewPostSheet stays
  lazy).

## Testing

- Unit: cache key builders, any pure filter/ranking helpers.
- Manual on-device: chip + URL back-button behavior, old room-link
  redirects, rules gate from composer, feedback status filters,
  burn-report fullscreen + comments, first-photo card rendering.
- E2E: update existing lounge specs (blocked on CI test user; tracked
  separately).

## Rollout

Sized for either one PR or a two-step split:
1. Unified feed + chips + redirects + burn card photo + fullscreen
   comments (the visible restructure).
2. Hot RPC + secondary row (needs the manual SQL applied first;
   New/My Posts work without it).

Decision deferred to the implementation plan.
