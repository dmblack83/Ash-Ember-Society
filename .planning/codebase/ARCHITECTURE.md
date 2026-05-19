<!-- refreshed: 2026-05-18 -->
# Architecture

**Analysis Date:** 2026-05-18

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                          Client (Browser / PWA)                       │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────┐   │
│  │ RSC server output   │  │ Client islands      │  │ Service Wkr  │   │
│  │ (streamed HTML)     │  │ ("use client")      │  │ `public/sw.js│   │
│  │  app/(app)/.../     │  │  components/**/     │  │ ← built from │   │
│  │  page.tsx           │  │  *Client.tsx,       │  │  app/sw.ts   │   │
│  └─────────┬───────────┘  │  SWR + supabase-js  │  └──────┬───────┘   │
│            │              └──────────┬──────────┘         │            │
└────────────┼──────────────────────────┼───────────────────┼────────────┘
             │ HTTP                     │ HTTP/WebSocket    │ Cache + push
             ▼                          ▼                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Next.js 16 edge runtime — Vercel                                     │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  Root proxy — `proxy.ts`                                      │    │
│  │  • supabase.auth.getUser() with 3 s timeout                   │    │
│  │  • strips client-supplied x-ae-* headers                      │    │
│  │  • redirects unauth → /login, incomplete onboarding → /onbd   │    │
│  │  • forwards `x-ae-user-id`, `x-ae-user-email`,                │    │
│  │    `x-ae-onboarding-completed`                                │    │
│  └────────────┬─────────────────────────────────────────────────┘    │
│               │                                                       │
│   ┌───────────┴──────────────────┬────────────────────────┐          │
│   ▼                              ▼                        ▼          │
│ ┌──────────────────┐  ┌─────────────────────┐  ┌────────────────┐    │
│ │ Server Components│  │ Route Handlers      │  │ Server Actions │    │
│ │ `app/(app)/**/   │  │ `app/api/**/route.ts│  │ "use server"    │    │
│ │  page.tsx`       │  │  20 endpoints       │  │  modules        │    │
│ │ getServerUser()  │  │  getServerUser()    │  │ (e.g. cigar-    │    │
│ │ + cached         │  │  + ownership checks │  │  news/actions)  │    │
│ │ React.cache()    │  │                     │  │                 │    │
│ │ + unstable_cache │  │                     │  │                 │    │
│ └────────┬─────────┘  └──────────┬──────────┘  └────────┬───────┘    │
│          │                       │                      │             │
│   ┌──────┴───────────────────────┴──────────────────────┘             │
│   │   Data layer — `lib/data/*`, `utils/supabase/*`                   │
│   │   getProfileLite, getLatestNews, getPopularCigars, ...            │
│   └──────────────────────────┬───────────────────────────             │
│                              │                                        │
└──────────────────────────────┼────────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Supabase                                                             │
│   • Auth (JWT cookies, refresh in proxy)                              │
│   • Postgres + RLS (humidor_items, smoke_logs, forum_posts, ...)      │
│   • Storage public buckets (avatars, cigar-photos, post-images)       │
│   `qagaiuibtwuhihukghyx.supabase.co`                                  │
└──────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Root proxy | Auth gate, onboarding gate, `x-ae-*` header forwarding | `proxy.ts` |
| Server-user reader | Pulls verified user from forwarded headers (no extra Supabase call) | `lib/auth/server-user.ts` |
| Cookie Supabase client | Per-request server client; reads cookies, refreshes session | `utils/supabase/server.ts` |
| Anon Supabase client | Stateless client for `unstable_cache` callbacks (public reads) | `utils/supabase/anon.ts` |
| Service-role client | Server-only bypass-RLS client (webhooks, admin endpoints) | `utils/supabase/service.ts` |
| Browser Supabase client | Client-side reads + realtime; used in SWR fetchers | `utils/supabase/client.ts` |
| SWR provider | App-wide cache config (30 s dedupe, no focus revalidate) | `components/SWRProvider.tsx` |
| SWR key registry | Tuple cache keys + JSON fetcher | `lib/data/keys.ts` |
| Data-layer fetchers (server) | `React.cache()` and `unstable_cache` wrappers | `lib/data/profile.ts`, `lib/data/news.ts`, `lib/data/cigar-catalog.ts`, `lib/data/forum.ts` |
| Data-layer fetchers (client) | Client-side Supabase reads for SWR | `lib/data/humidor-fetchers.ts`, `lib/data/lounge-fetchers.ts`, `lib/data/cigar-fetchers.ts` |
| Cigar default image | Wrapper → default WebP path mapping | `lib/cigar-default-image.ts` |
| Service worker | Cache strategies, push, offline outbox replay | `app/sw.ts` (built → `public/sw.js` via `serwist.config.mjs`) |
| Instrumentation | Sentry init for Node + Edge runtimes | `instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` |
| Manifest | PWA manifest (id, scope, shortcuts, icons) | `app/manifest.ts` |
| Root layout | Fonts, head scripts, providers, SW registration | `app/layout.tsx` |
| Bottom nav / side rail | Bottom nav on mobile, side rail on lg+, anchored across view transitions | `app/(app)/layout.tsx` |

