# 02 — Data Model (Supabase, as used by the code)

> TL;DR for agents: ~31 tables + 4 storage buckets, project `qagaiuibtwuhihukghyx.supabase.co`. **RLS facts that will bite you**: `profiles` is own-row only — cross-user name/avatar reads MUST go through the `public_profiles` view; and `auth.uid()` returns NULL in server components under this app's proxy, so per-user server reads must pass `userId` explicitly or fetch client-side. Burn-report-only fields live on `burn_reports` (1:1 FK to `smoke_logs`), never on `smoke_logs`. Migrations are SQL files in `supabase/migrations/` run BY HAND in the Supabase SQL editor — drift is a real, twice-bitten risk.

## RLS reality — read first

1. **`profiles` is own-row RLS.** A client-side `.from("profiles")` for another user returns **0 rows** (silently — no error). Read OTHER users' `display_name` / `avatar_url` / `badge` / `membership_tier` from the **`public_profiles` view** (exposes only: `id`, `display_name`, `avatar_url`, `badge`, `membership_tier`). This closed an anon PII leak (#528); do not "fix" empty profile results by widening profiles policies.
   - Own profile: `lib/data/profile.ts` (server, React `cache()`) / `lib/data/profile-client.ts` (client mirror) / `lib/data/account-fetchers.ts` (wider column set for /account).
   - Other users: PostgREST embeds of `public_profiles` in `lib/data/lounge-fetchers.ts`, `app/(app)/lounge/rooms/[slug]/_islands.tsx`.
2. **`auth.uid()` is NULL in RSC.** The proxy authenticates via JWT verification and header forwarding — server components don't hold a Supabase auth session, so RLS policies or RPCs scoped by `auth.uid()` return `[]` server-side with no error. Rules: per-user server reads must filter by an explicit `userId` (from `getServerUser()`) against tables whose policies permit it, or the read moves client-side (browser client has the real session, `auth.uid()` works). If a server query mysteriously returns empty, check this first.
3. Route handlers under `app/api/` authenticate via `getServerUser()` then do ownership checks in code; service-role client (`utils/supabase/service.ts`) bypasses RLS and is restricted to webhooks/admin/cron paths (all 11 call sites audited clean 2026-05-06).

## Core tables

### profiles
`id` (= auth.users.id), `display_name`, `first_name`, `last_name`, `avatar_url`, `city`, `state`, `zip_code`, `phone`, `badge` (single), `assigned_badges` (uuid[], added 20260523 — the column whose missing prod migration once silently nulled ALL profile queries), `membership_tier` ('free'|'member'|'premium'), `stripe_customer_id`, `stripe_subscription_id`, `is_admin`, `created_at`.

### cigar_catalog
Master reference (~4.2k rows, seeded by `scripts/seed-cigar-catalog.ts`). Columns used: `id`, `source_id` (upsert key), `brand`, `series`, `format`, `ring_gauge`, `length_inches`, `wrapper`, `wrapper_country`, `binder_country`, `filler_countries` (text[]), `strength`, `shade`, `usage_count` (incremented by AddCigarSheet), `approved`, `community_added`, `image_url`, `created_at`. Community additions go through RPC `insert_cigar_to_catalog(...)`. Search-text migration: 20260627.

### humidor_items
User inventory + wishlist in one table. Columns used: `id`, `user_id`, `cigar_id` (FK cigar_catalog, embedded as `cigar:cigar_catalog(...)`), `quantity` (decremented when a smoke is logged), `is_wishlist` (boolean discriminator — wishlist rows are `is_wishlist = true`), `aging_target_date`, `purchase_date`, `price_paid_cents`, `source`, `notes`, `created_at`. Fetchers: `lib/data/humidor-fetchers.ts`, `lib/data/humidor-item-fetchers.ts`.

### smoke_logs vs burn_reports (the split — do not merge)

- **smoke_logs** — every smoke event. `id`, `user_id`, `cigar_id`, `humidor_item_id`, `smoked_at`, headline ratings `overall_rating`/`draw_rating`/`burn_rating`/`construction_rating`/`flavor_rating` (widened smallint → `numeric(3,2)` in 20260531 so thirds-averaged headlines like 4.75 fit), `location`, `occasion`, `pairing_drink`, `pairing_food`, `review_text`, `photo_urls` (text[]), `smoke_duration_minutes`, `content_video_id`, `flavor_tag_ids` (uuid[]), timestamps.
- **burn_reports** — burn-report-ONLY fields, **1:1 with smoke_logs via UNIQUE FK `smoke_log_id`** (migration 20260502). `id`, `smoke_log_id`, `user_id`, `thirds_enabled`, legacy `third_beginning`/`third_middle`/`third_end`, `created_at`. **Rule: new burn-report-only fields go here, never on smoke_logs.**
- **burn_report_thirds** — per-third rows (3 per thirds-enabled report; unique `(burn_report_id, third_index)`). `third_index` 1-3, `notes`, four smallint 1-5 ratings, `photo_url` (migration 20260531).
- **burn_report_third_flavor_tags** — join table, PK `(third_id, flavor_tag_id)`, cascade on third, restrict on tag.
- **flavor_tags** — reference table `id`, `name`. NOTE: no migration file exists for it (created directly in SQL editor) — an example of drift risk.
- Write path: `app/api/burn-report/route.ts` (POST creates smoke_log + burn_report + thirds atomically, decrements humidor quantity), `app/api/burn-report/[id]/route.ts` (PATCH mutates smoke_logs, upserts burn_reports by smoke_log_id, delete+reinsert thirds/tags). Headline ratings = average of thirds; headline flavor_tag_ids = union of thirds' tags.

## Forum / lounge

