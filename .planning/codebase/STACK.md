# Technology Stack

**Analysis Date:** 2026-05-18

## Languages

**Primary:**
- TypeScript `^5` — all application code (`app/`, `lib/`, `components/`, `utils/`, `scripts/`); `tsconfig.json` target ES2017, `strict: true`, `moduleResolution: "bundler"`, JSX `react-jsx`, path alias `@/* → ./*`
- TSX — React Server / Client components throughout `app/` and `components/`

**Secondary:**
- JavaScript / ESM — config files only (`postcss.config.mjs`, `eslint.config.mjs`, `serwist.config.mjs`)
- SQL — Supabase migrations in `supabase/migrations/*.sql`
- Python — one-off splash-image generator (`scripts/generate-ios-splash.py`)

## Runtime

**Environment:**
- Node.js — server runtime for App Router routes (`export const runtime = "nodejs"` declared by every Stripe webhook, cron route, push route, and YouTube/news sync route). Node is required where `web-push` or `@google-cloud/vision` are used (Node `crypto` not Edge-compatible).
- Edge runtime — used by `proxy.ts` and `app/api/weather/route.ts` (`export const runtime = "edge"`).
- Service Worker (WebWorker target) — `app/sw.ts` compiled via `tsconfig.sw.json` (`lib: ["esnext", "webworker"]`).

**Package Manager:**
- npm (lockfile: `package-lock.json` present at repo root)
- No `.nvmrc` / `.node-version` pinned

## Frameworks

**Core:**
- `next` `16.2.1` — App Router; this is a "Next.js you don't know" version with breaking changes (see `AGENTS.md`). Notable Next 16 features in use:
  - `proxy.ts` at repo root (Next 16 renamed `middleware.ts` → `proxy.ts`)
  - `instrumentation.ts` + `instrumentation-client.ts` (Sentry wiring)
  - `app/manifest.ts` (typed MetadataRoute.Manifest)
  - `experimental.viewTransition: true` (React `<ViewTransition>`)
  - `experimental.optimizePackageImports: ["framer-motion"]`
  - `images.qualities: [60, 70, 75]` allowlist (Next 16 snaps any other value)
  - `next/dynamic` lazy loads for sheets, scanners, modals
- `react` `19.2.4` + `react-dom` `19.2.4`

**Testing:**
- `@playwright/test` `^1.59.1` — E2E smoke tests under `tests/e2e/` (no unit-test framework configured)

**Build/Dev:**
- Turbopack (Next 16 default) — note: `next.config.ts` mentions some webpack-only options (Sentry `webpack.treeshake.removeDebugLogging`) that Turbopack ignores
- `@serwist/cli` `^9.5.11` + `@serwist/next` `^9.5.11` + `serwist` `^9.5.11` — service-worker bundler run as a POST-BUILD step (`next build && serwist build serwist.config.mjs`)
- `tailwindcss` `^4` + `@tailwindcss/postcss` `^4` — Tailwind v4 via PostCSS (`postcss.config.mjs`)
- `eslint` `^9` + `eslint-config-next` `16.2.1` — flat-config in `eslint.config.mjs` (`nextVitals` + `nextTs`); ignores `.next/**`, `out/**`, `build/**`, `next-env.d.ts`, `public/sw.js`, `public/sw.js.map`, `public/swe-worker-*.js`
- `tsx` `^4.21.0` — runs the `scripts/*.ts` seeders directly
- `dotenv` `^17.4.1` — used by `scripts/*` for loading `.env.local`

## Key Dependencies

