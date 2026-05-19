# Ash & Ember Society

## What This Is

A premium mobile-first web app for cigar enthusiasts. Combines a personal humidor manager (inventory, aging, burn logs against a 4,221-cigar catalog) with a community lounge (forum, burn reports, flavor tagging) and a shop directory with map. Built solo by Dave Black with Claude Code; targeted at the U.S. cigar-lover niche who currently track inventory in spreadsheets or apps that look like 2014 sports betting sites.

## Core Value

The humidor feels like a leather-bound dossier of your collection — not a generic inventory app. Premium "exclusive lounge" aesthetic (dark warm tones, Playfair serif headings, gold accents) sells the experience before any feature does.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- [x] Humidor management — add cigars from a 4,221-cigar catalog, track quantity, purchase date, price, aging, notes
- [x] Burn report — multi-step rating form (draw/burn/construction/flavor/overall) + pairing + duration; submitted reports surface in the lounge feed
- [x] Cigar catalog with search, grid/list view, default wrapper-keyed images, user-uploadable photos
- [x] Discover cigars / cigar news / vendors hub
- [x] Lounge — community feed with category rooms, posts with images, like/comment threading, burn-report preview cards
- [x] Account — Profile / Membership / Legal tabs; QR-coded digital membership card
- [x] Onboarding flow with email OTP verification, Google sign-in, single-page form
- [x] Stripe subscription tiers (Free / Member $4.99/mo or $50/yr / Premium $9.99/mo or $100/yr) with webhook idempotency
- [x] PWA shell — installable, offline page, service worker with per-resource strategy, stale-chunk + hydration watchdogs, auth timeout safety net
- [x] Performance — six-phase plan shipped: Suspense islands, Serwist SW, SWR foundation, bundle analyzer, image compression, Speed Insights RUM
- [x] Observability — Sentry instrumented across Node/Edge/client; CSP violation listener; structured logger (`lib/log.ts`)
- [x] CI — `.github/workflows/ci.yml` with typecheck gates (main + service worker)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Hide bottom nav on `/onboarding` — leaking from `(app)` layout group
- [ ] Verify "Start Exploring" CTA hang at end of onboarding (post-rename from "Get started")
- [ ] Re-audit ~19 new `createServiceClient()` call sites added since 2026-05-06 (count grew from 11 to ~30)
- [ ] CSP enforcement — currently Report-Only. Real fix requires nonce-based `script-src` per Next 16 RSC Flight payload requirements
- [ ] SW navigation strategy upgrade — `NetworkFirst` → `StaleWhileRevalidate` for instant repeat loads (auth-partition plugin already in place)
- [ ] SWR migration: `LoungeForumClient.tsx` (last remaining client still on `useState`+`useEffect` fetch)
- [ ] Outbox + IDB BackgroundSync: extend the burn-report submit infra to lounge-post create and humidor-add (currently fail silently offline)
- [ ] Multipart in outbox — photo uploads currently can't queue offline (needs IDB Blob storage + replay)
- [ ] Bundle / lint / Lighthouse gates in CI (typecheck-only today; baselines exist via `BUNDLE_BASELINE.md`)
- [ ] Lint debt cleanup — 63 pre-existing `no-explicit-any` errors keeping lint out of CI
- [ ] Modal a11y — focus trap (Tab cycling), button-styled backdrops (Escape-key hook from #328 scaffolded)
- [ ] Live axe-core / Lighthouse contrast sweep on real pages (tokens clean as of #329)
- [ ] Vision OCR for cigar bands → migrate from Google Vision TEXT_DETECTION to a VLM (Claude Haiku 4.5 or Gemini Flash via Vercel AI Gateway). Keep Google Vision SAFE_SEARCH_DETECTION for moderation
- [ ] `forum_posts` schema drift — dump current schema, diff against migrations, codify gaps
- [ ] Staging environment — separate Supabase project + Vercel preview env for safe testing
- [ ] CMS / admin UI for blog_posts (currently raw SQL inserts)
- [ ] Landing page + SEO

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Native iOS/Android apps — PWA strategy is intentional. App stores add friction and gatekeeping that the audience doesn't need.
- 50-person team workflow — solo dev, no sprint ceremonies, no story points, no Jira. GSD is the single planning surface.
- Generic dark mode — the design system is "exclusive lounge", not a tech UI. Don't refactor toward standard shadcn defaults or sterile dark palettes.
- Em dashes in user-facing copy — explicitly banned in UI strings, marketing, blog/news synopses, push notifications, emails. Plain alternatives only.
- Replay sessions (Sentry) — ~80KB gzipped cost not justified vs. server-side error traces + manual repro
- D.4 On This Day, D.7 Shop Spotlight, D.8 Member Milestones — dashboard sections deferred indefinitely; not enough content yet

## Context

**Technical environment:**

- Next.js App Router (16+), Vercel deploy, Supabase (auth + Postgres + Storage with RLS), Stripe subscriptions, Google Maps API.
- Auth flow: `proxy.ts` validates `auth.getUser()` with a 3s timeout and forwards verified user via `x-ae-*` headers; pages read via `getServerUser()` from `lib/auth/server-user.ts`. Eliminates per-page round-trips.
- PWA: Serwist service worker, three layered resilience mechanisms (stale-chunk recovery, hydration watchdog, auth-timeout race). Each addresses a distinct hang failure mode; each is a watchdog, not a fix — root cause of indefinite hangs has not been identified.
- 4,221 cigars seeded from a curated JSON. Default wrapper images are 5 WebP files served client-side via `lib/cigar-default-image.ts`. User-uploaded photos take priority when set.

**Prior work that informs implementation:**

- Six-phase performance plan completed (May 2026): #258-265 — image compression, framer-motion tree-shake, SWR foundation, Serwist SW, Suspense islands, Speed Insights RUM.
- Maintenance plan: Phases 0-2 + 5 shipped; Phase 3 mostly done except CSP enforce (reverted by #332 — needs nonce-based fix); Phase 4 investigated and skipped (PostgREST nested aggregation is not N+1 as audit assumed); Phase 6 ongoing.
- Outbox infra for offline mutations — burn-report submit lands first; pattern in `lib/offline-outbox.ts`. Lounge-post + humidor-add still need wiring.

**How the team works:**

- Solo dev (Dave) + Claude Code as the primary code-writer + Cowork sessions for orchestration.
- Branch-per-unit-of-work; never amend/force-push merged PRs; always fresh branch off origin/main.
- `.planning/codebase/*.md` is verified ground truth (regenerated via `/gsd-map-codebase`). Memory at `~/.claude/projects/-Users-dave-black-Documents-the-humidor/memory/` is point-in-time; reconciled against codebase docs via `/memory-reconcile`.

## Constraints

- **Tech stack**: Next.js App Router + Supabase + Stripe + Tailwind. Stack is fixed; don't propose React Native, alternative ORMs, or third-party auth providers without explicit ADR.
- **Performance**: LCP / CLS / INP / FCP / TTFB visible in Vercel Speed Insights. PWA load time is paramount — every change weighs bundle, LCP, INP, SW cost. Six perf phases must not regress.
- **Mobile-first**: 44px minimum touch targets, safe-area-inset-bottom aware, 16px input font-size (prevents iOS auto-zoom). Toasts render above bottom nav.
- **Design system locked**: Tokens in `globals.css` + `tailwind.config.ts` are not redefinable. No new font families — map handoff fonts onto existing `--font-serif` / `--font-mono`.
- **Em-dash rule (user-facing copy only)**: UI strings, marketing, blog/news, push. Code, internal docs, memory, commit messages exempt.
- **PR workflow**: One concern per PR. Never bundle "while I'm in there" cleanups. Atomic commits.
- **Security**: All `createServiceClient()` call sites require auth (and where applicable admin) gate BEFORE construction. Storage paths must scope to authenticated `user.id`, never user-supplied input.
- **Solo dev budget**: Free tiers where possible. Sentry free, no Replay. Upstash free for rate limits. Quality wins justify Opus model spend; ceremony does not.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| PWA over native iOS/Android | Audience doesn't need app store; PWA install + push notifications cover the gap | ✓ Good |
| Single Supabase project (no staging) | Solo dev, low traffic; preview deploys talk to prod DB | ⚠️ Revisit when first destructive migration is needed |
| Sentry without Replay | ~80KB gzipped cost not justified | ✓ Good |
| CSP Report-Only (not enforced) | Next 16 RSC Flight payloads break under hash-pinned `script-src`; PR #326 attempt → "Connection closed" errors → reverted by #332 | ⚠️ Revisit with nonce-based CSP per Next 16 guide |
| `unstable_cache` over `"use cache"` | Migration to Next 16 Cache Components is whole-app flag, not file-by-file | — Pending (Phase 6 background work) |
| Watchdog scripts for hang recovery | Root cause unknown; reactive recovery is acceptable lesser-evil | ⚠️ Revisit when a hang is reproduced with diagnostic mark fired |
| Google Vision SAFE_SEARCH + TEXT_DETECTION (current) | Cheaper than VLM at indie scale; TEXT_DETECTION mediocre on cigar bands | ⚠️ Migrate band-scanner OCR to VLM (Haiku 4.5 / Gemini Flash) |
| GSD as planning surface | Solo dev, no sprint tooling; need lightweight phase structure with verification gates | — Just bootstrapped 2026-05-19 |

---
*Last updated: 2026-05-19 after GSD bootstrap (PROJECT.md synthesized from PROJECT_STATE.md)*
