# External Integrations

**Analysis Date:** 2026-05-18

## APIs & External Services

**Authentication / Database / Storage (Supabase):**
- Supabase project: `qagaiuibtwuhihukghyx.supabase.co` (per `PROJECT_STATE.md`)
- SDKs: `@supabase/ssr` `^0.9.0`, `@supabase/supabase-js` `^2.100.0`
- Auth env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Client factories:
  - `utils/supabase/client.ts` — `createBrowserClient` (RSC `'use client'` components, SWR fetchers in `lib/data/cigar-fetchers.ts`, `lib/data/humidor-fetchers.ts`, `lib/data/lounge-fetchers.ts`)
  - `utils/supabase/server.ts` — cookie-aware `createServerClient` (server components, route handlers)
  - `utils/supabase/service.ts` — service-role `createClient` bypassing RLS (used in webhook + cron + push routes only)
  - `utils/supabase/anon.ts` — stateless anon client safe for `unstable_cache` (no `cookies()` call)
- Session validation: single round-trip in `proxy.ts` (`supabase.auth.getUser()` raced against a 3 s timeout). Verified identity is forwarded via `x-ae-user-id`, `x-ae-user-email`, `x-ae-onboarding-completed` headers. Server code reads these via `getServerUser()` in `lib/auth/server-user.ts` instead of re-validating per request.

**Payments (Stripe):**
- SDKs: `stripe` `^21.0.1` (server, `lib/stripe.ts`, API version pinned to `"2026-03-25.dahlia"`), `@stripe/stripe-js` `^9.0.1` (client)
- Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- Price IDs (from `PROJECT_STATE.md`):
  - `STRIPE_MEMBER_MONTHLY_PRICE_ID=price_1TPQIvP1shPjr0YS465wU2BG`
  - `STRIPE_MEMBER_ANNUAL_PRICE_ID=price_1TGpPmP1shPjr0YSF4gSfaCV`
  - `STRIPE_PREMIUM_MONTHLY_PRICE_ID=price_1TPQFZP1shPjr0YSXhR13LJi`
  - `STRIPE_PREMIUM_ANNUAL_PRICE_ID=price_1TGpQZP1shPjr0YSmQLQOgvq`
- Mapping helpers: `getPriceId(tier, interval)` and `tierFromPriceId(priceId)` in `lib/stripe.ts`
- Endpoints (Node runtime):
  - `app/api/stripe/create-checkout-session/route.ts` — kicks off subscription checkout
  - `app/api/stripe/create-portal-session/route.ts` — opens Stripe customer portal
  - `app/api/stripe/schedule-downgrade/route.ts` — schedules a tier downgrade
  - `app/api/stripe/webhook/route.ts` — receives `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`; verifies signature via `stripe.webhooks.constructEvent`; idempotent INSERT-first dedup by Stripe `event_id`; `dynamic = "force-dynamic"` because raw body is required

**Google Cloud Vision (cigar-band OCR / safety):**
- SDK: `@google-cloud/vision` `^5.3.5`
- Env: `GOOGLE_CLOUD_VISION_CREDENTIALS` (base64-encoded service-account JSON, decoded at first use)
- Files:
  - `app/api/vision/analyze/route.ts` — main endpoint, instantiates `ImageAnnotatorClient` lazily; protected by Upstash rate limiter
  - `lib/vision-safety.ts` — separate singleton client used for safety / likelihood scoring

**Google Custom Search (cigar image seeding — script only):**
- Env: `GOOGLE_API_KEY` (Ash & Ember Society GCP project — `PROJECT_STATE.md` notes it's currently 403'ing), `GOOGLE_SEARCH_ENGINE_ID=a312c39d533474894`
- Invoked only by `scripts/seed-cigar-images.ts` (not at runtime)

