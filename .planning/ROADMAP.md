# Roadmap — Platform Hardening + P1 Product Wins

**Milestone:** Platform Hardening + P1 Product Wins
**Created:** 2026-05-19
**Granularity:** coarse (config.json) — see rationale below
**Source:** Derived from `.planning/REQUIREMENTS.md` v1 (34 REQs) + `.planning/research/SUMMARY.md` (suggested 13-phase structure) + 4 locked ADRs.

## Granularity Rationale

Config sets granularity to `coarse` (typical 3-5 phases). This milestone has 13 sequencing-bound functional groupings derived from the cross-research synthesis. Compressing further would either (a) lose hard sequencing constraints — e.g. Phase 9 (CSP SRI) must precede Phase 10 (Cache Components) because ADR-1 = B unblocks ADR-2, or Phase 8 (lint cleanup) must precede Phase 11 (CI gates) to keep CI green — or (b) bundle independent risk surfaces (e.g. VLM pre-flight infra and VLM model swap are split because pricing risk is separate from model-quality risk).

The 13-phase structure IS the coarse decomposition: it merges related work where safe (Phase 4 bundles 5 P1 product wins; Phase 5 bundles 4 PWA outbox items; Phase 10 bundles 3 Cache Components items) while preserving the dependency chain. Expanding further (e.g. one phase per REQ) would violate coarse; collapsing further would smear concerns the research explicitly identified as separable.

## ADR Decisions (locked at milestone start)

| ADR | Decision | Drives |
|---|---|---|
| **ADR-1** | CSP path = **B (SRI via `experimental.sri.algorithm: 'sha256'`)** | Phase 9; preserves Cache Components compatibility |
| **ADR-2** | Cache Components = **Include in this milestone** | Phase 10 exists (would be deferred if ADR-1 = A nonce) |
| **ADR-3** | VLM model = **Ship `model` query param + 1-week A/B Haiku 4.5 vs Gemini 2.5 Flash** | Phase 6b shape |
| **ADR-4** | P1 product items = **Single small phase** | Phase 4 is bundled, not distributed |

## Phases

- [ ] **Phase 1: Foundation — Auth Fixture + Staging + Onboarding Polish** — Playwright authenticated fixture, staging Supabase + Vercel preview, hide bottom nav on `/onboarding`, fix "Start Exploring" CTA.
- [ ] **Phase 2: Service-Role Wrapper + Audit Closeout** — Ship `createServiceClientFor(callerId, reason)`; migrate all ~30 call sites; deprecate direct import.
- [ ] **Phase 3: SW Navigation SWR + Safety Net** — Cache-bust on `SW_UPDATED`, capped `maxAgeSeconds`, then flip strategy from NetworkFirst to StaleWhileRevalidate.
- [ ] **Phase 4: P1 Product Wins** — Burn-report search, pairing recall, aging-ready push verification, lounge sort/filter, humidor CSV export.
- [ ] **Phase 5: Outbox v2 — Multipart + iOS Guardrails** — Serwist `BackgroundSyncQueue` for lounge post / humidor add / photo upload; 50 MB cap; per-user partition invalidation on sign-out.
- [ ] **Phase 6a: VLM Pre-flight Infrastructure** — Two-bucket rate limit (calls + tokens), pre-VLM image size cap, AI Gateway daily cost ceiling.
- [ ] **Phase 6b: VLM Model Swap with A/B** — Vercel AI Gateway via `model` query param; Haiku 4.5 vs Gemini 2.5 Flash A/B for ~1 week; commit to a single model.
- [ ] **Phase 7: forum_posts Schema Codification** — `supabase db pull`, diff against migrations, codify gaps as idempotent migration dry-run on staging.
- [ ] **Phase 8: Lint Debt Cleanup + Gate** — Resolve all ~63 `no-explicit-any` errors in scoped PRs; enable `npm run lint` as a hard CI gate.
- [ ] **Phase 9: CSP SRI Enforcement** — `experimental.sri.algorithm: 'sha256'`; move three inline scripts behind `next/script`; retire Report-Only.
- [ ] **Phase 10: Cache Components Migration** — Audit every `runtime = "edge"`; migrate all `unstable_cache` to `'use cache'` + `cacheLife` + `cacheTag`; swap `revalidateTag` → `updateTag`; flip `cacheComponents: true`.
- [ ] **Phase 11: CI Gates — Bundle + Lighthouse** — `size-limit` against `BUNDLE_BASELINE.md`; `treosh/lighthouse-ci-action@v12` against Vercel preview; advisory for 2 weeks then enforced.
- [ ] **Phase 12: Modal a11y + Contrast Sweep** — Focus trap with iOS keyboard discipline; button-styled backdrops; axe-core / Lighthouse contrast pass on authenticated routes.
- [ ] **Phase 13: Diagnostics — Make Next Hang Self-Describing** — `performance.mark()` at every plausible hang boundary; Sentry transactions on watchdog fire. No fourth watchdog.

