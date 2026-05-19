# Requirements — Ash & Ember Society (Next Milestone)

**Milestone:** Platform Hardening + P1 Product Wins
**Created:** 2026-05-19
**Source:** Derived from PROJECT.md Active list + research/SUMMARY.md (table stakes only; differentiators deferred to v2)

## ADR Decisions (locked at milestone start)

| ADR | Decision | Rationale |
|---|---|---|
| **ADR-1: CSP path** | **B — SRI** (`experimental.sri.algorithm: 'sha256'`) | Preserves PPR / Cache Components compatibility. Cost: experimental flag + move 3 inline scripts (cold-smoke init, hydration mark, stale-chunk recovery) behind `next/script`. |
| **ADR-2: Cache Components** | Conditional on ADR-1 → since ADR-1 = B, include in milestone | Whole-app PR; audit every `runtime = "edge"` first; revert plan on the table. |
| **ADR-3: VLM model** | Ship `model` query param + A/B Haiku 4.5 vs Gemini 2.5 Flash for ~1 week, commit after | De-risks model choice; both reachable via Vercel AI Gateway. |
| **ADR-4: P1 product items** | Bundle into a single small phase, sequenced after auth fixture but before heavy infra | Ships product value while infra queues; phase stays scoped. |

---

## v1 Requirements (this milestone)

### Test Infrastructure & Staging (INFRA)

- [ ] **INFRA-01**: Developer can run a Playwright authenticated-test fixture that signs in once and caches `storageState` for use across `tests/e2e/authenticated.spec.ts` stubs.
- [ ] **INFRA-02**: Developer can deploy to a staging environment (separate Supabase project + Vercel preview env) that mirrors production schema and is safe for destructive testing.

### Security & Service-Role Hygiene (SEC)

- [ ] **SEC-01**: Developer can construct a service-role Supabase client only via `createServiceClientFor(callerId, reason)` wrapper that logs the caller for audit; direct import of `createServiceClient` is deprecated.
- [ ] **SEC-02**: All ~30 existing `createServiceClient()` call sites are migrated to the wrapper with caller IDs; re-audit by `grep` confirms no direct usage remains.
- [ ] **SEC-03**: CSP is enforced in production via SRI (subresource integrity hashes) per `experimental.sri.algorithm: 'sha256'`; three inline scripts in `app/layout.tsx` (cold-smoke init, hydration mark, stale-chunk recovery) are moved behind `next/script` with auto-hash. Report-Only mode retired.

### Service Worker & PWA Resilience (PWA)

- [ ] **PWA-01**: Service worker uses `StaleWhileRevalidate` for navigation requests with existing `authPartitionPlugin` cookie-aware cache keys; `caches.delete("navigations")` fires on `SW_UPDATED`; `maxAgeSeconds` capped at 3600.
- [ ] **PWA-02**: User can submit a lounge post offline; the request queues in IndexedDB via Serwist `BackgroundSyncQueue` and replays on reconnect, scoped to the original `user.id`.
- [ ] **PWA-03**: User can add a cigar to humidor offline; same queue + replay + user-scoping pattern as PWA-02.
- [ ] **PWA-04**: User can upload a photo (avatar, burn-report image, lounge-post image) offline; the multipart request stores File Blobs in IDB via `idb@8.0.3` and replays on reconnect.
- [ ] **PWA-05**: Outbox queues are invalidated on sign-out (per-user partition) so a different user signing in on the same device never replays the prior user's mutations.

### Diagnostics (DIAG)

- [ ] **DIAG-01**: Developer can identify which hang failure mode fired in a production incident by reading `performance.mark()` entries (`ae:chunk-load-error`, `ae:watchdog-fired`, `ae:hydrated`, plus new marks at every plausible hang boundary) sent as a Sentry transaction on watchdog fire.
- [ ] **DIAG-02**: No fourth watchdog is added; new instrumentation makes the next hang report self-describing instead.

### Caching Migration (CACHE)

- [ ] **CACHE-01**: All `unstable_cache` call sites (`app/(app)/discover/partners/actions.ts`, `app/(app)/home/_islands.tsx`, `lib/data/cigar-catalog.ts`, `lib/data/flavor-tags.ts`, `lib/data/forum.ts`, `lib/data/news.ts`, `lib/data/profile.ts`, `utils/supabase/anon.ts`) are migrated to `"use cache"` + `cacheLife` + `cacheTag`.
- [ ] **CACHE-02**: `revalidateTag(...)` call sites in mutation paths are swapped to `updateTag(...)`.
- [ ] **CACHE-03**: `cacheComponents: true` flag is enabled in `next.config.ts` after every `runtime = "edge"` route is audited and either marked `runtime = "nodejs"` or excluded; revert plan on the table.

### AI / Vision Migration (AI)

- [ ] **AI-01**: Developer can rate-limit `/api/vision/analyze` with two buckets: per-user call count (existing 30/hour) AND per-user token count (new). Upstash backing.
- [ ] **AI-02**: `/api/vision/analyze` enforces a pre-VLM image size cap (1024×1024, ≤2 MB) and a Vercel AI Gateway daily cost ceiling.
- [ ] **AI-03**: Cigar-band OCR is served via Vercel AI Gateway with a `model` query param toggling between `anthropic/claude-haiku-4-5` and `google/gemini-2.5-flash`; returns structured output `{brand, series, vitola, confidence}` via Zod schema.
- [ ] **AI-04**: Google Vision `SAFE_SEARCH_DETECTION` remains the moderation path (unchanged); only `TEXT_DETECTION` is replaced by VLM. Route is split into `lib/vision-ocr.ts` (VLM) and the existing safety path (Vision).
- [ ] **AI-05**: After ~1 week of A/B data, developer commits to a single model based on quality + cost results.