**YouTube Data API v3:**
- Env: `YOUTUBE_API_KEY`
- File: `app/api/youtube/sync/route.ts` — base URL `https://www.googleapis.com/youtube/v3`; fetches uploads playlist + video durations (ISO 8601 → seconds parser inline); Node runtime
- Schedule: every 3 hours via Vercel Cron

**Cigar-news RSS aggregation (Open Web):**
- Feeds registered in `lib/news-feeds.ts`:
  - Halfwheel — `https://halfwheel.com/feed/`
  - Cigar Dojo — `https://cigardojo.com/feed/`
  - Cigar Journal — `https://www.cigarjournal.com/feed/`
  - Kohnhed — `https://kohnhed.com/feed/`
  - Smokin Tabacco — `https://smokintabacco.com/feed/`
  - Cigar Coop — `https://cigar-coop.com/feed`
  - (jr-cigars excluded — Imperva JS challenge)
- File: `app/api/news/sync/route.ts` — uses `fast-xml-parser` to parse feeds, upserts into `news_items` by RSS `guid`

**Weather (Open-Meteo + NWS + zippopotam.us):**
- File: `app/api/weather/route.ts` (Edge runtime)
- Chain: ZIP → `https://api.zippopotam.us/us/{zip}` → lat/lon → NWS `https://api.weather.gov/points/{lat,lon}` + `/stations/.../observations/latest` (primary, real station reading) → falls back to Open-Meteo `https://api.open-meteo.com/v1/forecast` → city fallback uses `https://geocoding-api.open-meteo.com/v1/search`
- NWS `User-Agent`: `"AshAndEmberSociety (dmblack83@gmail.com)"`
- Caching: `s-maxage=300, stale-while-revalidate=600`; NWS observations cached 300 s, station/zip metadata cached 86400 s via `next.revalidate`
- Consumed by `components/dashboard/SmokingConditions.tsx` (D.2 dashboard tile)

**Google Maps (link-out only):**
- No client SDK or `@googlemaps/*` package installed at runtime — `PROJECT_STATE.md` lists `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, but the only Maps consumer found is `components/dashboard/LocalShops.tsx:31`, which constructs a static `https://www.google.com/maps/search/?api=1&query=...` link
- No embedded map component or geolocation API call exists today

## Data Storage

**Databases:**
- Supabase Postgres (project `qagaiuibtwuhihukghyx`)
- Tables (per `PROJECT_STATE.md`): `profiles`, `cigar_catalog` (4,221 rows), `humidor_items`, `smoke_logs`, `burn_reports`, `shops`, `blog_posts`, `news_items`, `push_subscriptions`, `forum_categories`, `forum_posts`, `partner_video_links`, `cigar_catalog_suggestions`, `shop_checkins`, `notification_preferences`, `content_channels`, plus migrations under `supabase/migrations/*.sql`

**File Storage (Supabase Storage):**
- `avatars` bucket — user profile photos, RLS policies (`supabase/migrations/20260416_avatars_storage_rls.sql`)
- `cigar-photos` bucket — public; cigar catalog images and user uploads
- `post-images` (referenced in `next.config.ts` remotePatterns comment) — lounge post images
- All public bucket URLs allowlisted in `next/image` remote patterns: `*.supabase.co/storage/v1/object/public/**`

**Caching:**
- Upstash Redis (HTTP REST API; Edge-runtime compatible)
- Env: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (canonical) OR `UPSTASH_REDIS_REST_KV_REST_API_URL` + `UPSTASH_REDIS_REST_KV_REST_API_TOKEN` (Vercel Marketplace prefix). Canonical names take precedence in `lib/rate-limit.ts:43-48`.
- Implementation: sliding-window limiter in `lib/rate-limit.ts` (`@upstash/ratelimit` + `@upstash/redis`); per-route prefix; production fails CLOSED if env missing, dev passes through with a single warn
- Used by: `app/api/vision/analyze/route.ts`, `app/api/push/test/route.ts`

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (email/password + Google OAuth gated by `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED`)
- Implementation:
  - JWT validated once per request in `proxy.ts:99-117` via `supabase.auth.getUser()` with a 3 s `Promise.race` timeout
  - Verified user forwarded downstream via `x-ae-user-id`, `x-ae-user-email`, `x-ae-onboarding-completed`
  - Read pattern: `getServerUser()` in `lib/auth/server-user.ts` (zero extra round-trips)
  - Onboarding gate also enforced in `proxy.ts` (redirect to `/onboarding` unless user is on `/onboarding`, `/privacy`, or `/terms`)