## Pattern Overview

**Overall:** Next.js 16 App Router with server-component-first rendering, client-island opt-in, single root proxy for auth, and a service-worker-backed PWA shell.

**Key Characteristics:**
- **Server Components are the default.** 21 of 90 `components/**/*.tsx` files carry `"use client"`; the rest are server-rendered. Pages under `app/(app)/**/page.tsx` start as sync server components, with data fetching delegated to async server islands inside `<Suspense>` boundaries.
- **One auth check per request.** `proxy.ts` is the only file that calls `supabase.auth.getUser()` per request; downstream code reads the verified identity from forwarded `x-ae-*` headers via `getServerUser()`.
- **Two caching layers.** Server: React `cache()` for per-request dedup (`getProfileLite`), `unstable_cache` for cross-request TTL caches (`getLatestNews`, `getPopularCigars`). Client: SWR with stable tuple keys defined in `lib/data/keys.ts`.
- **PWA-grade resilience.** Three independent watchdogs in `<head>` cover stale-chunk 404s, hydration hangs, and slow auth; documented in PROJECT_STATE.md.
- **Edge runtime by default for pages.** Most `(app)` pages set `export const runtime = "edge"` for faster cold start.

## Layers

**Routing / shell (RSC):**
- Purpose: Page entry, route grouping, layouts, error boundaries.
- Location: `app/`
- Contains: Server components (`page.tsx`, `layout.tsx`), error boundaries (`error.tsx`, `global-error.tsx`), loading states (`loading.tsx`), PWA manifest (`manifest.ts`).
- Depends on: Data layer, components.
- Used by: The Next.js runtime.

**Auth proxy:**
- Purpose: Single source of truth for whether a request is authenticated and onboarded.
- Location: `proxy.ts` (project root)
- Contains: One `proxy()` export + matcher config.
- Depends on: `@supabase/ssr` `createServerClient`.
- Used by: Every non-static request (see matcher exclusions for `_next/static`, `monitoring`, image extensions).

**Server data layer:**
- Purpose: Typed Supabase reads with dedup / TTL caching.
- Location: `lib/data/`
- Contains: `profile.ts` (`React.cache`), `news.ts`, `cigar-catalog.ts`, `forum.ts` (all `unstable_cache`), plus client-side mirrors (`humidor-fetchers.ts`, `lounge-fetchers.ts`, `cigar-fetchers.ts`).
- Depends on: `utils/supabase/server.ts` (cookie client) and `utils/supabase/anon.ts` (anon client for cacheable reads).
- Used by: Server components, route handlers, server actions, and SWR fetchers in client components.

**Route handlers (`app/api/**`):**
- Purpose: Mutations the client invokes via `fetch`, webhooks from external services, cron endpoints, image uploads.
- Location: `app/api/`
- Contains: 20 `route.ts` files. Auth-gated handlers call `getServerUser()` (e.g. `app/api/burn-report/route.ts`, `app/api/avatar/route.ts`). Webhook + cron handlers gate on header secrets (e.g. `app/api/stripe/webhook/route.ts` uses Stripe signature verification; `app/api/cron/*` uses `CRON_SECRET`; `app/api/news/sync/route.ts` and `app/api/youtube/sync/route.ts` use `SYNC_SECRET`). The proxy `PUBLIC_PATHS` list exempts these from session auth.
- Depends on: `lib/auth/server-user.ts`, Supabase clients, Stripe SDK, web-push, Google Cloud Vision.
- Used by: Client components (fetch), Stripe, Vercel cron, the offline outbox replay path.