### Schema Codification (DATA)

- [ ] **DATA-01**: Current `forum_posts` schema is dumped via `supabase db pull`, diffed against the union of all migration files, and any gaps are codified into a new idempotent migration (`IF NOT EXISTS` / `IF NOT TRUE`) dry-run on staging before production.

### CI Gates (CI)

- [ ] **CI-01**: All ~63 `no-explicit-any` lint errors in `app/`, `lib/`, `components/`, `utils/`, `scripts/` are resolved in dedicated cleanup PRs (4-8 PRs of 5-10 fixes each).
- [ ] **CI-02**: `npm run lint` is enabled as a hard CI gate in `.github/workflows/ci.yml` after CI-01.
- [ ] **CI-03**: `size-limit@^12.1.0` with `@size-limit/preset-app` is wired into a CI job that diffs against an initial-permissive `BUNDLE_BASELINE.md`; runs as advisory for 2 weeks, then enforced.
- [ ] **CI-04**: `treosh/lighthouse-ci-action@v12` runs against Vercel preview deploys per PR via `patrickedqvist/wait-for-vercel-preview@v1`; advisory-only at first.

### Accessibility (A11Y)

- [ ] **A11Y-01**: Modal components have a focus trap (Tab cycling within open modal); backdrops are button-styled with accessible labels. Extends the Escape-key hook from PR #328.
- [ ] **A11Y-02**: Live axe-core / Lighthouse contrast sweep on authenticated pages surfaces and resolves any focus-ring, icon-on-icon, or translucent-overlay contrast violations.

### P1 Product Wins (PROD)

- [ ] **PROD-01**: User can search their own burn reports by review text via Postgres full-text search on `smoke_logs.review_text`.
- [ ] **PROD-02**: User can see prior pairing drinks (`pairing_drink`) on a cigar's detail page surfaced as "you paired this with X, Y, Z" prompts.
- [ ] **PROD-03**: User receives a push notification when one of their humidor items reaches its aging-ready preset (verifies existing cron fan-out path).
- [ ] **PROD-04**: User can sort and filter lounge category rooms by most recent activity / most likes / unanswered.
- [ ] **PROD-05**: User can export their humidor inventory as CSV (cigars + quantity + purchase date + price + aging start + notes).

### Onboarding Polish (ONB)

- [ ] **ONB-01**: Bottom nav (`BottomNav`, `SideRailNav`) is hidden on `/onboarding` either by moving `onboarding/page.tsx` out of `(app)` or by conditionally hiding in `(app)/layout.tsx` based on `usePathname()`.
- [ ] **ONB-02**: The "Start Exploring" CTA on the final onboarding step completes the mutation and navigates to `/home` without requiring a manual refresh. (Verify reproduction first; bug report may pre-date "Get started" → "Start Exploring" rename.)

---

## v2 Requirements (next milestone — DEFERRED)

### Social Foundation

- v2-PROFILE-01: User can view their own and other users' public profile (display name, city, member tier, burn-report count).
- v2-FOLLOW-01: User can follow / unfollow other users; "Following" feed in the lounge.
- v2-CHECKIN-01: User can check in to a shop (gates on follow graph for "friends near you" surfacing).

### Discovery Edge

- v2-FLAVOR-01: User can tag flavor notes on a burn report using a visual flavor wheel (data layer exists in `lib/data/flavor-tags.ts`).
- v2-RECS-01: User can see "cigars like this" recommendations on cigar detail (gated on ≥4 weeks of flavor-wheel data accumulation).
- v2-AGING-01: User sees per-cigar aging timeline guidance on humidor items (recommended aging windows, "ready now" / "needs N more months" hints).
- v2-VALUE-01: User can see cellar value summary on humidor home (sum of `price_paid_cents`).

### Inventory Expansion

- v2-MULTIHUM-01: User can maintain multiple named humidors (breaks every `WHERE user_id = $1` query — major schema work).
- v2-MANHUMID-01: User can manually log a humidity / temperature reading per humidor; chart over time.
- v2-UPC-01: User can scan a UPC barcode on a cigar pack to add to humidor (table-stake for Vivino / Untappd parity).

---

## Out of Scope (this milestone AND v2)

| Exclusion | Reason |
|---|---|
| E-commerce / direct cigar sales | PACT Act + Stripe tobacco policy restrictions; legally and platform-wise hard. |
| Boveda real-time sensor integration | No public API + niche audience overlap; high integration cost. |
| Native iOS/Android apps | PWA strategy is explicit. App stores add friction and gatekeeping the audience doesn't need. |
| Photo-AI cigar identification ("Shazam for cigars") | Different problem from band-scan OCR; would need a custom-trained CV model; not tractable for solo dev. |
| Real-time DMs / chat | Operational complexity (presence, moderation, abuse) too high for solo dev. |
| Gamification (badges, leaderboards beyond membership card) | Lowers perceived premium; users come for craft, not points. |
| Generic "Ask the Sommelier" chatbot | Reliability for stylized/niche knowledge too low; brand-corroding when wrong. |
| Public REST API | Operational cost (rate limits, abuse, versioning) too high for solo dev. |
| Sentry Replay | ~80KB gzipped cost not justified given server-side error traces are working. |
| Em dashes in user-facing copy | Explicitly banned (UI strings, marketing, blog, push). Plain alternatives only. |
| Fourth PWA hang watchdog | Watchdogs mask root causes; add diagnostic instrumentation instead (DIAG-01, DIAG-02). |
| Selective per-phase Mode override | All phases use the milestone-default Standard mode unless explicitly overridden in ROADMAP.md. |

---

## Traceability

(Filled by roadmapper — maps each REQ-ID to its phase number.)

---

*Last updated: 2026-05-19 after GSD bootstrap (auto mode + 4 ADR decisions).*