## Monitoring & Observability

**Error Tracking (Sentry):**
- SDK: `@sentry/nextjs` `^10.51.0`
- Configs:
  - `instrumentation.ts` — loads `sentry.server.config.ts` when `NEXT_RUNTIME==="nodejs"`, `sentry.edge.config.ts` when `NEXT_RUNTIME==="edge"`; exports `onRequestError = Sentry.captureRequestError`
  - `instrumentation-client.ts` — browser SDK; sets `enableLogs: true`, `sendDefaultPii: true`, `tracesSampleRate` 1.0 dev / 0.1 prod; exports `onRouterTransitionStart = Sentry.captureRouterTransitionStart`; ALSO attaches a `securitypolicyviolation` document listener that captures CSP violations as Sentry messages (CSP is `Report-Only`, so violations would otherwise be silent)
  - `sentry.server.config.ts` — `includeLocalVariables: true` (Node-only), same trace sample rates
  - `sentry.edge.config.ts` — trimmed config; no `includeLocalVariables`
- Env: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (build-time source-map upload)
- Tunnel route: `/monitoring` (set via `tunnelRoute` in `next.config.ts:279`); `proxy.ts` matcher explicitly excludes it so ad-block bypass doesn't break error reporting

**Real-User Metrics (Vercel Speed Insights):**
- Package: `@vercel/speed-insights` `^2.0.0`
- Mount: `<SpeedInsights />` in `app/layout.tsx:237` (auto-disabled in dev)
- Captures LCP / CLS / INP / FCP / TTFB

**Logs:**
- `lib/log.ts` wraps `console` for structured logging; Sentry `enableLogs: true` ingests console output as queryable events
- Cron runs additionally log to a `cron_run_logs` table via `lib/cron-log.ts`

## CI/CD & Deployment

**Hosting:**
- Vercel — only deployment target. Branch deploys → preview URLs; `main` → production.

**CI Pipeline:**
- No `.github/workflows/` exists today (`PROJECT_STATE.md` flags a performance-budget gate decision as pending)
- Sentry source-map upload runs as part of the Vercel build via `withSentryConfig` (`next.config.ts:273-291`)
- Service worker build runs as a POST-BUILD step: `"build": "next build && serwist build serwist.config.mjs"` (`package.json:7`)

**Vercel Cron (`vercel.json`):**
| Path | Schedule | Purpose |
|---|---|---|
| `/api/news/sync`       | `0 */3 * * *` | RSS sync (every 3 h) |
| `/api/youtube/sync`    | `0 */3 * * *` | YouTube channel sync (every 3 h) |
| `/api/cron/aging-ready`| `0 13 * * *`  | Daily aging-ready push (13:00 UTC) |
| `/api/cron/push-retry` | `0 * * * *`   | Hourly push retry queue drain |
- Auth: Vercel cron sends `Authorization: Bearer $CRON_SECRET`. Manual / staging invocation uses `x-sync-secret: $SYNC_SECRET`. Vercel cron user-agent is also accepted as fallback when `CRON_SECRET` isn't set yet (#396 also routed `/api/cron` through the proxy public-paths allowlist).

## Service Worker (Serwist)

