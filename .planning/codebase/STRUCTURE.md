# Codebase Structure

**Analysis Date:** 2026-05-18

## Directory Layout

```
the-humidor/
├── app/                          # Next.js App Router — every route lives here
│   ├── layout.tsx                # Root layout (fonts, providers, SW reg, head scripts)
│   ├── error.tsx                 # Root error boundary (catches non-(app) errors)
│   ├── global-error.tsx          # Self-contained boundary (root layout crashed)
│   ├── manifest.ts               # PWA manifest (replaces manifest.webmanifest)
│   ├── sw.ts                     # Service worker SOURCE; built to public/sw.js
│   ├── (app)/                    # Authenticated app — bottom nav + side rail layout
│   │   ├── layout.tsx            # BottomNav + SideRailNav + ViewTransition wrapper
│   │   ├── error.tsx             # (app)-scoped error boundary (nav stays visible)
│   │   ├── home/                 # /home dashboard (shell + 5 Suspense islands)
│   │   │   ├── page.tsx, _islands.tsx, _skeletons.tsx, loading.tsx
│   │   ├── humidor/              # /humidor + /[id], /stats, /wishlist, /burn-reports
│   │   │   ├── page.tsx, _islands.tsx, _skeletons.tsx, loading.tsx
│   │   │   ├── [id]/page.tsx
│   │   │   ├── [id]/burn-report/page.tsx
│   │   │   ├── burn-reports/page.tsx, loading.tsx
│   │   │   ├── burn-reports/[id]/edit/page.tsx
│   │   │   ├── stats/page.tsx
│   │   │   └── wishlist/page.tsx
│   │   ├── lounge/               # /lounge feed + rooms + post detail
│   │   │   ├── page.tsx, loading.tsx
│   │   │   ├── [postId]/page.tsx
│   │   │   └── rooms/[slug]/page.tsx, loading.tsx
│   │   ├── discover/             # /discover hub — 3 tabs in shared layout
│   │   │   ├── layout.tsx        # Fixed tab bar (Channels / Industry News / Vendors)
│   │   │   ├── channels/page.tsx
│   │   │   ├── cigar-news/page.tsx, NewsList.tsx, actions.ts (server action)
│   │   │   ├── cigars/page.tsx, [id]/page.tsx
│   │   │   ├── content/page.tsx
│   │   │   ├── field-guide/vol-01..04/page.tsx
│   │   │   └── vendors/page.tsx
│   │   ├── account/              # /account (Profile / Membership / Legal tabs)
│   │   │   ├── page.tsx
│   │   │   └── membership/success/page.tsx
│   │   ├── admin/page.tsx        # /admin (gated by is_admin profile flag)
│   │   └── onboarding/page.tsx
│   ├── (auth)/                   # /login, /signup, /signup/verify
│   │   ├── layout.tsx            # Centered logo + auth card
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── signup/verify/page.tsx
│   ├── (marketing)/              # / landing page
│   │   ├── layout.tsx            # Resource hints for Unsplash + iStock
│   │   └── page.tsx
│   ├── auth/callback/route.ts    # Supabase email + OAuth callback handler
│   ├── api/                      # 20 route handlers (see "API Routes" below)
│   ├── privacy/page.tsx          # /privacy (markdown in content/legal)
│   ├── terms/page.tsx            # /terms (markdown in content/legal)
│   └── offline/page.tsx          # SW navigation fallback target
├── components/                   # 90 component files in 16 feature folders
│   ├── ui/                       # Primitives (toast, theme-provider, RefreshButton, ...)
│   ├── system/                   # PWA resilience + lifecycle (watchdog, outbox, ...)
│   ├── dashboard/                # /home sections (Masthead, AgingAlerts, ...)
│   ├── humidor/                  # Humidor + burn report + stats (lazy)
│   ├── lounge/                   # Forum feed + comments + post detail
│   ├── cigars/                   # Cigar discover + add-to-humidor + photo submit
│   ├── account/                  # Account tabs + install sheet
│   ├── membership/               # Paywall, card, success confetti
│   ├── onboarding/               # OnboardingForm
│   ├── auth/                     # GoogleAuthButton
│   ├── landing/                  # LandingPage (marketing route)
│   ├── legal/                    # LegalDocument renderer (markdown)
│   ├── field-guide/              # Volume modal + comments + article-components
│   │   └── content/              # Vol01..04Content.tsx
│   ├── feed/                     # LoungeClient legacy wrapper
│   ├── discover/                 # AccordionCard, ChannelsClient
│   ├── admin/                    # AdminTasksWidget
│   ├── cold-open-smoke/          # ColdOpenSmoke overlay + init script
│   ├── cigar-search.tsx          # Shared CatalogResult typed search component
│   └── SWRProvider.tsx           # App-wide SWR config
├── lib/                          # Cross-cutting helpers + server data layer
│   ├── auth/server-user.ts       # getServerUser() — reads forwarded headers
│   ├── data/                     # Data-layer fetchers (see "Data Layer" below)
│   ├── hooks/use-escape-key.ts   # Custom hooks live here
│   ├── badge.ts, stripe.ts, membership.ts, push.ts, push-client.ts
│   ├── log.ts                    # Structured Sentry-aware logger
│   ├── cigar-default-image.ts    # Wrapper → default WebP map
│   ├── cigar-taxonomy.ts, country-name.ts, geo.ts, haptics.ts
│   ├── rate-limit.ts             # Upstash Redis ratelimit helper
│   ├── offline-outbox.ts         # IndexedDB outbox client
│   ├── news-feeds.ts, notification-categories.ts, install-prompt.ts
│   ├── burn-report-draft.ts      # localStorage draft persistence
│   ├── vision-safety.ts          # Vision API safety guards
│   ├── cron-log.ts               # cron run logging
│   └── utils.ts                  # cn() + small helpers
├── utils/                        # Supabase client factories ONLY
│   └── supabase/
│       ├── server.ts             # Cookie-bound server client
│       ├── client.ts             # Browser client (use client)
│       ├── anon.ts               # Anon client for unstable_cache callbacks
│       └── service.ts            # Service-role bypass-RLS client (server only)
├── content/legal/                # Markdown sources for /privacy /terms /eula
│   ├── eula.md, privacy-policy.md, terms-of-service.md
├── public/                       # Static assets served at /
│   ├── icons/                    # PWA icons (apple-touch-icon, 192, 512)
│   ├── appstore-images/          # iOS splash screens + store assets
│   ├── field-guide/              # Volume illustrations
│   ├── Cigar Default Images/     # 5 wrapper-shaded WebP defaults
│   ├── Band Logo.png, Circle Logo.png, logo.png, og-image.png
│   └── badge-preview.html        # Standalone preview page
├── scripts/                      # tsx CLI scripts (seed + migrate one-offs)
│   ├── seed-cigar-catalog.ts, seed-shops.ts, seed-cigars.ts
│   ├── seed-cigar-images.ts, attach-test-image.ts
│   ├── seed-cigar-strengths.ts, seed-new-cigars.ts, seed-youtube-channel.ts
│   ├── migrate-wrapper-to-shade.ts, migrate-wrapper-country-leak.ts
│   ├── map-supabase-ids.ts
│   ├── generate-ios-splash.py     # Python — regenerates iOS splash PNGs
│   └── seed-cigar-default-images.ts   # ⚠ DO NOT RUN (PROJECT_STATE.md)
├── supabase/migrations/          # 45 SQL migrations (timestamped names)
├── tests/e2e/                    # Playwright E2E
│   ├── smoke.spec.ts
│   └── authenticated.spec.ts
├── types/react-experimental.d.ts # Type shim for <ViewTransition>
├── proxy.ts                      # Root proxy (Next 16's middleware)
├── instrumentation.ts            # Sentry register() — server cold start
├── instrumentation-client.ts     # Sentry client init + CSP violation reporter
├── sentry.server.config.ts       # Sentry Node runtime config
├── sentry.edge.config.ts         # Sentry Edge runtime config
├── serwist.config.mjs            # Post-build SW bundling config
├── next.config.ts                # Next config (CSP, headers, images, redirects)
├── eslint.config.mjs             # ESLint flat config
├── postcss.config.mjs            # Tailwind v4 PostCSS
├── playwright.config.ts          # Playwright config
├── tsconfig.json                 # Main TS config (excludes app/sw.ts)
├── tsconfig.sw.json              # TS config for the service worker
├── vercel.json                   # Cron schedules + deployment knobs
├── package.json, package-lock.json
├── CLAUDE.md, AGENTS.md, PROJECT_STATE.md   # Project instructions (auto-loaded)
├── BUNDLE_BASELINE.md            # Bundle size baseline reference
└── README.md
```