- **forum_categories** — `id`, `name`, `slug`, `description`, `sort_order`, `is_locked`, `is_gate`, `is_feedback`. Cached fetch: `lib/data/forum.ts`.
- **forum_posts** — `id`, `user_id`, `category_id`, `title`, `content`, `image_url`, `smoke_log_id` (nullable FK — burn reports shared to lounge), `is_system`, `is_pinned`, `is_locked`, `status` ('open'|'closed', feedback category), `created_at`. Reads embed `forum_post_likes(count)`, `forum_comments(count)` (PostgREST nested aggregation — single query, NOT N+1; a 2026-05-06 investigation confirmed denormalized counters are unnecessary) and `public_profiles` for authors. Canonical select: `app/(app)/lounge/rooms/[slug]/_islands.tsx`.
- **forum_post_likes** (`unique (user_id, post_id)`), **forum_post_votes** (feedback ±1, `unique (user_id, post_id)`), **forum_comments** (`id`, `user_id`, `post_id`, `content`, `created_at`).
- **notification_views** — PK `(user_id, post_id)`, `last_seen_at`; consumed via RPC `get_notification_summary()` (`lib/data/notifications.ts`, migration 20260527).
- Legacy feed trio **posts / post_likes / post_comments** (with `likes_count`/`comments_count` maintained by RPCs `increment_likes`/`decrement_likes`/`increment_comments`, migration 20260409) still backs `components/feed/LoungeClient.tsx`.

## Content / news / other tables

- **content_channels**, **content_videos**, **content_video_likes** (member+ gate), **content_video_comments** — YouTube-synced Discover Channels (`/api/youtube/sync` cron).
- **blog_posts** (`type` 'blog'|'news_link'; blog: `excerpt`/`body`; news_link: `synopsis`/`source_name`/`source_url`; `published_at` null = draft), **blog_post_reactions**, **blog_post_comments**.
- **news_items** — RSS-synced industry news (`guid` unique, migration 20260430), read by home news island and `/discover/cigar-news` (`lib/data/news.ts`, `news-client.ts`).
- **field_guide_likes** (PK `(vol_number, user_id)`), **field_guide_comments** (migration 20260429).
- **cigar_catalog_suggestions** (new-cigar submissions, status pending/approved/rejected), **cigar_edit_suggestions** (jsonb `current` snapshot + `suggested` partial, unique pending per user+cigar, 20260519), **cigar_image_submissions** (one pending per cigar, storage_path in pending bucket).
- **push_subscriptions** (`endpoint`/`p256dh`/`auth`, unique `(user_id, endpoint)`, 20260503), **push_outbox** (retry queue: 0min → 1h → 4h → dead), **push_send_log** (service-role audit).
- **cron_run_log** (names: 'aging-ready', 'news-sync', 'push-retry', 'youtube-sync'; `lib/cron-log.ts`), **moderation_log**, **stripe_processed_events** (webhook idempotency, `app/api/stripe/webhook/route.ts`).
- **shops** — exists with full schema but is touched only by `scripts/seed-shops.ts`; no app code reads it today (the home "Local Shops" card is just a Google Maps link built from profile zip, `components/dashboard/LocalShops.tsx`). UNVERIFIED: whether prod still has the seeded placeholder rows.

## RPC functions

| RPC | Called from |
|---|---|
| `get_notification_summary()` | `lib/data/notifications.ts` (client — needs `auth.uid()`, so NOT callable from RSC) |
| `get_forum_category_stats()` | `lib/data/forum.ts` |
| `insert_cigar_to_catalog(...)` | `components/humidor/AddCigarSheet.tsx`, `WishlistClient.tsx` |
| `increment_likes` / `decrement_likes` / `increment_comments` | `components/feed/LoungeClient.tsx` (legacy posts) |

## Storage buckets

| Bucket | Access | Used by |
|---|---|---|
| `avatars` | public read; upload via server | `app/api/avatar/route.ts` |
| `cigar-photos` | public read; writes admin-approved only | `app/api/admin/submissions/[id]/route.ts` |
| `cigar-photos-pending` | private (service-role) | `app/api/upload/cigar-image/route.ts` → admin review |
| `post-images` | public read; upload via server | `app/api/upload/image/route.ts`, lounge/feed posts |

SW caches `/storage/v1/object/public/*` (StaleWhileRevalidate, 100 entries/6d); `next/image` accepts `*.supabase.co/storage/v1/object/public/**` (next.config.ts). Cigars without a real `image_url` fall back to wrapper-matched WebP defaults via `lib/cigar-default-image.ts` (`getCigarImage(imageUrl, wrapper)`) — `image_url` stays NULL, no DB writes for defaults.

## Migration workflow (drift risk is real)

- SQL files live in **`supabase/migrations/`** — 55 files, `YYYYMMDD_name.sql`, 20260409 → 20260627. There is NO automated migration runner: Dave pastes the SQL into the Supabase SQL editor by hand.
- **Convention**: when a change needs a migration, commit the `.sql` file AND paste the exact SQL in chat as a copy-paste block WITH a verify query. Flag "apply in SQL editor" as a pre-deploy gate — merged code that assumes an unapplied migration ships broken.
- **Drift has bitten twice**: (1) `assigned_badges` column missing from prod silently nulled every profile query (2026-05-24); (2) the burn_reports `_lounge_read` RLS policy was missed on first apply. Some objects (e.g. `flavor_tags`, the `public_profiles` view definition) have no migration file at all.
- Postgres footgun on generated columns: `concat_ws`/`concat` are STABLE and rejected in `GENERATED ... STORED`; use `||` + `coalesce`.
- A migration-drift audit is the first item on the go-live checklist. When debugging "column does not exist" or silently-empty queries in prod, suspect an unapplied migration before suspecting code.
