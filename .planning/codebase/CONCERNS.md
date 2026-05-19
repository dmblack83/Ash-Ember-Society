# Codebase Concerns

**Analysis Date:** 2026-05-18

## Tech Debt

**CSP enforcement gap (Next 16 RSC):**
- Issue: Content-Security-Policy is shipped in Report-Only mode, not enforced. `next.config.ts` line 74 sets `Content-Security-Policy-Report-Only`. The header constant near line 48 is fully built (`script-src 'self' <3 hashes>`, `frame-src` for Stripe + Google, etc.) but enforcement is deferred.
- Files: `next.config.ts` (lines 48-90), `instrumentation-client.ts` (lines 54-82 — `securitypolicyviolation` listener reports violations to Sentry).
- Impact: XSS protection is "observed" only — the policy logs violations but does not block any script. PR #326 attempted enforcement; #332 reverted after Next 16 RSC Flight payloads (per-request inline scripts) broke under hash-pinned `script-src 'self' <hashes>` with "Connection closed" stream errors.
- Fix approach: nonce-based `script-src` per Next 16's nonce CSP guide. Requires generating a per-request nonce in `proxy.ts` and forwarding it to `app/layout.tsx` so every server-rendered Flight script tag carries `nonce=...`. Memo `project_csp_nonce_required.md` is the authoritative reference.