## Directory Purposes

**`app/`:**
- Purpose: Every route, layout, error boundary, and PWA manifest.
- Contains: Server components (default), client components (opt-in), route handlers, manifest, service worker source.
- Key files: `app/layout.tsx` (root), `app/sw.ts` (SW), `app/manifest.ts` (PWA), `app/(app)/layout.tsx` (authenticated shell).

**`app/(app)/`:**
- Purpose: All authenticated app surfaces.
- Contains: Pages, server data islands (`_islands.tsx`), client-side skeletons (`_skeletons.tsx`), Suspense `loading.tsx` files.
- Key files: `app/(app)/home/page.tsx`, `app/(app)/humidor/page.tsx`, `app/(app)/lounge/page.tsx`, `app/(app)/discover/layout.tsx`.

**`app/(auth)/`:**
- Purpose: Public auth pages — login, signup, verify.
- Contains: Centered card layout, page components for each form.
- Key files: `app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`.

**`app/(marketing)/`:**
- Purpose: Public landing page at `/`.
- Contains: Marketing-specific resource hints in `layout.tsx`, page entry that imports `components/landing/LandingPage.tsx`.

**`app/api/`:**
- Purpose: Route handlers for client mutations, webhooks, cron, uploads.
- Contains: 20 `route.ts` files (see "API Routes" below).