**Server Actions:**
- Purpose: Lightweight RSC-callable mutations (typed, no manual JSON marshalling).
- Location: Co-located with the page that uses them, marked `"use server"`.
- Single instance today: `app/(app)/discover/cigar-news/actions.ts` (paginated news loader).
- Used by: The matching client component for "Load more" pagination.

**Client islands:**
- Purpose: Interactive UI sub-trees rendered as client components inside an otherwise server-rendered tree.
- Location: `components/**/*Client.tsx`, `components/**/*Lazy.tsx`, plus discrete UI primitives in `components/ui/`.
- Contains: 21 `"use client"` files. Most receive their initial data as props from a server island; subsequent reads go through SWR.
- Depends on: SWR, `utils/supabase/client.ts`, framer-motion (landing only), recharts (stats only, lazy via `next/dynamic`).
- Used by: Server pages and other client components.

**Service worker:**
- Purpose: Cache strategy per resource class, offline navigation fallback, push notifications, offline-outbox replay.
- Location: `app/sw.ts` (source) → `public/sw.js` (built by `serwist build` after `next build`).
- Contains: One Serwist `runtimeCaching` table + push / notificationclick / sync handlers.
- Depends on: `serwist`, the build-time `__SW_MANIFEST` precache list.
- Used by: The browser, once `RegisterServiceWorker` from `app/layout.tsx` registers it.

## Data Flow

### Primary Request Path (authenticated page navigation)

1. Browser issues navigation request (`GET /home`). (`app/layout.tsx` is the root layout; matcher in `proxy.ts:208` runs for everything except static assets.)
2. `proxy()` strips any client-supplied `x-ae-*` headers and creates a `createServerClient` bound to the request cookies. (`proxy.ts:42-77`)
3. `proxy()` races `supabase.auth.getUser()` against a 3 s timeout. (`proxy.ts:97-117`)
4. If unauthenticated and path is not in `PUBLIC_PATHS`, redirect to `/login?next=<path>`. (`proxy.ts:123-128`)
5. If authenticated and onboarding incomplete, redirect to `/onboarding` (with `/privacy` and `/terms` exempted). (`proxy.ts:162-176`)
6. Otherwise, forward `x-ae-user-id`, `x-ae-user-email`, `x-ae-onboarding-completed` to the downstream handler. (`proxy.ts:184-190`)
7. Server component (e.g. `app/(app)/home/page.tsx`) calls `getServerUser()` which reads the forwarded headers — no Supabase round-trip. (`lib/auth/server-user.ts:23-32`)
8. The page renders synchronously, returning a shell + `<Suspense>` boundaries wrapping async server islands (`app/(app)/home/_islands.tsx`). Each island fetches its own data via the cookie-bound `createClient()` from `utils/supabase/server.ts`.
9. `getProfileLite(userId)` is called by multiple islands on the same request; `React.cache()` collapses them to one Supabase query. (`lib/data/profile.ts:39`)
10. HTML streams from edge to the browser. The shell paints first; islands stream in as their data resolves.
11. After hydration, client components subscribe to SWR keys (`lib/data/keys.ts`); SWR shares one cache entry per key across the app. Background revalidation fires when an entry is older than `dedupingInterval` (30 s). (`components/SWRProvider.tsx`)

### Client Mutation Path (e.g. submit burn report)

1. Client component (`components/humidor/BurnReport.tsx`) calls `fetch("/api/burn-report", { method: "POST", body })`.
2. Proxy verifies session, forwards `x-ae-*` headers.
3. `app/api/burn-report/route.ts` (edge runtime) reads `getServerUser()`, validates payload, checks `humidor_items` ownership, performs sequential inserts (`smoke_logs`, `burn_reports`), decrements quantity.
4. On network failure, `lib/offline-outbox.ts` enqueues the request in IndexedDB; the SW `sync` handler in `app/sw.ts:644-649` replays on reconnect.
5. Client triggers SWR `mutate(keyFor.humidorItems(userId))` to refetch.

