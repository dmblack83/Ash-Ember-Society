# 01 — Architecture (rendering, auth, data flow)

> TL;DR for agents: Auth is verified ONCE per request in `proxy.ts` via local jose/JWKS JWT verification (no Supabase network call on the hot path) and forwarded as `x-ae-*` headers; server code reads it with `getServerUser()`. Most daily-use routes are **static app-shells**: the page is a prerendered, user-agnostic server component; auth resolves client-side via `resolveSessionGate` and per-user data arrives through SWR (with a localStorage-persisted cache). The service worker (Serwist, `app/sw.ts`) serves cached navigation HTML instantly on cold launch (StaleWhileRevalidate, auth-partitioned). Three inline `<head>` scripts form the resilience layer.

## Auth: proxy.ts (the only per-request auth check)

`proxy.ts` (root; Next.js proxy/middleware, matcher at proxy.ts:305-319 excludes `_next/static`, images, `sw.js`, `/monitoring` Sentry tunnel).

Flow per request:

1. Strip any client-supplied `x-ae-user-id` / `x-ae-user-email` / `x-ae-onboarding-completed` headers (anti-spoofing, proxy.ts:46-50).
2. Extract the Supabase access token from cookies (`sb-<ref>-auth-token`, handles `base64-` prefix and chunked `.0/.1` cookies).
3. **Fast path**: `jwtVerify(token, JWKS)` — local signature check against Supabase's JWKS endpoint (fetched once, cached for module lifetime). NO Supabase Auth network call for valid tokens (proxy.ts:76-78, 154-165).
4. **Slow path** (only `JWTExpired`): `supabase.auth.getSession()` raced against a **3s timeout** (`AUTH_SESSION_TIMEOUT_MS`, proxy.ts:6). Fires at most ~once per user per hour (token refresh). On timeout: treated as unauthenticated + `trackReliability({subtype:"proxy_auth_timeout"})`. Refresh Set-Cookie headers are carried through to the response.
5. Gating: unauthenticated on a protected path → HTML navigations redirect to `/login?next=...`; non-HTML (RSC/API, detected via Accept header) return **401** instead of a redirect (proxy.ts:223-238). Authenticated users on `/login`/`/signup` → `/home` (or `/onboarding`). Onboarding-incomplete users are forced to `/onboarding` except `/privacy`, `/terms`, `/eula`. Stale auth cookie on `/` → `/login`.
6. On success, the verified identity is forwarded downstream as `x-ae-*` headers.

`PUBLIC_PATHS` (proxy.ts:20-39): `/`, `/login`, `/signup`, `/forgot-password`, `/offline`, `/auth/callback`, `/auth/confirm`, `/manifest.webmanifest`, `/privacy`, `/terms`, `/eula`, plus API routes protected by their own secrets (`/api/stripe/webhook`, `/api/youtube`, `/api/news`, `/api/cron`, `/api/version`). `/reset-password` is deliberately NOT public.

### getServerUser() contract

`lib/auth/server-user.ts` — `getServerUser(): Promise<ServerUser | null>` reads the `x-ae-*` headers. Returns `{id, email, onboardingCompleted}` or `null` when the proxy didn't authenticate. Server components and route handlers call this instead of `supabase.auth.getUser()` (eliminates ~30 Supabase round-trips per page load). ~20 call sites: lounge pages, discover pages, admin, marketing landing, and most `/api/*` handlers.

**Gotcha**: because the proxy (not a cookie-based server client) authenticates, `auth.uid()` is NULL inside RSC Supabase queries — see 02-data-model.md.

## App-shell pattern (static shell + client auth)

Daily-use routes are fully static, user-agnostic server components — prerendered at build, served from CDN edge, zero server reads. Auth and data resolve client-side:

- `AppSessionProvider` (`components/system/app-session.tsx`, mounted in `app/(app)/layout.tsx:274`) resolves the Supabase session from local storage (`getSession()` — no network) and tracks it via `onAuthStateChange`. Treats an expired access token as no session. Exposes `{ready, session}`.
- `resolveSessionGate({hasSession, onboardingCompleted, pathname}) → "login" | "onboarding" | "allow"` (`lib/auth/session-gate.ts`) — pure, synchronous, unit-tested mirror of the proxy's gating rules (onboarding-exempt: `/privacy`, `/terms`, `/eula`).
- `useGatedSession()` (`lib/auth/use-gated-session.ts`) — the shared hook: applies the gate, `router.replace`s to `/login?next=...` or `/onboarding` when needed, returns `{ready, session, allowed}`. Contract: render the shell skeleton until `allowed && session`, then the authed client with `session.userId`.

App-shell routes (each has a `*Route.tsx` client gate using `useGatedSession`, plus `HomeAuthGate` / `AccountRoute`):