**Build:**
- Source: `app/sw.ts` (excluded from main `tsconfig.json`, built under `tsconfig.sw.json` with `lib: ["esnext", "webworker"]`)
- Bundler: `@serwist/cli` invoked via `serwist.config.mjs` after `next build` — outputs `public/sw.js` (gitignored)
- `precachePrerendered: false` — required because some prerendered routes are auth-gated by `proxy.ts` and a precache fetch (no cookies) gets 307'd to `/login`, breaking SW install

**Registration:**
- `components/ui/RegisterServiceWorker.tsx` calls `navigator.serviceWorker.register("/sw.js")` (production only); mounted once in `app/layout.tsx:221`
- Cache-Control on `/sw.js`: `public, max-age=0, must-revalidate` (set in `next.config.ts:217-220`) — required so stale SWs don't run for up to a year

**Runtime caching strategy (`app/sw.ts:202-358`):**
| Resource | Strategy | Notes |
|---|---|---|
| Supabase REST/Auth (`*.supabase.co/rest`, `/auth`) | NetworkOnly | Never cache personalised data |
| Supabase Storage public (`/storage/v1/object/public/`) | StaleWhileRevalidate | 100 entries / 7 days |
| RSC payloads (`?_rsc=` / `rsc: 1` / `next-router-state-tree`) | NetworkOnly | Per-user data |
| `/_next/static/` | CacheFirst | 200 entries / 1 year (immutable hashed assets) |
| `/_next/image` optimised | StaleWhileRevalidate | 50 entries / 30 days |
| Same-origin static images | StaleWhileRevalidate | 50 entries / 30 days |
| Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) | CacheFirst | 20 entries / 1 year |
| Navigation requests | NetworkFirst, auth-partitioned | 60 entries / 7 days; `authPartitionPlugin` adds `#auth=<sha256 sub claim>` to cache key so User A's cached HTML is never served to User B on a shared device |
| Offline fallback | precached `/offline` | Served when navigation has no network AND no cache |

**Auxiliary SW behaviours:**
- `skipWaiting: true` + `clientsClaim: true` + `navigationPreload: true`
- On `activate`, broadcasts `SW_UPDATED` to all controlled clients (consumed by `ServiceWorkerUpdateNotice`)
- Push handler — accepts JSON payload `{title, body, url?, tag?, icon?, badge?}`, defaults icon/badge to `/icons/icon-192.png`
- Notification-click handler — focuses existing window or opens new one at `data.url`
- Offline mutation outbox — `sync` event with tag `ae-outbox-sync` replays the IDB store `mutations` (schema kept in lockstep with `lib/offline-outbox.ts`)

## Push Notifications (Web Push)

**Library:** `web-push` `^3.6.7` (Node runtime only — uses Node `crypto`)

**Env:**
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:/https:)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (mirrors `VAPID_PUBLIC_KEY` for client `subscribe()`)

**Files:**
- `lib/push.ts` — `sendPushToUser()`, module-load VAPID validation, prunes 404/410 subscriptions
- `lib/push-client.ts` — browser-side subscribe / unsubscribe helpers
- `lib/notification-categories.ts` — category opt-in lookup
- Endpoints: `app/api/push/subscribe/`, `app/api/push/unsubscribe/`, `app/api/push/test/` (rate-limited 5/h/user via Upstash)
- Trigger: `app/api/cron/aging-ready/route.ts` and `app/api/cron/push-retry/route.ts`
- Storage: `push_subscriptions` table (`supabase/migrations/20260503_push_subscriptions.sql`)

## Environment Configuration

**Required env vars (compiled from in-tree references):**