## Phase Details

### Phase 1: Foundation — Auth Fixture + Staging + Onboarding Polish
**Goal**: Developer can run authenticated tests reliably and deploy to a non-production environment; new users see no app chrome during onboarding and can complete the flow without a manual refresh.
**Depends on**: Nothing (gating phase)
**Requirements**: INFRA-01, INFRA-02, ONB-01, ONB-02
**Success Criteria** (what must be TRUE):
  1. Developer can run a Playwright spec that opens an authenticated page without manually signing in (storageState fixture loads + persists).
  2. Developer can deploy a branch to a separate Supabase project + Vercel preview env where destructive migrations can be dry-run without touching production data.
  3. New user reaching `/onboarding` does not see the bottom nav (`BottomNav` / `SideRailNav`).
  4. New user clicking "Start Exploring" on the final onboarding step arrives at `/home` without needing to refresh the browser.
**Plans**: TBD
**UI hint**: yes

### Phase 2: Service-Role Wrapper + Audit Closeout
**Goal**: Every Supabase service-role construction is explicit about the caller and the reason; future audits become a `grep`.
**Depends on**: Phase 1 (auth fixture lets us regression-test routes after migration)
**Requirements**: SEC-01, SEC-02
**Success Criteria** (what must be TRUE):
  1. Developer can only construct a service-role Supabase client via `createServiceClientFor(callerId, reason)`; direct `createServiceClient()` import is deprecated and emits a deprecation warning.
  2. `grep -rn "createServiceClient(" app/ lib/` returns only the wrapper definition and its usages — no other call sites.
  3. Every wrapper call site logs `{callerId, reason}` to the structured logger so production usage is queryable in Sentry.
**Plans**: TBD

### Phase 3: SW Navigation SWR + Safety Net
**Goal**: Repeat-visit navigations paint instantly from cache; the auth-leak class that reverted PR #271 cannot recur because the partition + cache-bust + age cap are in place before the strategy flip.
**Depends on**: Phase 1 (auth-transition Playwright test required before swap)
**Requirements**: PWA-01
**Success Criteria** (what must be TRUE):
  1. Repeat navigation to a previously-visited PWA route paints from cache and revalidates in the background (StaleWhileRevalidate active on `request.mode === 'navigate'`).
  2. Auth-transition test: User A signs in, navigates, signs out, User B signs in on same device, navigates — User A's identity never appears in User B's DOM at any frame.
  3. On `SW_UPDATED`, the `navigations` cache is wiped (`caches.delete("navigations")` fires); `maxAgeSeconds` is capped at 3600.
**Plans**: TBD

### Phase 4: P1 Product Wins
**Goal**: Five small, high-ROI product features that use already-collected data ship in a single bundled phase while heavier infrastructure work queues.
**Depends on**: Phase 1 (auth fixture for regression coverage)
**Requirements**: PROD-01, PROD-02, PROD-03, PROD-04, PROD-05
**Success Criteria** (what must be TRUE):
  1. User can search their own burn reports by review text and find matches via Postgres full-text search.
  2. User on a cigar's detail page sees "you paired this with X, Y, Z" derived from their own prior `pairing_drink` values.
  3. User with a humidor item reaching its aging-ready preset receives a push notification (the existing cron fan-out path is verified end-to-end).
  4. User on a lounge category room can sort/filter by most recent activity / most likes / unanswered.
  5. User on the humidor page can export inventory (cigars + quantity + purchase date + price + aging start + notes) as a downloaded CSV file.
**Plans**: TBD
**UI hint**: yes