**SW navigation strategy — NetworkFirst, cookie-aware key in place:**
- Issue: Service worker still uses `NetworkFirst` for navigation requests (`app/sw.ts` line 345). The plan-of-record next step (PROJECT_STATE.md "Pending / Next Steps" item 2) is `StaleWhileRevalidate` for instant repeat loads.
- Files: `app/sw.ts` (lines 165-181 `authPartitionPlugin`, line 343-357 nav route).
- Impact: Cold navigation still pays a network round-trip on repeat visits despite the SW being installed. The auth-cookie partition plugin (`extractSubClaim`, `authHashForRequest`) is already implemented and tested — the prerequisite for safely caching navigation HTML on a shared device is in place; only the strategy swap is pending.
- Note: comment at `app/sw.ts` lines 319-342 explains the historical reason for NetworkFirst (SWR returned cached HTML embedding stale chunk URLs that 404'd post-deploy). With #288 stale-chunk recovery + #289 watchdog now in place, the SWR risk is mitigated by reactive recovery; a planned SWR rollout is reasonable, but needs deliberate sequencing.
- Fix approach: swap `NetworkFirst` for `StaleWhileRevalidate` on the navigation route, keep `authPartitionPlugin`. Plan as its own scoped PR with deploy-time chunk-URL invalidation, not a one-line flip.

**SWR per-feature migrations — mostly done, LoungeForumClient open:**
- Issue: Phase 3 (SWR foundation in #264) called out per-feature migrations for HumidorClient, WishlistClient, CategoryFeed, FeedbackCard, PostDetailClient, DiscoverCigarsClient, LoungeForumClient.
- Files: SWR confirmed wired in `components/humidor/HumidorClient.tsx`, `components/humidor/WishlistClient.tsx`, `components/lounge/CategoryFeed.tsx`, `components/lounge/FeedbackCard.tsx`, `components/cigars/DiscoverCigarsClient.tsx`. NOT yet wired: `components/lounge/LoungeForumClient.tsx` (still on `useState` + `useEffect` data fetching at lines 72-94).
- Impact: One remaining client component fetches via local state instead of the deduped/revalidating SWR cache. Modest perf cost (no cache hits across navigations into the lounge home), no correctness issue.
- Fix approach: convert `LoungeForumClient.tsx` to `useSWR` against a key defined in `lib/data/keys.ts`, fetcher in `lib/data/lounge-fetchers.ts` (the file already exports `fetchCategoryFeedPage` — add a sibling for the lounge index).

**Onboarding routes share `(app)` layout — bottom nav visible on `/onboarding`:**
- Issue: `app/(app)/onboarding/page.tsx` lives inside the `(app)` route group, which means `app/(app)/layout.tsx` (the layout that renders `<BottomNav />` and `<SideRailNav />`) wraps it.
- Files: `app/(app)/onboarding/page.tsx`, `app/(app)/layout.tsx` (BottomNav at line 76-143, SideRailNav at line 160-226). Note: `/login` and `/signup` live under `(auth)` and DO NOT show the nav (the `(auth)` layout in `app/(auth)/layout.tsx` is a centered card wrapper only).
- Impact: New users mid-onboarding see Humidor / Lounge / Home / Discover / Account chrome before they've completed the gate, conflicting with the brand intent of a clean first-run flow. (Also matches the pending signup-flow polish item from MEMORY.md.)
- Fix approach: either move `onboarding/page.tsx` out of `(app)` into its own route group with a minimal layout, OR conditionally hide the nav in `(app)/layout.tsx` when `usePathname()` starts with `/onboarding`.

**Blog content managed via raw SQL inserts:**
- Issue: No CMS / admin UI for `blog_posts`. PROJECT_STATE.md "Known Issues / Decisions" formalizes the template ("INSERT INTO blog_posts...") and explicitly defers CMS to a future phase.
- Files: `app/(app)/discover/cigar-news/page.tsx` (reader), no editor surface.
- Impact: Every post requires Supabase SQL editor access. High friction, no draft state, no preview, no scheduled publish.
- Fix approach: scoped admin route gated to a single admin user, leveraging the existing `app/api/admin/submissions/` pattern.

## Known Bugs

**No open bugs verified during this audit.**
- The Memory item "Get started CTA on last onboarding step hangs, refresh creates account" references a CTA labeled "Get started", but `components/onboarding/OnboardingForm.tsx` line 455 now reads `"Start Exploring"`. Either the bug was fixed and the CTA renamed, or the memory predates the rename. Status: needs Dave to confirm whether the hang still reproduces with the renamed button.

## Security Considerations

**CRON_SECRET — implemented, verify Vercel env has it set:**
- Status: ✅ Code path is correct. `app/api/cron/aging-ready/route.ts` lines 55-74 and `app/api/cron/push-retry/route.ts` lines 49-66 require either `Authorization: Bearer ${CRON_SECRET}` or `x-sync-secret: ${SYNC_SECRET}` in production. The dev-only `vercel-cron/` UA fallback (`process.env.NODE_ENV !== "production"` guarded) does NOT fire in prod.
- Files: `app/api/cron/aging-ready/route.ts`, `app/api/cron/push-retry/route.ts`, `app/api/news/sync/route.ts`, `app/api/youtube/sync/route.ts`, `proxy.ts` (line 18: `/api/cron` allowlisted from auth gate, header-protected instead).
- Risk: residual — verify `CRON_SECRET` is actually set in Vercel Production env. The memory item `project_maintenance_plan.md` flagged this as "⚠️ urgent" historically; code is fixed but a missing prod env var would still let any caller hit `/api/cron/*` with no auth (`cronSecret && auth === ...` returns false → falls through to 401, so empty env var fails closed, not open — good).
- Recommendation: confirm `CRON_SECRET` value in Vercel dashboard.

**CSP enforcement gap — see Tech Debt above:**
- Risk: XSS in any user-rendered content (lounge posts, profile fields, blog markdown) currently has no runtime CSP block. Mitigations in place: React's default HTML escaping, no `dangerouslySetInnerHTML` audit needed (`grep` returned no hits in tree). Sentry receives all violation reports via the client-side `securitypolicyviolation` listener.
- Files: `next.config.ts` line 74.
- Fix approach: nonce-based CSP (see Tech Debt).

**Vision API denial-of-wallet — protected:**
- Status: ✅ Rate limit enforced. `app/api/vision/analyze/route.ts` lines 100-130 calls `checkRateLimit(user.id, { limit: 30, window: "1 h", prefix: "vision-analyze" })` before any Vision API call. Returns 429 with `Retry-After` headers on overage. 503 if Upstash itself is down (`rate_limit_unavailable` reason).
- Files: `app/api/vision/analyze/route.ts`, `lib/rate-limit.ts`.
- Risk: residual — Upstash quota / availability. Acceptable tradeoff for the cost protection.

**Supabase RLS coverage — broad but uneven:**
- Status: RLS enabled on `shop_checkins`, `cigar_catalog_suggestions`, `burn_reports`, `forum_posts` (`forum_posts_cascade_on_user_delete.sql` migration confirms it as an RLS-enabled table). 30 call sites use `createServiceClient()` (service-role bypass) across `app/` and `lib/`.
- Files: 45 migrations under `supabase/migrations/`; `lib/data/lounge-fetchers.ts` line 82 references RLS on `forum_posts`.
- Risk: each `createServiceClient()` call site needs its own auth check before the bypass. Memory item `project_service_client_audit_2026-05-06.md` records that ALL 11 service-role call sites audited 2026-05-06 were clean. Count is now 30 (per grep); re-audit any added since 2026-05-06.
- Recommendation: re-run the audit method documented in the memory file when next adding a service-role call site.

## Performance Bottlenecks

**No CI performance budget:**
- Problem: `npm run analyze` (Phase 4 / #259) produces bundle reports but they aren't gated on PR. Vercel Speed Insights (#265) captures RUM but there's no automated alert on regression.
- Files: `package.json` line 14 (`"analyze": "next experimental-analyze --output"`), `.github/workflows/ci.yml` (typecheck only — no bundle / Lighthouse step).
- Cause: PROJECT_STATE.md "Pending / Next Steps" item 3 — decision deferred between GH Actions, Vercel Build hook, and pre-commit. CI infra now exists (`.github/workflows/ci.yml` was added) so the blocking reason from PROJECT_STATE.md is partially resolved.
- Improvement path: add a `bundle-size` job to `ci.yml` running `npm run analyze` and diffing against a baseline file (`BUNDLE_BASELINE.md` already exists in repo root and looks ready for that purpose).

**LoungeForumClient still uses local-state fetching — see Tech Debt.**

## Fragile Areas

**PWA resilience layer (chunk recovery + hydration watchdog + auth timeout):**
- Files: `components/system/stale-chunk-recovery.ts` (PR #288), `components/system/hydration-watchdog.ts` (#289), `proxy.ts` lines 97-118 (3s `getUser()` timeout race, #290).
- Why fragile: each watchdog catches a *symptom* of an indefinite-hang failure that has NOT been root-caused. The chunk-recovery script (`stale-chunk-recovery.ts`) nukes caches + unregisters SW + reloads when a `/_next/static/*` chunk 404s; the hydration watchdog (`hydration-watchdog.ts`) force-reloads after 15s if `window.__AE_HYDRATED` isn't set; the auth-timeout falls through to anonymous after 3s. All three are diagnostic backstops, not fixes. Rate-limited (2 chunk-bust reloads/session, 1 watchdog reload/session) so a degenerate state degrades to a broken page rather than an infinite loop — chosen as the lesser evil per #288 comments.
- Diagnosis pattern (from PROJECT_STATE.md "PWA resilience layer"): when a hang IS reported, check `performance.mark()` traces (`ae:chunk-load-error`, `ae:watchdog-fired`, `ae:hydrated`) or Vercel logs for `[proxy] supabase.auth.getUser() exceeded 3000ms`. Whichever mark fires identifies which path triggered. If none fire → narrows to a fourth, currently-unknown root cause.
- Safe modification: do NOT remove any of these without first deploying a marker so a future hang report can be diagnosed. Watchdogs MASK root causes by definition; that's the explicit tradeoff.
- Engineering principles flag: per CLAUDE.md "Anti-patterns" — "Masking a broken function with a timeout / retry / fallback instead of fixing the function." These three are the textbook case. They were the right call at the time (production was hanging with no signal) but they're tech debt by definition.

**Cigar default images — client-side fallback only:**
- Files: `lib/cigar-default-image.ts`, applied at 6 sites listed in PROJECT_STATE.md.
- Why fragile: `image_url` stays null for any cigar without a real photo; client-side wrapper-string matching picks one of 5 WebP files. A new wrapper shade not in the lookup falls back to a default. `scripts/seed-cigar-default-images.ts` is the DO-NOT-RUN script that would corrupt this scheme (see Code Hygiene).
- Safe modification: extend the wrapper map in `lib/cigar-default-image.ts` before adding new wrapper values to `cigar_catalog`.

**SW precachePrerendered: false workaround:**
- Files: `serwist.config.mjs` lines 23-46.
- Why fragile: disabling prerendered precaching was the workaround for `proxy.ts` 307-redirecting Serwist's anonymous precache fetches on auth-gated routes (broke SW install → hung push notifications). Cost: `/login`, `/signup`, `/privacy`, `/terms`, `/offline` aren't precached. Real fix would teach Serwist to skip auth-gated routes during precache, or teach `proxy.ts` to pass through Serwist's user-agent.
- Safe modification: any new public route Dave wants in offline first-visit cache needs to either be excluded from `proxy.ts` PUBLIC_PATHS-style allowlist OR Serwist needs a custom plugin to detect them.

## Scaling Limits

**Forum count denormalization not yet needed:**
- Status: ✅ Memory file `project_phase4_denormalization_skipped_2026-05-06.md` records that the original audit premise was wrong — PostgREST nested aggregation (`forum_posts(..., forum_post_likes(count), forum_comments(count))` in `lib/data/lounge-fetchers.ts` line 75) is a SINGLE query, not N+1. No work needed.
- Risk threshold: re-evaluate if lounge category pages exceed ~50 posts per page (currently scrolling pagination, page size unclear without re-checking) and aggregation latency shows in Sentry traces.

## Data Model Drift

**forum_posts schema drift (surfaced by service-client audit):**
- Issue: Memory `project_phase4_denormalization_skipped_2026-05-06.md` flagged "forum_posts schema migration drift as a separate item" during the audit.
- Files: 8 references to `forum_posts` across `app/(app)/lounge/page.tsx`, `app/(app)/lounge/rooms/[slug]/page.tsx`, `app/(app)/lounge/[postId]/page.tsx`, `lib/data/lounge-fetchers.ts`. The only migration in `supabase/migrations/` that targets `forum_posts` after creation is `20260502_forum_posts_cascade_on_user_delete.sql`. The `community_feed` migration (`20260409_community_feed.sql`) is the likely original schema.
- Impact: not verified — what specifically is drifting between the migration files and the code's expected shape needs the original audit context. Likely candidate: columns referenced in queries (e.g. `is_locked`, `is_system`, `smoke_log_id`, `image_url`, `is_pinned` at `lib/data/lounge-fetchers.ts` lines 73-79) that may have been added by ad-hoc SQL outside the `migrations/` directory.
- Fix approach: dump current `forum_posts` schema from Supabase, diff against the union of all migrations that touch it, codify any missing changes as a new migration file.

## Operational

**CI exists but typecheck-only:**
- Status: ✅ `.github/workflows/ci.yml` is in place — contradicts PROJECT_STATE.md "Pending / Next Steps" item 3 ("no `.github/workflows` exists today"). PROJECT_STATE.md is stale on this point.
- File: `.github/workflows/ci.yml` runs `npx tsc --noEmit` (main project) + `npx tsc --project tsconfig.sw.json --noEmit` (service worker) on every PR.
- NOT in CI: `npm run lint` (deferred — 63 pre-existing `no-explicit-any` errors on main per the workflow's own comment), production `next build` (Vercel preview deploys cover it), E2E run (only 5 smoke tests + 5 skipped stubs), bundle / perf budget.
- Improvement path: drive lint debt down in dedicated cleanup PRs, then add `npm run lint` as a hard gate; add the bundle-budget job described under Performance.

**No staging environment:**
- Status: PROJECT_STATE.md "Pending / Next Steps" item 7 — single Supabase project + Vercel production. Preview deploys talk to the same Supabase as prod.
- Risk: a destructive migration or seed script run against production cannot be tested without a separate DB. The `seed-cigar-default-images.ts` "DO NOT RUN" warning is a direct consequence of this constraint.
- Fix approach: spin up a separate Supabase project for staging; add a `STAGING` Vercel env that points at it.

## Content / UX

**Bottom nav on `/onboarding` — see Tech Debt.**

**Onboarding CTA potentially renamed away from "Get started":**
- Memory item references "Get started" CTA hang. Current button reads "Start Exploring" (`components/onboarding/OnboardingForm.tsx` line 455). Need Dave to confirm: is the hang fixed, or did just the label change?

## Code Hygiene

**TODO/FIXME audit — clean except for test stubs:**
- Source tree (`app/`, `lib/`, `components/`, `utils/`, `proxy.ts`, `next.config.ts`, `scripts/`): zero TODO / FIXME / HACK / XXX comments. Codebase is unusually clean by this measure.
- Only TODOs: `tests/e2e/authenticated.spec.ts` lines 32, 37, 43, 49, 55 — five Playwright auth-fixture test stubs intentionally left as `TODO` (see Test Coverage Gaps below).

**`scripts/seed-cigar-default-images.ts` — DO NOT RUN script lives in repo:**
- File: `scripts/seed-cigar-default-images.ts`.
- Risk: PROJECT_STATE.md "Scripts" section explicitly warns "DO NOT RUN — writes SVG paths to image_url; those files don't exist. Default images are handled client-side by `lib/cigar-default-image.ts`. Running this script breaks all default images."
- Current safeguard: warning lives in PROJECT_STATE.md only. The script file's own header comment (`Updates image_url on every cigar_catalog row where image_url is null, using the wrapper field to pick a default SVG illustration`) reads as if it's the right thing to do.
- Fix approach: either delete the file, or replace its body with a `console.error("This script is deprecated — see PROJECT_STATE.md") + process.exit(1)` so a misclick can't corrupt the catalog.

**`: any` usage — 9 sites in src tree:**
- Files: 9 explicit `: any` annotations in `app/`, `lib/`, `components/` (excluding `eslint-disable` lines). Below the 63-error main-branch baseline noted in `.github/workflows/ci.yml`, but worth flagging the trajectory.
- Improvement path: lint cleanup PRs (per the CI workflow's plan) to drive the count down before enabling lint as a CI gate.

## Test Coverage Gaps

**Five Playwright smoke tests + five skipped stubs is the entire test suite:**
- Files: `tests/e2e/smoke.spec.ts` (5 tests: marketing landing, /login, /humidor → /login redirect, /offline, /manifest.webmanifest), `tests/e2e/authenticated.spec.ts` (5 stubs all `test.skip`).
- Zero unit tests, zero integration tests. No `*.test.ts` outside `tests/e2e/`.
- Risk: every critical authenticated path (humidor add, lounge post, burn report submit, avatar upload) ships without automated coverage. Manual click-through is the only validation.
- Priority: High — Phase 1 of the maintenance plan in MEMORY (`project_maintenance_plan.md`) calls out test infra. The stubs in `authenticated.spec.ts` lines 30-58 document the intended coverage; unblocking them needs a Supabase test user + Playwright `storageState` fixture.
- Fix approach (already documented in `tests/e2e/authenticated.spec.ts` lines 14-25): provision `TEST_USER_EMAIL` + `TEST_USER_PASSWORD`, add Playwright setup project that signs in once and caches cookies, mark the stubs with `test.use({ storageState: ... })`, fill in the bodies.

**`npm run lint` is not run in CI:**
- File: `.github/workflows/ci.yml` lines 7-14 explicitly skip lint (63 pre-existing errors on main).
- Risk: new code can land with new `no-explicit-any` violations as long as typecheck passes.
- Fix: dedicated cleanup PRs, then add lint as a CI gate.

## Observability

**Sentry — instrumented across runtimes, structured logger barely adopted:**
- Status: ✅ Full Sentry coverage. `instrumentation.ts` wires Node + Edge configs; `instrumentation-client.ts` wires the client + `securitypolicyviolation` listener (lines 54-82) + router-transition tracing (line 88).
- Files: `sentry.server.config.ts` (Node, `includeLocalVariables: true`, `enableLogs: true`, `tracesSampleRate: 0.1` in prod), `sentry.edge.config.ts` (Edge, no local vars per runtime limit), `instrumentation-client.ts` (client, `sendDefaultPii: true`, no Replay/Feedback per cost tradeoff at line 8-13), `next.config.ts` lines 273-291 (`withSentryConfig`: source map upload + `tunnelRoute: "/monitoring"` to bypass ad blockers).
- Coverage gap 1: **Structured logger barely adopted.** `lib/log.ts` exists and wraps `Sentry.logger.*` + `Sentry.captureException`. Only 1 import across `app/` and `lib/`. Most of the codebase still uses `console.error` / `console.warn` (25 occurrences in `app/`). These DO get captured by Sentry's `enableLogs: true` automatically — but they bypass the scope tags that make logs queryable in the dashboard.
- Coverage gap 2: **Sentry Replay is intentionally off** (`instrumentation-client.ts` line 8-13) — ~80KB gzipped tradeoff. Reasonable default; will need to be on when triaging a tricky UX bug.
- Coverage gap 3: **`tunnelRoute: "/monitoring"`** routes Sentry events through our origin — verify Vercel function execution counts vs Sentry event volume. If we ever hit Vercel's function quota during a Sentry storm, this is the first place to look.
- Improvement path: gradually port `console.error` call sites to `lib/log.ts`'s `logEvent` (or whatever the wrapper exports) to gain scope-tagged queryability without changing what gets captured.

---

*Concerns audit: 2026-05-18*
