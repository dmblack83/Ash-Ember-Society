# 04 — Performance Contract

> TL;DR for agents: PWA performance is paramount; every change is weighed against bundle size, LCP/INP, and SW behavior. CI enforces a bundle-size gate (`scripts/check-bundle-size.mjs` vs `scripts/bundle-baseline.json`, tolerance = max(+10%, +20 KB) per metric). A list of shipped optimizations below must NOT be regressed. Two approaches were tried and rejected: network-first SW navigation and hash-pinned CSP enforcement — do not re-propose either.

## CI bundle-size gate

Mechanics (`scripts/check-bundle-size.mjs`, job `bundle-size` in `.github/workflows/ci.yml`):

- Runs on PRs only, and only when repo secrets `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are configured (job self-skips otherwise with a `::notice::`). Server-only secrets get dummies (`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) — nothing calls out during build.
- Pipeline: `npx next build` → `npm run analyze` (= `next experimental-analyze --output`) → `npm run check:bundle`.
- Two metric families compared against `scripts/bundle-baseline.json`:
  1. Total bytes of `.next/static/chunks/` (`chunksTotalBytes`).
  2. Per-route `analyze.data` file size for every app route (API routes and `/middleware` excluded).
- Tolerance per metric: `max(baseline * 0.10, 20_000)` bytes (`TOLERANCE_PCT` / `TOLERANCE_BYTES`, scripts/check-bundle-size.mjs:34-35). Growth beyond tolerance fails CI with exit 1.
- New routes are NOT gated — they print an informational note. Adding a page never blocks.

**Updating the baseline legitimately** (deliberate growth):

```
npm run build && npm run analyze && npm run check:bundle:write
```

Commit the regenerated `scripts/bundle-baseline.json` **in the same PR** with an explanation of why the growth is intended. Never regenerate the baseline to silence an accidental regression.

## analyze.data caveat (important)

Per-route `analyze.data` figures are DIAGNOSTIC bytes, NOT shipped JS. They are only valid for **same-route-across-builds** comparison. Never compare route-to-route ("why is /humidor bigger than /home") and never quote them as bundle size. Human-readable history + caveats live in `BUNDLE_BASELINE.md` (repo root). Example: `/humidor` jumped +63% in the 2026-07-01 snapshot purely because the static-shell conversion moved the data layer into the client analyze scope — shipped JS did not grow by that amount.

## Do-NOT-regress list

Each item is shipped and load-bearing. One line each on what breaks it.

| Optimization | Where | What breaks it |
|---|---|---|
| App-shell pattern (static shell + client auth) | Converted routes render a synchronous shell; auth resolves client-side via `useGatedSession()` (`lib/auth/use-gated-session.ts`) | Adding `await getServerUser()` / any server data fetch back into a converted `page.tsx` makes the route dynamic again and re-couples first paint to server auth |
| Suspense islands on `/home` | `app/(app)/home/` — shell paints before any Supabase query resolves | Hoisting an island's data fetch into the page component, or awaiting anything before the shell returns |
| Persistent SWR cache | `lib/swr-persist.ts` + `components/SWRProvider.tsx` — synchronous localStorage hydration in a `useState` initializer | Making hydration async (IndexedDB), adding a non-allowlisted family that bloats the 1.5 MB budget, or breaking key-tuple serialization (`familyForKey` matches the quoted family token) |
| `serverExternalPackages` | `next.config.ts:115-123` — `@google-cloud/vision`, `@grpc/grpc-js`, `@grpc/proto-loader`, `google-gax`, `google-auth-library`, `protobufjs`, `sharp` | Removing an entry re-bundles ~3 MB of gRPC stack into the shared server chunk on every cold start; `sharp` must never bundle (native binaries) |
| framer-motion tree-shake | `experimental.optimizePackageImports: ["framer-motion"]` (`next.config.ts:138`) | Removing the entry, or importing framer-motion into app routes (today it is only used on the marketing landing) |
| WebP/AVIF images | `images.formats: ["image/avif", "image/webp"]`, `qualities: [60, 70, 75]` (`next.config.ts:203-213`); default cigar art is 5 WebP files in `public/Cigar Default Images/` | Shipping raw PNGs, using `quality` values outside the allowlist (they silently snap), or bypassing `next/image` for remote photos |
| Lazy-loaded sheets/modals/scanners | `next/dynamic` with `ssr: false` in 13+ components (e.g. `components/humidor/HumidorClient.tsx`, `components/lounge/CategoryFeed.tsx`) | Converting a dynamic import back to a static import pulls the sheet into the route's initial chunk |
| Server caching layers | React `cache()` for per-request dedup (`lib/data/profile.ts:40` `getProfileLite`); `unstable_cache` for cross-request TTL (`lib/data/news.ts`, `lib/data/cigar-catalog.ts`, `lib/data/forum.ts`, `lib/data/flavor-tags.ts`) | Calling Supabase directly in a server component instead of the cached fetcher |
| Proxy JWKS auth (no per-request auth network call) | `proxy.ts` — local `jose` JWT verification; Supabase Auth is hit only on token expiry (~1/hour/user) | Reintroducing `auth.getUser()`/`getSession()` on the hot path, or calling them per-page in server components instead of `getServerUser()` |
| SW StaleWhileRevalidate navigations | `app/sw.ts:434-449` — cached HTML served instantly on cold launch, auth-partitioned | Switching navigations back to NetworkFirst (see rejected list), or removing `authPartitionPlugin` (user-A-HTML-to-user-B leak on shared devices) |
| Preconnect hints | `app/layout.tsx:164-167` — preconnect to Supabase origin, dns-prefetch i.ytimg.com | Removing them costs ~100-300 ms handshake on cold mobile |
| Static-asset cache headers | `next.config.ts` `headers()` — 30d immutable for `/icons`, `/field-guide`, `/Cigar%20Default%20Images`; `/sw.js` must stay `max-age=0, must-revalidate` | Long-caching `/sw.js` makes a broken SW near-impossible to fix in the field |
| Inline `<head>` critical CSS/scripts | `app/layout.tsx:181-220` — literal-hex dark background bridge, cold-smoke overlay rules, recovery scripts | Referencing `var(--background)` there (undefined until globals.css loads = white flash), or moving the scripts into React components (they must run pre-hydration) |
| SW precache hygiene | `serwist.config.mjs` — `precachePrerendered: false`, appstore images excluded | Adding explicit precache URLs or any auth-gated file under `public/` silently hangs SW install (fetches run cookieless, non-200 rejects install, push subscribe times out at 120s). CI job `sw-precache-check` gates this on main pushes |