### Phase 5: Outbox v2 — Multipart + iOS Guardrails
**Goal**: Lounge posts, humidor adds, and photo uploads queue offline and replay on reconnect, scoped to the original user; iOS Safari quota and Blob-leak failure modes are bounded.
**Depends on**: Phase 3 (both touch `app/sw.ts`; SW SWR ships before outbox restructure to avoid merge conflicts)
**Requirements**: PWA-02, PWA-03, PWA-04, PWA-05
**Success Criteria** (what must be TRUE):
  1. User can compose a lounge post while offline; on reconnect the post submits and appears in the feed without manual retry.
  2. User can add a cigar to their humidor while offline; on reconnect the add persists.
  3. User can attach a photo (avatar / burn-report image / lounge-post image) while offline; the Blob round-trips through IDB via `idb@8.0.3` and uploads on reconnect.
  4. When User A signs out on a device, no queued mutation of User A's replays under User B's session on that device.
**Plans**: TBD
**UI hint**: yes

### Phase 6a: VLM Pre-flight Infrastructure
**Goal**: Before any model swap, the VLM endpoint cannot be weaponized as a denial-of-wallet vector.
**Depends on**: Phase 2 (service-role wrapper in place for any new admin tooling)
**Requirements**: AI-01, AI-02
**Success Criteria** (what must be TRUE):
  1. Developer can verify two distinct rate-limit buckets fire on `/api/vision/analyze`: per-user call count (existing 30/hour) AND per-user token count (new).
  2. Requests with images >1024×1024 or >2 MB are rejected with a 4xx before any VLM call.
  3. Vercel AI Gateway shows a hard daily cost ceiling that fails the route with 503 before the production budget is exhausted.
**Plans**: TBD

### Phase 6b: VLM Model Swap with A/B
**Goal**: Cigar-band OCR migrates from Google Vision TEXT_DETECTION to a VLM via Vercel AI Gateway with empirical model selection; SAFE_SEARCH remains on Vision.
**Depends on**: Phase 6a (pre-flight guardrails must exist before token-billed traffic flows)
**Requirements**: AI-03, AI-04, AI-05
**Success Criteria** (what must be TRUE):
  1. Developer can hit `/api/vision/analyze?mode=ocr&model=anthropic/claude-haiku-4-5` or `?model=google/gemini-2.5-flash` and receive `{brand, series, vitola, confidence}` validated against a Zod schema.
  2. `/api/vision/analyze?mode=safety` still routes to Google Vision SAFE_SEARCH_DETECTION unchanged.
  3. After ~1 week of A/B data, developer has chosen one model based on quality + cost and the `model` query param defaults to it.
**Plans**: TBD

### Phase 7: forum_posts Schema Codification
**Goal**: The `forum_posts` table on production matches the union of files in `supabase/migrations/`; future ad-hoc SQL editor changes are detectable.
**Depends on**: Phase 1 (staging env required for the dry-run step)
**Requirements**: DATA-01
**Success Criteria** (what must be TRUE):
  1. Running `supabase db pull --schema public` against production produces no diff vs. the codified migration history.
  2. The new codifying migration is idempotent (`IF NOT EXISTS` / equivalent) and replays cleanly against a fresh staging database.
  3. RLS policies on `forum_posts` in staging-after-replay match production policy-by-policy (`pg_policies` diff is empty).
**Plans**: TBD

### Phase 8: Lint Debt Cleanup + Gate
**Goal**: All ~63 pre-existing `no-explicit-any` errors are resolved with safe narrower types, and `npm run lint` blocks merges going forward.
**Depends on**: Phase 1 (auth fixture catches data-shape regressions that lint-debt PRs can introduce)
**Requirements**: CI-01, CI-02
**Success Criteria** (what must be TRUE):
  1. `npm run lint` against `main` returns zero errors.
  2. `.github/workflows/ci.yml` runs `npm run lint` as a hard gate and blocks merge on failure.
  3. Authenticated Playwright fixture passes on each lint-debt PR — no Sentry `TypeError: Cannot read property '...' of undefined` regression after merge.
**Plans**: TBD