### Service Worker Path

1. `RegisterServiceWorker` in `components/ui/RegisterServiceWorker.tsx` registers `/sw.js` in production only. (`app/layout.tsx:221`)
2. SW activates and posts `SW_UPDATED` to controlled clients on every activate; `ServiceWorkerUpdateNotice` shows a non-blocking reload banner after the first install. (`app/sw.ts:400-411`)
3. Subsequent fetches route through Serwist's `runtimeCaching` table:
   - Navigation requests → `NetworkFirst` with auth-partitioned cache key (hash of JWT `sub`).
   - `/_next/static/*` → `CacheFirst`, 1 year.
   - Supabase Storage public buckets → `StaleWhileRevalidate`, 7 days.
   - Supabase REST / Auth + RSC payloads → `NetworkOnly` (never cached).
   - Images, fonts, next/image output → SWR or CacheFirst.
4. On total network failure for navigation, the SW falls back to `/offline` (precached).

**State Management:**
- Server: forwarded request headers (auth) + per-request React `cache()` for dedup + cross-request `unstable_cache` for TTL'd public data.
- Client: SWR cache (`components/SWRProvider.tsx`) keyed by tuples from `lib/data/keys.ts`. Auth tokens live in Supabase-managed cookies (split across `sb-*-auth-token`, `.0`, `.1`). Local UI state stays in React.
- Offline: IndexedDB outbox (`lib/offline-outbox.ts`) for pending mutations.

## Key Abstractions

**Verified-user reader (`getServerUser`):**
- Purpose: Lets any server component / route handler / server action read the current user without a Supabase round-trip.
- Examples: `lib/auth/server-user.ts`, callers in `app/(app)/home/page.tsx:43`, `app/(app)/humidor/page.tsx:21`, `app/(app)/lounge/page.tsx:17`, `app/api/burn-report/route.ts:65`.
- Pattern: Read `x-ae-user-id` / `x-ae-user-email` / `x-ae-onboarding-completed` headers; return null when missing (defensive fallback that the proxy should make unreachable on protected routes).

**Per-request dedup (`React.cache`):**
- Purpose: Collapse N callers of the same query within one server render into one Supabase trip.
- Examples: `lib/data/profile.ts:39` (`getProfileLite`). Used by `MastheadIsland`, `SmokingConditionsIsland`, `LocalShopsIsland` on the same `/home` render.
- Pattern: Wrap the fetcher in `cache(async (key) => ...)`; argument identity within a render = same result.

**Cross-request TTL cache (`unstable_cache`):**
- Purpose: Cache results of public reads with revalidation tags.
- Examples: `lib/data/news.ts` (tag `"news-items"`, 5 min), `lib/data/cigar-catalog.ts` (tag `"cigar-catalog"`, 1 h).
- Pattern: Inside the cache callback, use `createAnonClient()` (no cookies — `cookies()` is a dynamic API that defeats memoization). Bust with `revalidateTag(...)` from mutation paths.

**SWR cache keys (`lib/data/keys.ts`):**
- Purpose: Centralised tuple keys so every `useSWR` and `mutate` call agrees on the cache slot.
- Examples: `keyFor.humidorItems(userId)`, `keyFor.loungeFeed(categoryId, page, userId, filter)`, `keyFor.cigarSearch(query, page)`.
- Pattern: Always tuples (object args produce a new identity per render). Family label first, args follow.

**Async server islands (`_islands.tsx`):**
- Purpose: Stream-in data sections wrapped by `<Suspense>` boundaries on the parent page.
- Examples: `app/(app)/home/_islands.tsx` (5 islands), `app/(app)/humidor/_islands.tsx` (1 island).
- Pattern: Async function component, exported from a sibling `_islands.tsx`, imported by `page.tsx`, wrapped in `<Suspense fallback={<Skeleton />}>`. Skeletons live in `_skeletons.tsx`.