**`components/`:**
- Purpose: Reusable UI organized by feature.
- Contains: Server + client components grouped by surface (`humidor/`, `lounge/`, `dashboard/`, ...) plus shared primitives in `ui/` and lifecycle utilities in `system/`.
- Naming: PascalCase `.tsx` per feature; `*Client.tsx` for the main client island per page; `*Lazy.tsx` for `next/dynamic` wrappers.

**`components/system/`:**
- Purpose: PWA + lifecycle helpers that bolt onto the root layout.
- Contains: `HydrationMark.tsx`, `OfflineBanner.tsx`, `OutboxManager.tsx`, `PersistentStorageRequest.tsx`, `PushSubscriptionHealthCheck.tsx`, `ResumeHandler.tsx`, `ServiceWorkerUpdateNotice.tsx`, `StaleBuildNotice.tsx`, plus inline-script source files `hydration-watchdog.ts` and `stale-chunk-recovery.ts`.

**`lib/`:**
- Purpose: Cross-cutting helpers + the server data layer.
- Contains: Auth helper (`lib/auth/server-user.ts`), data fetchers (`lib/data/*`), domain helpers (`lib/stripe.ts`, `lib/membership.ts`, `lib/push.ts`, ...), util layers (`lib/log.ts`, `lib/rate-limit.ts`).

**`lib/data/`:**
- Purpose: Typed Supabase fetchers — both server (cached) and client (SWR-paired).
- Contains: `profile.ts`, `news.ts`, `cigar-catalog.ts`, `forum.ts`, `flavor-tags.ts`, `burn-report-number.ts` (server). `humidor-fetchers.ts`, `lounge-fetchers.ts`, `cigar-fetchers.ts` (client). `keys.ts` (SWR key builders + `jsonFetcher`).

**`utils/supabase/`:**
- Purpose: Supabase client factories only — keep this folder small and stable.
- Contains: `server.ts` (cookie-bound), `client.ts` (browser), `anon.ts` (stateless for cache callbacks), `service.ts` (service-role bypass-RLS).

**`scripts/`:**
- Purpose: One-off CLI scripts run with `tsx`.
- Contains: Seed scripts, migration scripts, the iOS splash generator.
- Note: One script is explicitly off-limits — `scripts/seed-cigar-default-images.ts` writes broken SVG paths (PROJECT_STATE.md).

**`supabase/migrations/`:**
- Purpose: SQL migration history.
- Contains: 45 files, names follow `YYYYMMDD_description.sql` (e.g. `20260409_community_feed.sql`).

**`public/`:**
- Purpose: Static assets served from `/`.
- Contains: PWA icons, iOS splash images, field-guide illustrations, cigar default WebPs.
- Note: `public/sw.js` is generated by `serwist build` and git-ignored.