### Phase 9: CSP SRI Enforcement
**Goal**: CSP is enforced in production via Subresource Integrity; Report-Only is retired; Cache Components compatibility is preserved (per ADR-1 = B).
**Depends on**: Phase 8 (lint debt cleared so CSP regression PRs don't fight a red CI)
**Requirements**: SEC-03
**Success Criteria** (what must be TRUE):
  1. `next.config.ts` sets `experimental.sri.algorithm: 'sha256'`; all script tags in the production HTML carry `integrity` attributes.
  2. The three inline scripts in `app/layout.tsx` (cold-smoke init, hydration mark, stale-chunk recovery) are migrated to `next/script` with auto-hash; no `dangerouslySetInnerHTML` script tags remain in the layout.
  3. `Content-Security-Policy` is sent as an enforced header (not `Content-Security-Policy-Report-Only`); Sentry shows zero CSP violation events for 7 days post-deploy.
**Plans**: TBD

### Phase 10: Cache Components Migration
**Goal**: All `unstable_cache` call sites move to `'use cache'` + `cacheLife` + `cacheTag`; mutations use `updateTag`; `cacheComponents: true` ships with a documented revert plan.
**Depends on**: Phase 9 (SRI must be in place because nonce-CSP would have forced indefinite deferral of this phase)
**Requirements**: CACHE-01, CACHE-02, CACHE-03
**Success Criteria** (what must be TRUE):
  1. `grep -rn "unstable_cache" app/ lib/ utils/` returns zero matches; all 8 cited call sites use `'use cache'` + `cacheLife` + `cacheTag`.
  2. `grep -rn "revalidateTag(" app/ lib/` in mutation paths is replaced with `updateTag(...)`.
  3. `next.config.ts` has `cacheComponents: true` at the top level; every `runtime = "edge"` route is either intentionally migrated to `nodejs` or excluded; `npm run build` succeeds with no `Uncached data was accessed outside of <Suspense>` errors.
**Plans**: TBD

### Phase 11: CI Gates — Bundle + Lighthouse
**Goal**: Bundle size regressions and Lighthouse performance regressions surface on every PR; gates start advisory and enforce after a 2-week false-positive shake-out.
**Depends on**: Phase 8 (lint debt cleared so gates don't compound red CI)
**Requirements**: CI-03, CI-04
**Success Criteria** (what must be TRUE):
  1. `size-limit@^12.1.0` with `@size-limit/preset-app` runs on every PR and diffs against `BUNDLE_BASELINE.md`; output is posted as a PR comment.
  2. `treosh/lighthouse-ci-action@v12` runs against the Vercel preview URL (via `patrickedqvist/wait-for-vercel-preview@v1`) on every PR; resource-size budgets in `lighthouse-budget.json` are evaluated.
  3. After 2 weeks of advisory output with false-positive rate <30%, both gates are flipped from advisory to enforced (PR cannot merge on regression).
**Plans**: TBD

### Phase 12: Modal a11y + Contrast Sweep
**Goal**: Modals trap focus correctly (including iOS Safari virtual-keyboard discipline), backdrops are accessible, and authenticated routes pass an axe-core / Lighthouse contrast sweep on real composites (not just isolated tokens).
**Depends on**: Phase 1 (auth fixture lets the contrast sweep cover authenticated routes; Phase 8 to keep CI green during a11y-related PRs)
**Requirements**: A11Y-01, A11Y-02
**Success Criteria** (what must be TRUE):
  1. Inside any open modal, Tab cycles only between focusable elements within the modal; the backdrop is not in the tab order.
  2. On iOS Safari, tapping "Done" on the virtual keyboard inside a modal dismisses the keyboard without programmatic re-focus pulling it back up.
  3. axe-core / Lighthouse run on authenticated routes via the Playwright fixture reports no focus-ring, icon-on-icon, or translucent-overlay contrast violations.
**Plans**: TBD
**UI hint**: yes

### Phase 13: Diagnostics — Make Next Hang Self-Describing
**Goal**: The next production hang report carries a `performance.mark()` timeline + Sentry transaction that names the failure mode; no fourth watchdog is added.
**Depends on**: Nothing functional (additive instrumentation); sequenced last so it captures the new boundaries introduced in earlier phases
**Requirements**: DIAG-01, DIAG-02
**Success Criteria** (what must be TRUE):
  1. Developer reading a Sentry transaction from a watchdog-fire event can identify which boundary fired (chunk-load-error, hydration-timeout, auth-timeout, or one of the newly-instrumented boundaries) without DevTools access.
  2. `grep -rn "performance.mark" lib/ components/ app/` shows centralized mark names defined in `lib/diagnostics/marks.ts` and used at every plausible hang boundary identified by the architecture research.
  3. No fourth watchdog script has been added to `app/layout.tsx`; the three existing watchdogs flush their mark trail to Sentry before reloading.
**Plans**: TBD

## Coverage Map (REQ → Phase)

| REQ | Category | Phase |
|---|---|---|
| INFRA-01 | Test Infrastructure | 1 |
| INFRA-02 | Test Infrastructure | 1 |
| ONB-01 | Onboarding Polish | 1 |
| ONB-02 | Onboarding Polish | 1 |
| SEC-01 | Security | 2 |
| SEC-02 | Security | 2 |
| PWA-01 | Service Worker | 3 |
| PROD-01 | Product | 4 |
| PROD-02 | Product | 4 |
| PROD-03 | Product | 4 |
| PROD-04 | Product | 4 |
| PROD-05 | Product | 4 |
| PWA-02 | Service Worker | 5 |
| PWA-03 | Service Worker | 5 |
| PWA-04 | Service Worker | 5 |
| PWA-05 | Service Worker | 5 |
| AI-01 | AI / Vision | 6a |
| AI-02 | AI / Vision | 6a |
| AI-03 | AI / Vision | 6b |
| AI-04 | AI / Vision | 6b |
| AI-05 | AI / Vision | 6b |
| DATA-01 | Schema | 7 |
| CI-01 | CI | 8 |
| CI-02 | CI | 8 |
| SEC-03 | Security | 9 |
| CACHE-01 | Caching | 10 |
| CACHE-02 | Caching | 10 |
| CACHE-03 | Caching | 10 |
| CI-03 | CI | 11 |
| CI-04 | CI | 11 |
| A11Y-01 | Accessibility | 12 |
| A11Y-02 | Accessibility | 12 |
| DIAG-01 | Diagnostics | 13 |
| DIAG-02 | Diagnostics | 13 |

**Coverage:** 34/34 v1 REQs mapped to exactly one phase. No orphans. v2 + Out of Scope items are not in this roadmap.

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/? | Not started | - |
| 2. Service-Role Wrapper | 0/? | Not started | - |
| 3. SW Navigation SWR | 0/? | Not started | - |
| 4. P1 Product Wins | 0/? | Not started | - |
| 5. Outbox v2 | 0/? | Not started | - |
| 6a. VLM Pre-flight | 0/? | Not started | - |
| 6b. VLM Model Swap | 0/? | Not started | - |
| 7. forum_posts Codification | 0/? | Not started | - |
| 8. Lint Debt + Gate | 0/? | Not started | - |
| 9. CSP SRI Enforcement | 0/? | Not started | - |
| 10. Cache Components Migration | 0/? | Not started | - |
| 11. CI Gates — Bundle + Lighthouse | 0/? | Not started | - |
| 12. Modal a11y + Contrast Sweep | 0/? | Not started | - |
| 13. Diagnostics | 0/? | Not started | - |

## Research Flags for plan-phase

Per `.planning/research/SUMMARY.md` §Research Flags, the following phases need `/gsd:plan-phase --research-phase <N>`:

- **Phase 6a** (VLM pre-flight) — Vercel AI Gateway pricing + Upstash token-bucket pattern are live targets; re-run `curl https://ai-gateway.vercel.sh/v1/models | jq` at phase start.
- **Phase 6b** (VLM model swap) — model pricing + capability for cigar-band OCR is empirical; re-verify AI Gateway docs.
- **Phase 9** (CSP SRI) — `experimental.sri.algorithm` is experimental in Next 16; re-verify flag stability and `next/script` auto-hash behavior at phase start.
- **Phase 10** (Cache Components) — largest single architectural change; Next 16 caching surface ships rapidly; re-verify `'use cache'` / `cacheLife` / `cacheTag` / `updateTag` semantics + every `runtime = "edge"` audit pattern.

Standard patterns (skip per-phase research): Phases 1, 2, 3, 4, 5, 7, 8, 11, 12, 13.

---

*Roadmap created 2026-05-19 from REQUIREMENTS.md v1 + research/SUMMARY.md suggested phases + 4 locked ADRs.*