| Variable | Used by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `proxy.ts`, `utils/supabase/*`, `app/layout.tsx` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `proxy.ts`, `utils/supabase/{client,server,anon}.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | `utils/supabase/service.ts` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | client checkout |
| `STRIPE_SECRET_KEY` | `lib/stripe.ts` |
| `STRIPE_WEBHOOK_SECRET` | `app/api/stripe/webhook/route.ts` |
| `STRIPE_MEMBER_MONTHLY_PRICE_ID` `STRIPE_MEMBER_ANNUAL_PRICE_ID` `STRIPE_PREMIUM_MONTHLY_PRICE_ID` `STRIPE_PREMIUM_ANNUAL_PRICE_ID` | `lib/stripe.ts` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | (none at runtime today; documented for future map work) |
| `GOOGLE_API_KEY` `GOOGLE_SEARCH_ENGINE_ID` | `scripts/seed-cigar-images.ts` |
| `YOUTUBE_API_KEY` | `app/api/youtube/sync/route.ts` |
| `GOOGLE_CLOUD_VISION_CREDENTIALS` | `lib/vision-safety.ts`, `app/api/vision/analyze/route.ts` |
| `VAPID_PUBLIC_KEY` `VAPID_PRIVATE_KEY` `VAPID_SUBJECT` `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `lib/push.ts`, push-subscribe client |
| `CRON_SECRET` `SYNC_SECRET` | `/api/news/sync`, `/api/youtube/sync`, `/api/cron/*` |
| `UPSTASH_REDIS_REST_URL` `UPSTASH_REDIS_REST_TOKEN` (or `*_KV_REST_API_*`) | `lib/rate-limit.ts` |
| `SENTRY_DSN` `NEXT_PUBLIC_SENTRY_DSN` | `sentry.*.config.ts`, `instrumentation-client.ts` |
| `SENTRY_ORG` `SENTRY_PROJECT` `SENTRY_AUTH_TOKEN` | `next.config.ts` (source-map upload) |
| `VERCEL_GIT_COMMIT_SHA` `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` | Sentry release tagging, `StaleBuildNotice` |
| `VERCEL_ENV` `NEXT_PUBLIC_VERCEL_ENV` | Sentry environment tagging |
| `NEXT_PUBLIC_SITE_URL` | (used for absolute URL construction) |
| `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED` | Auth UI toggle |
| `NODE_ENV` | Conditional behaviour across `lib/rate-limit.ts`, `sentry.*.config.ts` |

**Secrets location:**
- Vercel project env vars (Production + Preview)
- `.env.local` for local development (gitignored)

## Webhooks & Callbacks

**Incoming:**
- `POST /api/stripe/webhook` — Stripe events; signature verified via `STRIPE_WEBHOOK_SECRET`; idempotent by event_id

**Outgoing:**
- Web Push delivery to user agents via `web-push` (`lib/push.ts`); endpoints stored in `push_subscriptions`
- YouTube Data API GET calls from `/api/youtube/sync`
- RSS GETs from `/api/news/sync`
- NWS / Open-Meteo / zippopotam.us GETs from `/api/weather`
- Google Cloud Vision `annotateImage` calls from `/api/vision/analyze` and `lib/vision-safety.ts`
- Stripe API calls (checkout, customer portal, subscription scheduling) from `app/api/stripe/*`

## Content Security Policy

- Defined in `next.config.ts:48-62`
- Mode: `Content-Security-Policy-Report-Only` (enforce attempt #326 broke RSC; reverted by #332 — real fix needs nonce-based `script-src`)
- Inline-script hashes computed from `STALE_CHUNK_RECOVERY_SCRIPT`, `COLD_SMOKE_INIT_SCRIPT`, `HYDRATION_WATCHDOG_SCRIPT` (all imported from `components/cold-open-smoke/` and `components/system/`)
- `connect-src` allowlist: `'self'`, `https://*.supabase.co`, `wss://*.supabase.co`, `https://api.stripe.com`, `https://*.ingest.sentry.io`, `https://vitals.vercel-insights.com`, `https://va.vercel-scripts.com`
- `frame-src`: `https://js.stripe.com`, `https://*.stripe.com`, `https://*.google.com`
- CSP violations captured by the document-level `securitypolicyviolation` listener in `instrumentation-client.ts:55-82` and sent to Sentry as warnings

---

*Integration audit: 2026-05-18*