**Dynamic imports for heavy client code (`next/dynamic`):**
- Purpose: Split heavy client bundles off the main route chunk.
- Examples: `components/humidor/StatsClientLazy.tsx` (recharts, ~95KB), `components/dashboard/FieldGuide.tsx`, `components/lounge/CategoryFeed.tsx`, `components/cigars/DiscoverCigarsClient.tsx`.
- Pattern: `dynamic(() => import("./X").then((m) => ({ default: m.X })), { ssr: false, loading: () => null })`.

**Cigar default image (`getCigarImage`):**
- Purpose: Single helper that returns the cigar's photo or a wrapper-appropriate fallback WebP from `/public/Cigar Default Images/`.
- Examples: `lib/cigar-default-image.ts`. Called from `components/cigars/AddToHumidorSheet.tsx`, `app/(app)/humidor/page.tsx`, etc.
- Pattern: `getCigarImage(imageUrl, wrapper)` — prefer the stored URL, fall back to wrapper-mapped default.

## Entry Points

**Root proxy (`proxy.ts`):**
- Location: `proxy.ts` (project root — Next 16 names it `proxy.ts`, not `middleware.ts`).
- Triggers: Every request matching the path matcher in `proxy.ts:208` (everything except `_next/static`, `_next/image`, `favicon.ico`, `manifest.webmanifest`, `sw.js`, workbox files, `monitoring`, and image extensions).
- Responsibilities: Auth gate, onboarding gate, `x-ae-*` header forwarding.

**Root layout (`app/layout.tsx`):**
- Location: `app/layout.tsx`
- Triggers: Every server render that doesn't sit under a more specific layout's tree.
- Responsibilities: HTML/body, fonts, `<head>` resource hints, inline `<script>` watchdogs, providers (`ThemeProvider`, `SWRProvider`), SW registration, Vercel Speed Insights, accessibility skip link.

**Home page (`app/(app)/page.tsx` / `app/(app)/home/page.tsx`):**
- Note: PROJECT_STATE.md lists `app/(app)/page.tsx`; the current source has `app/(app)/home/page.tsx`. The home route is `/home`.
- Location: `app/(app)/home/page.tsx`
- Responsibilities: Sync server shell + 5 streamed Suspense islands.

**Auth callback (`app/auth/callback/route.ts`):**
- Location: `app/auth/callback/route.ts`
- Triggers: Supabase email-link + OAuth redirects.

**Service worker source (`app/sw.ts`):**
- Location: `app/sw.ts` (excluded from `tsconfig.json` main build; compiled separately by Serwist via `tsconfig.sw.json` + `serwist.config.mjs`).
- Triggers: `RegisterServiceWorker` mounts on root layout.

**Sentry instrumentation (`instrumentation.ts`, `instrumentation-client.ts`):**
- Location: project root.
- Triggers: Next 16 calls `register()` once per server cold start; client config auto-loads in the browser bundle.
- Responsibilities: Init `@sentry/nextjs` for Node + Edge, hook `captureRequestError` and `captureRouterTransitionStart`, listen for CSP violations.

**API routes (`app/api/**/route.ts`):**
- Location: 20 endpoints; full list in STRUCTURE.md.
- Notable: `app/api/burn-report/route.ts` (single-shot multi-table mutation, replayable from outbox), `app/api/stripe/webhook/route.ts` (signature-gated), `app/api/cron/*` (Vercel cron, `CRON_SECRET`-gated), `app/api/vision/analyze/route.ts` (Google Cloud Vision OCR).

## Architectural Constraints