## Known rejected approaches — do NOT re-propose

1. **NetworkFirst for SW navigation requests.** Tried; reverted (PR #525 revert). Root cause of the cold-launch white screen was auth on first paint: NetworkFirst always hit the network on cold launch, and a cold Vercel/Supabase path added seconds of TTFB before any HTML arrived. Current design: StaleWhileRevalidate with auth-partitioned cache keys (`app/sw.ts:405-449`). Note the inverse was ALSO once reverted: an earlier SWR attempt (PR #271) broke because stale cached HTML referenced deleted chunk URLs post-deploy; the stale-chunk-recovery head script (PR #288) made SWR safe to restore. Both failure modes are now handled — leave the strategy alone.
2. **Hash-pinned CSP in enforce mode.** PR #326 flipped CSP to enforce and broke production with "Connection closed": Next 16 streams RSC Flight payloads as per-request inline `<script>` tags that cannot be hash-pinned. Reverted (#332). Current state (`next.config.ts:66-97`): full policy in `Content-Security-Policy-Report-Only`; a minimal enforced header carries only `frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests`. A real enforce-mode CSP requires nonce-based `script-src` or `'strict-dynamic'` — a project, not a header flip.
3. **Per-device iOS splash matching via background-image.** Splash is one centered logo in the cold-smoke overlay; do not reintroduce per-device `apple-touch-startup-image` matching logic beyond the existing `iosSplash()` list in `app/layout.tsx` (the URLs must stay absolute to `www.ashember.vip` — iOS does not follow redirects for startup images).

## Other CI performance/PWA gates (`.github/workflows/ci.yml`)

- `typecheck` — `tsc --noEmit` on the main project AND `tsconfig.sw.json` (SW uses the WebWorker lib), plus `npm run check:pwa` (static check that startup-image/manifest URLs stay absolute).
- `unit-test` — `vitest run lib/` (covers `swr-persist`, `session-gate`, cache helpers, etc.).
- `pwa-smoke` (push to main) — curls splash PNG + manifest on both bare and www hosts, expects 200 (guards the bare-domain redirect exemptions in `next.config.ts`).
- `sw-precache-check` (push to main) — `scripts/check-sw-precache.mjs` fetches every URL in the deployed precache manifest cookieless and asserts 200.
- Lint is deliberately NOT a CI gate (63 pre-existing errors on main). New code should still be lint-clean.
- E2E (`tests/e2e/`, Playwright) is not a CI gate; the authenticated project self-skips without `TEST_USER_EMAIL`/`TEST_USER_PASSWORD`.

## RUM

Vercel Speed Insights mounted in `app/layout.tsx` (`<SpeedInsights />`) — real-user LCP/CLS/INP/FCP/TTFB in the Vercel dashboard. Reliability telemetry (SW + head-script events) flows to Sentry via `lib/telemetry/reliability.ts` + `components/system/ReliabilityBootstrap.tsx`.