| Route | Gate file |
|---|---|
| `/home` | `app/(app)/home/HomeAuthGate.tsx` |
| `/account` | `app/(app)/account/AccountRoute.tsx` |
| `/humidor` | `app/(app)/humidor/HumidorRoute.tsx` |
| `/humidor/[id]` | `app/(app)/humidor/[id]/ItemRoute.tsx` |
| `/humidor/[id]/burn-report` | `.../BurnReportCreateRoute.tsx` |
| `/humidor/burn-reports` (+ `[id]/edit`) | `.../BurnReportsRoute.tsx`, `.../EditBurnReportRoute.tsx` |
| `/humidor/stats` | `.../StatsRoute.tsx` |
| `/humidor/wishlist` | `.../WishlistRoute.tsx` |
| `/discover/cigars/[id]` | `.../CigarDetailRoute.tsx` |

The proxy still guards these routes server-side (defense in depth); the client gate exists because the document itself is static.

## Route map

Route groups: `(app)` authenticated app, `(auth)` login/signup/reset, `(marketing)` landing (`/`). Legal pages (`/terms`, `/privacy`, `/eula`) and `/offline` sit at app root. ~34 pages, ~27 API endpoints under `app/api/`.

Rendering styles in use:

1. **Static app-shell + client SWR islands** — the table above. `/home` is the flagship: `app/(app)/home/page.tsx` renders six client islands (`MastheadIsland`, `SmokingConditionsIsland`, `NotificationsIsland`, `AgingIsland`, `LocalShopsIsland`, `NewsClientIsland` from `app/(app)/home/client-islands.tsx`); each manages its own skeleton via SWR + `useAppSession()`. NOTE: `/home` no longer uses `<Suspense>` server islands or `runtime = "edge"` — the news island moved client-side to make the whole document static.
2. **Server page + async Suspense data island** — lounge routes: `/lounge` (`LoungeDataIsland` in `<Suspense>`), `/lounge/[postId]` (`PostDetailDataIsland`), `/lounge/rooms/[slug]` (`CategoryFeedDataIsland`). These call `getServerUser()` and stream.
3. **Plain server pages** — discover pages, field guides (`runtime = "edge"` on field guides, lounge details, admin), legal pages, auth pages.

Layouts: root `app/layout.tsx` (fonts, head scripts, SWRProvider, SW registration, Speed Insights); `app/(app)/layout.tsx` is a **client** layout — AppSessionProvider + bottom nav (mobile) / side rail (lg+) + the system component stack (OfflineBanner, OutboxManager, A2HSBanner, ServiceWorkerUpdateNotice, StaleBuildNotice, ResumeHandler, ConnectionProbe, PushSubscriptionHealthCheck, PersistentStorageRequest); `(auth)` centered card; `(marketing)` image-CDN preconnects; `discover/` tab nav.

## Service worker (Serwist)

Source `app/sw.ts` → built post-`next build` by `serwist build serwist.config.mjs` → `public/sw.js` (gitignored). Registered in production by `components/ui/RegisterServiceWorker`. `skipWaiting` + `clientsClaim` + `navigationPreload` on.

Strategy table (runtime caches, first match wins, app/sw.ts:288-449):

| Resource | Strategy | Cache / cap |
|---|---|---|
| Supabase REST + Auth (GET and POST) | **NetworkOnly** — personalised data is never cached | — |
| Supabase Storage `/object/public/` | StaleWhileRevalidate | 100 entries / 6d |
| RSC payloads (`?_rsc=`, `rsc`/`next-router-state-tree` headers) | **NetworkOnly** | — |
| `/_next/static/*` | CacheFirst | 200 / 1y |
| `/_next/image` | StaleWhileRevalidate | 50 / 30d |
| Same-origin images | StaleWhileRevalidate | 50 / 30d |
| Google Fonts | CacheFirst | 20 / 1y |
| **Navigations** (`request.mode === "navigate"`) | **StaleWhileRevalidate**, auth-partitioned | 60 / 6d, `/offline` fallback |