**Critical:**
- `@supabase/ssr` `^0.9.0` — `createServerClient` (used in `proxy.ts`, `utils/supabase/server.ts`) and `createBrowserClient` (`utils/supabase/client.ts`)
- `@supabase/supabase-js` `^2.100.0` — service-role client (`utils/supabase/service.ts`) and anon client (`utils/supabase/anon.ts`, used inside `unstable_cache` where cookies aren't allowed)
- `stripe` `^21.0.1` — server SDK pinned to API version `"2026-03-25.dahlia"` in `lib/stripe.ts`
- `@stripe/stripe-js` `^9.0.1` — client SDK
- `@sentry/nextjs` `^10.51.0` — error tracking + tracing across server, edge, and client runtimes
- `@vercel/speed-insights` `^2.0.0` — RUM (Real User Monitoring), mounted in `app/layout.tsx`
- `@google-cloud/vision` `^5.3.5` — cigar-band OCR / safety detection in `app/api/vision/analyze/route.ts` and `lib/vision-safety.ts`
- `web-push` `^3.6.7` + `@types/web-push` `^3.6.4` — VAPID-signed Web Push delivery in `lib/push.ts`
- `@upstash/ratelimit` `^2.0.8` + `@upstash/redis` `^1.38.0` — sliding-window rate limiting backed by Upstash REST (`lib/rate-limit.ts`)
- `swr` `^2.4.1` — client-side data cache (foundation in `lib/data/keys.ts`, provider in `components/SWRProvider.tsx`)
- `next-themes` `^0.4.6` — theme provider (`defaultTheme="dark"`, `enableSystem={false}`)

**Infrastructure / UX:**
- `framer-motion` `^12.38.0` — landing-page animations; tree-shaken via `experimental.optimizePackageImports`
- `lucide-react` `^1.9.0` — icon library
- `date-fns` `^4.1.0` — date utilities (auto-optimized by Next 16)
- `recharts` `^3.8.1` — stats charts on `/humidor/stats`
- `qrcode.react` `^4.2.0` — digital member card QR (`components/membership/MembershipCard.tsx`)
- `canvas-confetti` `^1.9.4` + `@types/canvas-confetti` `^1.9.0` — onboarding flourish
- `fast-xml-parser` `^5.7.2` — RSS feed parsing in `/api/news/sync`

## Configuration

**Environment:**
- `.env.local` (gitignored) — local-dev secrets; loaded by Next at dev start and by `tsx` scripts via `dotenv`
- Vercel project env vars — Production + Preview tiers; auto-injected `VERCEL_GIT_COMMIT_SHA`, `VERCEL_ENV`, `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`, `NEXT_PUBLIC_VERCEL_ENV`
- Required client-side (`NEXT_PUBLIC_*`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`, `NEXT_PUBLIC_VERCEL_ENV`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED`
- Required server-side: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MEMBER_MONTHLY_PRICE_ID`, `STRIPE_MEMBER_ANNUAL_PRICE_ID`, `STRIPE_PREMIUM_MONTHLY_PRICE_ID`, `STRIPE_PREMIUM_ANNUAL_PRICE_ID`, `GOOGLE_API_KEY`, `GOOGLE_SEARCH_ENGINE_ID`, `YOUTUBE_API_KEY`, `GOOGLE_CLOUD_VISION_CREDENTIALS` (base64-encoded service-account JSON), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, `SYNC_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (or marketplace-prefixed `UPSTASH_REDIS_REST_KV_REST_API_URL` / `_TOKEN`), `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`

**Build:**
- `next.config.ts` — primary config; wraps `nextConfig` with `withSentryConfig` for source-map upload and the `/monitoring` Sentry tunnel route
- `serwist.config.mjs` — runs `serwist build` after `next build`; reads `app/sw.ts` and writes `public/sw.js`. `precachePrerendered: false` (auth-gated routes break precache otherwise)
- `tsconfig.json` — main TS config; excludes `app/sw.ts`
- `tsconfig.sw.json` — extends main, narrows lib to `["esnext", "webworker"]` for SW build
- `postcss.config.mjs` — registers `@tailwindcss/postcss` plugin
- `eslint.config.mjs` — flat config; extends `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`
- `playwright.config.ts` — E2E smoke tests; `BASE_URL` defaults to `http://localhost:3000`, overridden by `PLAYWRIGHT_BASE_URL` for preview-deploy runs
- `vercel.json` — defines four cron schedules (see INTEGRATIONS.md)

## Platform Requirements

**Development:**
- Node.js (no version pinned, but `@types/node` `^20` suggests Node 20.x target)
- npm + `.env.local` populated
- `npm run dev` — Next dev server on port 3000
- `npm run lint` — ESLint flat-config
- `npm run analyze` — `next experimental-analyze --output` for bundle reports
- `npm run test:e2e` / `test:e2e:ui` / `test:e2e:debug` — Playwright
- `npm run build` — runs `next build && serwist build serwist.config.mjs` (SW MUST be built after Next)

**Production:**
- Vercel — only target. Routes split between Node serverless (most APIs) and Edge runtime (`proxy.ts`, `/api/weather`).
- Vercel Cron — defined in `vercel.json` (see INTEGRATIONS.md)
- Vercel Speed Insights enabled via `<SpeedInsights />` in `app/layout.tsx:237`
- Custom security headers + CSP applied via `next.config.ts:async headers()`; CSP currently runs in `Content-Security-Policy-Report-Only` mode (enforce attempt reverted in #332; needs nonce-based `script-src` for Next 16 RSC Flight payloads)

---

*Stack analysis: 2026-05-18*