- **Single auth check per request.** Only `proxy.ts` calls `supabase.auth.getUser()`. Downstream code uses `getServerUser()` — never re-fetch the user inside a page or route handler unless the proxy is bypassed (e.g. server actions that don't yet flow through the matcher).
- **Service-role client is server-only.** `createServiceClient()` from `utils/supabase/service.ts` MUST never be imported into a client component. Use sparingly — it bypasses RLS. Audit 2026-05-06 cleared all 11 callsites.
- **Anon client is cache-safe.** `createAnonClient()` from `utils/supabase/anon.ts` is required inside `unstable_cache` callbacks; the cookie-bound `createClient()` reads `cookies()`, which disqualifies the function from being memoized.
- **Threading model:** Edge runtime is single-threaded JavaScript. Long awaits in `proxy.ts` block the document response — see the 3 s `Promise.race` for `auth.getUser()` (`proxy.ts:97-117`). Never add an unbounded await in the proxy.
- **Module-level state:** Sentry SDK init runs at module load. Supabase client factories accept a per-request cookie store; they don't share state across requests.
- **Cookie order matters.** Always return `supabaseResponse` (or a response carrying its cookies) from the proxy. Discarding it after `setAll` runs strands the refreshed session cookies.
- **CSP inline-script hashes are pinned.** `next.config.ts:18-26` SHA-256-hashes the three `<head>` watchdog scripts. Edit any of those constants and the CSP hash updates automatically. The policy currently ships as `Content-Security-Policy-Report-Only` — see PROJECT_STATE.md memory `project_csp_nonce_required.md`.
- **SW manifest path quirk:** `public/Cigar Default Images/` contains a space; `next.config.ts:240` uses URL-encoded form in the `source:` pattern (`/Cigar%20Default%20Images/:path*`).
- **iOS PWA install requires legacy `apple-mobile-web-app-capable` tag.** `app/layout.tsx:91-93` sets this explicitly even though Next 16 emits the W3C-standard tag from `appleWebApp.capable`.
- **`/api/cron`, `/api/news`, `/api/youtube` are exempt from session auth.** They authenticate via `CRON_SECRET` or `SYNC_SECRET` headers. See `proxy.ts:7-19`.

## Anti-Patterns

### Calling `supabase.auth.getUser()` inside a page or route handler

**What happens:** A page or route handler re-validates the JWT with Supabase Auth.
**Why it's wrong:** Adds 100-300 ms per render for data the proxy already verified. Multiple components on the same page can each add their own call. PROJECT_STATE.md notes this audit eliminated ~30 redundant round-trips per page.
**Do this instead:** `const user = await getServerUser();` from `lib/auth/server-user.ts`. Fall back to `supabase.auth.getUser()` only when the proxy doesn't run (e.g. some Server Function entry points).

### Object-literal SWR keys

**What happens:** `useSWR({ userId }, fetcher)` — a fresh object every render.
**Why it's wrong:** SWR uses reference equality for key dedup. A new object means a new key, which means a fresh fetch every render and no shared cache entry across subscribers.
**Do this instead:** Use the tuple builders in `lib/data/keys.ts`. Example: `useSWR(keyFor.humidorItems(user.id), fetchHumidorItems)`.

### Cookie-bound Supabase client inside `unstable_cache`

**What happens:** `unstable_cache(async () => { const s = await createClient(); ... })` — the inner client reads `cookies()`.
**Why it's wrong:** `cookies()` is a dynamic API that disqualifies the wrapping function from being memoized. The cache silently never hits.
**Do this instead:** Use `createAnonClient()` (`utils/supabase/anon.ts`) inside `unstable_cache` callbacks. The pattern is established in `lib/data/news.ts:29` and `lib/data/cigar-catalog.ts:34`.

### Discarding `supabaseResponse` in the proxy

**What happens:** Code path returns a new `NextResponse` after `supabase.auth.getUser()` runs but doesn't copy the cookies from `supabaseResponse`.
**Why it's wrong:** Supabase writes refreshed session cookies via `setAll`; dropping them logs the user out on the next request.
**Do this instead:** Either return `supabaseResponse` directly, or carry its cookies onto the new response (`proxy.ts:188-190`).

### Top-level data awaits in a page

**What happens:** `export default async function Page() { const items = await fetchItems(); return <Children items={items} />; }`
**Why it's wrong:** The entire HTML response blocks on the slowest query. The static shell can't paint until the data resolves.
**Do this instead:** Move the await into an async server island (`_islands.tsx`) and wrap with `<Suspense fallback={<Skeleton />}>` in the page. The page stays sync; the shell streams first. Pattern: `app/(app)/home/page.tsx` + `_islands.tsx` + `_skeletons.tsx`.

### Importing `framer-motion`, `recharts`, or other large client deps in a shared component

**What happens:** A heavy dep gets pulled into the main route chunk for every page that imports the component.
**Why it's wrong:** Inflates LCP for routes that don't need the dep. `recharts` alone is ~95 KB gzipped.
**Do this instead:** Wrap with `next/dynamic` and `ssr: false`. See `components/humidor/StatsClientLazy.tsx` for the canonical example. `framer-motion` is in `experimental.optimizePackageImports` in `next.config.ts:107` so named imports tree-shake correctly.

### Reading `getServerUser()` and assuming it's never null

**What happens:** `const u = await getServerUser(); doSomething(u.id);` without a null check.
**Why it's wrong:** Defensive null returns from `lib/auth/server-user.ts:26` cover misconfigured matchers and direct Server Function calls. Skipping the check turns those edge cases into runtime crashes.
**Do this instead:** Always `if (!user) redirect("/login");` (pages) or `return NextResponse.json({ error: "Unauthorized" }, { status: 401 });` (route handlers). Pattern: `app/(app)/home/page.tsx:44`, `app/api/burn-report/route.ts:67`.

## Error Handling

**Strategy:** Tiered error boundaries that match the layout hierarchy + structured logging into Sentry.

**Patterns:**
- `app/global-error.tsx` catches errors in the root layout itself (`<html>` / `<body>` self-contained because the layout failed to render).
- `app/error.tsx` catches errors inside the root layout (auth, marketing routes).
- `app/(app)/error.tsx` catches errors inside the (app) group — keeps the bottom nav visible so the user can navigate away.
- Route handlers return `NextResponse.json({ error }, { status })` and log via `lib/log.ts`.
- The `log` helper (`lib/log.ts`) emits to Sentry Logs, Sentry Issues (for genuine `Error` instances at level `"error"`), and console (single-line JSON in production for Vercel log search).
- `instrumentation.ts:27` wires `onRequestError = Sentry.captureRequestError` for all server-side request errors.
- CSP violations are captured manually in `instrumentation-client.ts:54-82` (browsers fire `securitypolicyviolation` events but Sentry doesn't auto-instrument them).
- PWA resilience layer (PROJECT_STATE.md §"PWA resilience layer"): chunk-load recovery (`components/system/stale-chunk-recovery.ts`), hydration watchdog (`components/system/hydration-watchdog.ts`), Supabase auth timeout (`proxy.ts:97-117`).

## Cross-Cutting Concerns

**Logging:** Structured via `lib/log.ts` (`log.error`, `log.warn`, `log.info`, `log.debug`). Required `scope` field. Use in new code; existing `console.error` sites are not yet migrated.

**Validation:** Manual at route-handler boundaries (e.g. `app/api/burn-report/route.ts:78-84`). No schema library wired in today.

**Authentication:** Single-source-of-truth at `proxy.ts`. Downstream consumers use `getServerUser()`. Service-role bypass via `createServiceClient()` is restricted to server-only mutations (webhooks, admin endpoints).

**Authorization:** Row Level Security in Postgres + explicit ownership checks in route handlers (e.g. `humidor_items.user_id == user.id` in `app/api/burn-report/route.ts:88-98`).

**Rate limiting:** `@upstash/ratelimit` + `@upstash/redis` are in `package.json`; helper in `lib/rate-limit.ts`. Applied at sensitive endpoints (e.g. Vision API).

**Performance phases shipped (PRs #258–#265, PROJECT_STATE.md):**
- #262 — `/home` decomposed into sync shell + Suspense islands.
- #263 — Serwist service worker with per-resource strategy table and `/offline` fallback.
- #264 — SWR foundation (`SWRProvider`, `lib/data/keys.ts`).
- #259 — `npm run analyze` + framer-motion tree-shake.
- #258 — Compress static PNGs (~67% saved).
- #265 — Vercel Speed Insights for RUM (`app/layout.tsx:237`).

**Push notifications:** VAPID-keyed web-push, subscribe via `app/api/push/subscribe/route.ts`, delivered through `lib/push.ts`, displayed by `app/sw.ts:443-472`. Retry queue at `app/api/cron/push-retry/route.ts`.

**Offline-first mutations:** `lib/offline-outbox.ts` (IndexedDB queue) + `app/sw.ts:644-649` (SW `sync` event replay) + `components/system/OutboxManager.tsx` (online-event fallback for Safari).

---

*Architecture analysis: 2026-05-18*