Navigation cache is partitioned per user by `authPartitionPlugin` (app/sw.ts:205-221): cache key = URL + `#auth=<sha256(sub claim) 16 hex>`; sign-out → "anon" partition. Hashes the stable `sub`, NOT the rotating access token. Expirations are 6 days deliberately (inside iOS's 7-day eviction window).

**Precache gate rules**: `precachePrerendered: false` and appstore-image excludes in `serwist.config.mjs`; explicit precache URL entries were removed (app/sw.ts:242-271 documents why). The SW install fetch runs **cookieless** — any auth-gated file in `public/` or precached route returning non-200 fails install silently and hangs `navigator.serviceWorker.ready` (killed push subscriptions for weeks). Do NOT add precache entries or auth-gated files under `public/` without cookieless-200 verification. CI enforces this: job `sw-precache-check` in `.github/workflows/ci.yml` runs `scripts/check-sw-precache.mjs` against production on every main push.

**Update flow**: on `activate`, the SW broadcasts `SW_UPDATED` with a build-stable `SW_VERSION` (derived from precache-manifest revisions, app/sw.ts:526-532) — fire-and-forget, never inside `waitUntil` (iOS `matchAll` hang, PR #427). `components/system/ServiceWorkerUpdateNotice.tsx` shows the update banner and dedupes repeat versions via localStorage (iOS fires activate on every resume). `/sw.js` is served `max-age=0, must-revalidate` (next.config.ts headers).

Also in the SW: web-push handling (payload contract documented at app/sw.ts:557+; taps route via `AE_NAVIGATE` postMessage to `ServiceWorkerNavigator`, never `client.navigate()`), and offline-outbox replay (`sync` event `ae-outbox-sync`; IDB schema mirrored in `lib/offline-outbox.ts` — keep both files in lockstep).

## PWA resilience layer (inline `<head>` scripts)

All three are exported string constants, injected in `app/layout.tsx:204-220`, and hashed into the CSP in `next.config.ts:22-26` (changing a script auto-updates its hash — but they must stay byte-identical between the two imports).

1. **Cold-smoke init** (`components/cold-open-smoke/cold-smoke-init.ts`) — adds `cold-smoke-active` to `<html>` synchronously so the server-rendered launch overlay (one centered logo, `#15110b` background) shows from the first frame on cold PWA launch.
2. **Stale-chunk recovery** (`components/system/stale-chunk-recovery.ts`) — capture-phase `error` listener on `<script>`/`<link>`; on a `/_next/static/` load failure (stale SW HTML → deleted chunk after deploy): nuke all caches, unregister SWs, reload. Max 2 attempts/session (sessionStorage). Mark: `ae:chunk-load-error`.
3. **Hydration watchdog** (`components/system/hydration-watchdog.ts`) — 15s timer (`HYDRATION_BUDGET_MS`); if `window.__AE_HYDRATED` isn't set (done by `<HydrationMark/>` in a root useEffect), non-iOS force-reloads once; iOS PWA shows a manual "Refresh" overlay instead (programmatic `location.reload()` freezes WKWebView). Max 1/session. Mark: `ae:watchdog-fired`.

Performance marks in use (User Timing, grep `performance.mark`): `ae:chunk-load-error`, `ae:watchdog-fired`, `ae:hydrated`, `ae:resume`, `ae:resume-reconnect`, `ae:ios-resume-refresh`, `ae:stale-revive`, `ae:storage-persist-*`. Diagnosis pattern for hangs: check which mark fired. SW/head-script events also flow into Sentry via `trackReliability` (`lib/telemetry/reliability.ts` + `components/system/ReliabilityBootstrap.tsx`); five buckets: `sw_lifecycle`, `auth_session`, `network_resilience`, `ios_webkit`, `state_persistence`.

## SWR layer

- **Provider**: `components/SWRProvider.tsx` in the root layout. Defaults: `revalidateOnFocus:false`, `revalidateOnReconnect:true`, `dedupingInterval:30s` (the Supabase-volume dial), `keepPreviousData:true`, retries capped at 2.
- **Keys**: tuple keys only, built via `keyFor.*` in `lib/data/keys.ts` (`["humidor-items", userId]`). Per-user families embed `userId`; detail bundles embed `userId` AND row id.
- **Persistent cache** (`lib/swr-persist.ts`): the SWR cache Map hydrates **synchronously** from one localStorage blob (`ae-swr-cache-v1`) in a `useState` initializer, so last-known data renders on the FIRST client render of a cold launch. Allowlisted families only (`PERSIST_FAMILIES`, priority-ordered), 1.5 MB byte budget, 7-day max age, blob stamped with owning userId. Saves on `visibilitychange:hidden` + `pagehide` (the reliable iOS signals). User switch or `SIGNED_OUT` strips per-user entries and deletes the blob. Error/undefined entries never persist. Server render always starts with an empty Map.
- **Cache coherence**: writes performed outside a list view repopulate the list's key via helpers like `revalidateHumidor()` (`lib/data/humidor-cache.ts`) — `mutate(key, freshFetch, {revalidate:false})`, fire-and-forget `Promise.allSettled`.

## Data flow summary

```
Request → proxy.ts (jose JWKS verify, x-ae-* forward, redirects/401)
  ├─ static app-shell page (CDN) → client: AppSessionProvider → useGatedSession
  │     → SWR (keyFor.* + lib/data/*-fetchers.ts, browser Supabase client, RLS-scoped)
  │     → persisted cache renders last-known data instantly
  ├─ server page → getServerUser() + lib/data/* (React cache() / unstable_cache + anon client)
  └─ /api/* route handlers → getServerUser() + ownership checks (service client where documented)
```

Supabase clients (`utils/supabase/`): `client.ts` browser (SWR fetchers, RLS), `server.ts` cookie-based per-request, `anon.ts` stateless for `unstable_cache` public reads, `service.ts` service-role (webhooks/admin only — all call sites audited).