**`content/legal/`:**
- Purpose: Markdown sources for legal pages.
- Contains: `eula.md`, `privacy-policy.md`, `terms-of-service.md` — rendered by `components/legal/LegalDocument.tsx`.

**`tests/e2e/`:**
- Purpose: Playwright end-to-end tests.
- Contains: `smoke.spec.ts`, `authenticated.spec.ts`.

## Key File Locations

**Entry Points:**
- `proxy.ts`: Root proxy / auth gate (Next 16's middleware).
- `app/layout.tsx`: Root layout — fonts, providers, SW registration, head scripts.
- `app/(app)/layout.tsx`: Authenticated shell — bottom nav, side rail, ViewTransition wrapper.
- `instrumentation.ts`: Sentry server register hook.
- `instrumentation-client.ts`: Sentry client init.
- `app/sw.ts`: Service worker source (compiled separately to `public/sw.js`).

**Configuration:**
- `next.config.ts`: CSP, security headers, image config, redirects, Sentry wrapper.
- `serwist.config.mjs`: SW build config (`swSrc: app/sw.ts` → `swDest: public/sw.js`).
- `tsconfig.json`: Main TS config; excludes `app/sw.ts`.
- `tsconfig.sw.json`: SW TS config (webworker lib).
- `vercel.json`: Cron schedules + deployment knobs.
- `eslint.config.mjs`, `postcss.config.mjs`, `playwright.config.ts`.

**Core Logic:**
- `lib/auth/server-user.ts`: `getServerUser()` — read forwarded `x-ae-*` headers.
- `lib/data/keys.ts`: SWR cache-key registry.
- `lib/data/profile.ts`: `getProfileLite()` — `React.cache`-deduped profile read.
- `lib/data/news.ts`, `lib/data/cigar-catalog.ts`: `unstable_cache`-wrapped public reads.
- `utils/supabase/server.ts`, `utils/supabase/client.ts`, `utils/supabase/anon.ts`, `utils/supabase/service.ts`: The four Supabase client factories.
- `lib/log.ts`: Structured logger (Sentry + console).
- `lib/cigar-default-image.ts`: `getCigarImage(url, wrapper)` — single image-resolution helper.
- `lib/offline-outbox.ts`: IndexedDB outbox CRUD.

**API Routes (`app/api/`):**
- `app/api/burn-report/route.ts` + `app/api/burn-report/[id]/route.ts`: POST + delete burn reports.
- `app/api/avatar/route.ts`: Avatar uploads (Supabase Storage).
- `app/api/upload/image/route.ts`, `app/api/upload/cigar-image/route.ts`: Image uploads.
- `app/api/vision/analyze/route.ts`: Google Cloud Vision OCR for band scanner.
- `app/api/weather/route.ts`: Open-Meteo proxy for `SmokingConditions`.
- `app/api/news/sync/route.ts`: RSS sync (SYNC_SECRET-gated).
- `app/api/youtube/sync/route.ts`: YouTube channel sync (SYNC_SECRET-gated).
- `app/api/cron/aging-ready/route.ts`, `app/api/cron/push-retry/route.ts`: Vercel cron endpoints (CRON_SECRET-gated).
- `app/api/push/subscribe/route.ts`, `app/api/push/unsubscribe/route.ts`, `app/api/push/test/route.ts`: Web push subscription management.
- `app/api/stripe/webhook/route.ts`: Stripe webhook (signature-gated).
- `app/api/stripe/create-checkout-session/route.ts`, `app/api/stripe/create-portal-session/route.ts`, `app/api/stripe/schedule-downgrade/route.ts`: Stripe flows.
- `app/api/admin/submissions/[id]/route.ts`: Admin moderation endpoint.
- `app/api/version/route.ts`: Build SHA endpoint for `StaleBuildNotice`.

**Testing:**
- `tests/e2e/smoke.spec.ts`: Unauthenticated smoke tests.
- `tests/e2e/authenticated.spec.ts`: Authenticated flow tests.
- `playwright.config.ts`: Playwright config.

## Naming Conventions

**Pages:**
- App Router file convention: `page.tsx`, `layout.tsx`, `error.tsx`, `loading.tsx`, `route.ts`.
- Dynamic segments: `[id]/page.tsx`, `[postId]/page.tsx`, `[slug]/page.tsx`.

**Server islands (private siblings of `page.tsx`):**
- `_islands.tsx`: Async server components, each one its own `<Suspense>` unit. Example: `app/(app)/home/_islands.tsx`.
- `_skeletons.tsx`: Sync fallback components rendered while islands resolve. Example: `app/(app)/home/_skeletons.tsx`.
- Leading underscore signals "private to this route folder, never imported elsewhere."

**Server actions:**
- Co-located with the page that uses them: `actions.ts` with `"use server"` at the top. Example: `app/(app)/discover/cigar-news/actions.ts`.

**Components:**
- `PascalCase.tsx` for components.
- `*Client.tsx` suffix for the main client island that owns a page's interactive state (e.g. `HumidorClient.tsx`, `LoungeForumClient.tsx`, `DiscoverCigarsClient.tsx`).
- `*Lazy.tsx` for `next/dynamic` wrappers around heavy client deps (e.g. `StatsClientLazy.tsx`).
- `*Sheet.tsx` for slide-up bottom sheets (e.g. `AddToHumidorSheet.tsx`, `NewPostSheet.tsx`).
- `*Modal.tsx` for centered modals (e.g. `BurnReportModal.tsx`, `FieldGuideModal.tsx`, `PostModal.tsx`).

**Lib helpers:**
- `kebab-case.ts` (e.g. `cigar-default-image.ts`, `server-user.ts`, `offline-outbox.ts`).
- Single-purpose modules; named exports only (no default exports).

**Data fetchers:**
- Server-side: kebab-case file with named exports of `getXxx` functions wrapped in `cache()` or `unstable_cache()`. Example: `lib/data/profile.ts` exports `getProfileLite`.
- Client-side: kebab-case file with `fetchXxx` functions, paired with a `keyFor.xxx(...)` builder in `lib/data/keys.ts`. Example: `lib/data/humidor-fetchers.ts` exports `fetchHumidorItems` paired with `keyFor.humidorItems(userId)`.

**Migrations:**
- `YYYYMMDD_description.sql` (e.g. `20260409_community_feed.sql`).

**Scripts:**
- kebab-case `.ts` run with `tsx` (e.g. `seed-cigar-catalog.ts`, `migrate-wrapper-to-shade.ts`).

## Route Groups

Three groups, each with its own `layout.tsx`:

| Group | Layout file | Purpose |
|-------|-------------|---------|
| `(app)` | `app/(app)/layout.tsx` | Authenticated shell with bottom nav + side rail |
| `(auth)` | `app/(auth)/layout.tsx` | Centered card layout for login/signup |
| `(marketing)` | `app/(marketing)/layout.tsx` | Landing-only resource hints |

Route group folder names are wrapped in parentheses and do NOT appear in the URL. `app/(app)/home/page.tsx` is at `/home`, not `/(app)/home`.

The discover sub-section has its own `app/(app)/discover/layout.tsx` for the fixed Channels / Industry News / Vendors tab bar.

## Path Aliases

From `tsconfig.json`:

```json
"paths": {
  "@/*": ["./*"]
}
```

Single alias `@/` resolves from the repo root. Examples:
- `@/lib/auth/server-user` → `lib/auth/server-user.ts`
- `@/components/humidor/HumidorClient` → `components/humidor/HumidorClient.tsx`
- `@/utils/supabase/server` → `utils/supabase/server.ts`

## Where to Add New Code

**New authenticated page (e.g. `/humidor/aging-shelf`):**
- Page: `app/(app)/humidor/aging-shelf/page.tsx` — sync server component, get user via `getServerUser()`, render a shell with `<Suspense>` boundaries.
- Server island: `app/(app)/humidor/aging-shelf/_islands.tsx` — async server component that fetches data and renders a client component.
- Skeleton: `app/(app)/humidor/aging-shelf/_skeletons.tsx` — sync fallback.
- Optional route-level Suspense fallback: `app/(app)/humidor/aging-shelf/loading.tsx`.
- Client island: `components/humidor/AgingShelfClient.tsx` — `"use client"`, receives initial data as props, uses SWR for subsequent reads.

**New API endpoint (e.g. POST `/api/humidor/aging-target`):**
- File: `app/api/humidor/aging-target/route.ts`.
- Add `export const runtime = "edge"` to match the existing pattern.
- Auth: `const user = await getServerUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });`.
- Ownership check before any mutation (`.eq("user_id", user.id)`).
- Log errors via `log.error({ scope: "humidor:aging-target", ... })` from `lib/log.ts`.

**New cron endpoint:**
- File: `app/api/cron/<name>/route.ts`.
- Gate on the `CRON_SECRET` header (the path is already exempt from session auth via `proxy.ts:7-19`).
- Register the schedule in `vercel.json`.

**New webhook (e.g. an external partner):**
- File: `app/api/<partner>/webhook/route.ts`.
- Verify the partner's signature header BEFORE any other work (Stripe pattern: `app/api/stripe/webhook/route.ts`).
- Add the path to `PUBLIC_PATHS` in `proxy.ts` so it's exempt from session auth.

**New shared component:**
- Feature-scoped: `components/<feature>/MyComponent.tsx` (e.g. `components/humidor/MyComponent.tsx`).
- Cross-feature primitive: `components/ui/MyComponent.tsx`.
- Lifecycle / PWA: `components/system/MyComponent.tsx`.
- If it's heavy + client-only (uses recharts, framer-motion, etc.), add a `MyComponentLazy.tsx` wrapper that `next/dynamic(...)`-imports it.

**New server data fetcher:**
- Public reads with cross-request caching: `lib/data/<resource>.ts` using `unstable_cache(fn, [key], { tags, revalidate })` + `createAnonClient()` from `utils/supabase/anon.ts`. Pattern: `lib/data/news.ts`.
- Per-user reads with per-request dedup: `lib/data/<resource>.ts` using `cache(async (id) => ...)` + `createClient()` from `utils/supabase/server.ts`. Pattern: `lib/data/profile.ts`.

**New client data fetcher (paired with SWR):**
- Fetcher: `lib/data/<resource>-fetchers.ts` (file marked `"use client"`).
- Key: add a builder to `keyFor` in `lib/data/keys.ts`.
- Call site: `useSWR(keyFor.myResource(...args), () => fetchMyResource(...args))`.

**New server action (RSC-callable mutation):**
- Co-locate with the page that calls it: `app/(app)/<route>/actions.ts` with `"use server"` at the top. Pattern: `app/(app)/discover/cigar-news/actions.ts`.

**New shared helper (cross-feature):**
- `lib/<name>.ts` for domain helpers (e.g. `lib/membership.ts`, `lib/cigar-taxonomy.ts`).
- `lib/hooks/use-<name>.ts` for custom hooks.

**New utility (Supabase client variant):**
- Resist the urge. The four factories in `utils/supabase/` cover every legitimate use case. Adding a fifth almost certainly means a callsite is using the wrong existing one.

**New migration:**
- `supabase/migrations/YYYYMMDD_description.sql` — apply via Supabase SQL editor or CLI.

**New script (one-off seed / migration):**
- `scripts/<name>.ts` — load env with `dotenv`, run with `npx tsx scripts/<name>.ts`.

**New static asset:**
- `public/<path>` — referenced as `/path` from code.
- Add a `Cache-Control` header rule in `next.config.ts:210-249` if the asset rarely changes.

**New legal text:**
- `content/legal/<name>.md` — render via `components/legal/LegalDocument.tsx` from a page at `app/<route>/page.tsx`.

**New test:**
- E2E: `tests/e2e/<name>.spec.ts`.
- No unit or integration framework wired in today.

## Special Directories

**`app/`:**
- Purpose: Next.js App Router routes + layouts.
- Generated: No.
- Committed: Yes.

**`public/`:**
- Purpose: Static assets served at `/`.
- Generated: Mixed — most files are committed; `public/sw.js` is generated by `serwist build` and git-ignored.
- Committed: Yes (except `sw.js`).

**`.next/`:**
- Purpose: Next build output.
- Generated: Yes (by `next build`).
- Committed: No.

**`node_modules/`:**
- Purpose: Dependencies.
- Generated: Yes (by `npm install`).
- Committed: No.

**`supabase/migrations/`:**
- Purpose: SQL migration history.
- Generated: No (hand-authored).
- Committed: Yes.

**`.planning/codebase/`:**
- Purpose: GSD codebase analysis docs (this folder).
- Generated: Yes (by `/gsd:map-codebase`).
- Committed: Yes (intentionally — these guide future planning).

---

*Structure analysis: 2026-05-18*
