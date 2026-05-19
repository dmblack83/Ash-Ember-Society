# Project Research Summary

**Project:** Ash & Ember Society
**Domain:** Premium mobile-first PWA (cigar enthusiasts) — SUBSEQUENT milestone of a shipping product
**Researched:** 2026-05-19
**Confidence:** HIGH on platform-stack items (Next 16 / Serwist / Supabase verified against official docs and repo). MEDIUM on competitor-feature claims (training-data, no live verification) and on VLM model selection (needs A/B in prod).

> **Read this first.** The product is past MVP. Stack is fixed; architecture is shipped. The four research dimensions converged on a milestone that is mostly platform-hardening (CSP / cache / SW / outbox / VLM / a11y / CI), not greenfield feature work. The hard decisions are sequencing, not technology choice. Two of the active items are **mutually incompatible** at the platform level and force an ADR before the roadmapper drafts phases.

> **Synthesis note:** Architecture research output was missing from disk when the synthesizer ran (path resolution issue, since corrected). The Architecture findings were inferred from `.planning/codebase/ARCHITECTURE.md` and overlap with Stack/Pitfalls research. The actual research/ARCHITECTURE.md is now in place and aligns with synthesis conclusions (no contradictions found).

---

## Executive Summary

This is a hardening milestone on an already-shipped premium PWA. The stack is locked (Next 16 App Router, Supabase, Stripe, Serwist 9.5, Tailwind 4, Sentry, Upstash), the architecture is settled (single-auth-check via `proxy.ts` + `x-ae-*` forwarded headers, Suspense-island server components, SWR client cache, three-watchdog PWA resilience), and the recent six-phase performance plan (PRs #258-265) constrains what counts as "safe to ship". The work divides into three buckets: **platform safety** (CSP enforce, service-role audit, cron auth canary), **PWA resilience** (SW SWR navigation, outbox multipart, VLM token-cost guardrails), and **product growth** (burn-report search, pairing recall, public profile → follow → shop check-in chain, flavor wheel).

The single most important finding is a **forced architectural choice**: nonce-based CSP (the canonical Next 16 fix per official docs) and `'use cache'` / Cache Components are mutually exclusive — nonces force every page dynamic, defeating the static-shell prerendering that Cache Components requires. The third option (SRI via `experimental.sri.algorithm: 'sha256'`) preserves both but is experimental. This decision cannot be deferred into the roadmap; the roadmapper needs an answer before sequencing CSP and `unstable_cache` migration phases. Path A (security-first, nonce, defer Cache Components) is the lower-risk default for solo-dev.

The second-most-important finding is that **Playwright authenticated fixtures and a staging environment are prerequisite infrastructure for ≥3 milestone items** (SW SWR auth-transition tests, lint-debt regression coverage, contrast sweep on authenticated routes, `forum_posts` schema-diff verification). PROJECT.md sequences these mid-milestone; research says they belong at the front. Risk markers: VLM migration has a denial-of-wallet axis (token billing replaces flat-fee call billing) needing a two-bucket rate limit + pre-call size cap **before** the model swap; outbox multipart needs an iOS-Safari quota cap (50 MB) and Blob URL discipline; service-role call sites grew 11 → ~30 in two weeks and need a wrapper helper, not just a re-audit. The cheapest product wins (burn-report search, pairing recall) are S-complexity and use already-collected data.

---

## Key Findings

### Cross-Research Convergence (where 2+ dimensions agree)

| Convergence | Sources | Implication |
|---|---|---|
| **Nonce CSP and Cache Components are incompatible** | Stack §1 + Pitfalls #1 + #2 (both cite Next 16 official docs) | One ADR before roadmapping; SRI is the experimental third option |
| **Service-role audit becomes mechanical IF wrapped first** | Pitfalls #4 (wrapper pattern is durable); PROJECT.md frames as "re-audit ~19 sites" | Reframe backlog item: ship `createServiceClientFor(callerId, reason)` first, audit becomes a `grep` |
| **Outbox v2 should use Serwist `BackgroundSyncQueue`** | Stack §3 + Pitfalls #5 (multipart only resolved via separate IDB Blob store) + Architecture §3 | Stop hand-rolling client-side replay; use `idb@8.0.3` for Blobs only |
| **VLM migration has a prerequisite infrastructure step** | Stack §5 + Pitfalls #6 + Architecture §5 | Sequence rate-limit / size-cap work BEFORE the model swap |
| **iOS-Safari quirks are a separate verification surface** | Pitfalls #5 (IDB quota), #8 (virtual-keyboard re-focus), Architecture (legacy capable tag) | Every PWA-touching phase needs an iOS standalone smoke pass |
| **Playwright authenticated fixture is a multi-item prereq** | Pitfalls #3 + #9 + #12 | Sequence early; gates ≥3 downstream items |
| **Staging environment is a detection surface** | Pitfalls #2, #3, #10 + §Tech Debt | Sequence earlier than PROJECT.md suggests |
| **Watchdog scripts are debt, not infrastructure** | Pitfalls §Tech Debt + Architecture §4 (mark + Sentry, no 4th watchdog) | Add `performance.mark()` + Sentry transactions + watchdog-fire auto-flush. **No 4th watchdog.** |
| **Cheapest product wins use existing data** | Features §"Ship Next" + Architecture (pairing_drink shipped) | Burn-report search + pairing recall: pair as a single small phase |

### Cross-Research Conflicts (decisions needed)

| Conflict | Sources | Roadmapper decision |
|---|---|---|
| **CSP enforcement path** | Stack §1 (nonce canonical; SRI static-friendly). Pitfalls #1 (nonce silently kills PPR; SRI experimental). Architecture §1 (nonce recommended) | **ADR-1:** Nonce vs SRI vs scoped nonce (auth routes only) |
| **Cache Components migration timing** | Stack §4 (stable; whole-app flag). Pitfalls #2 (forces Edge → Node + breaks GET handlers) | **ADR-2:** Depends on ADR-1; if nonce wins, defer Cache Components |
| **VLM model: Haiku 4.5 vs Gemini 2.5 Flash** | Stack §5 (Haiku first; Gemini fallback). Architecture §5 (Haiku recommended). Confidence MEDIUM | **ADR-3:** `model` query param; A/B for one week before committing |
| **Feature priority — single phase or distributed?** | Features §"Ship Next" (5 P1 items); PROJECT.md mixes platform + product | **ADR-4:** Single small product phase; don't gate behind every infra phase |
| **Multi-humidor support** | Features (table-stake row 10); breaks every `WHERE user_id = $1` query | Defer to second wave; would dominate the milestone otherwise |

### Recommended Stack — Locked vs Open

**Locked:** Next 16.2.1, React 19.2.4, Supabase, Stripe, Tailwind 4, Sentry 10.51, Serwist 9.5.11, SWR 2.4.1, Upstash, `@vercel/speed-insights`.

**Net-new dependencies (this milestone):**

| Library | Version | Purpose | Confidence | Open question |
|---|---|---|---|---|
| `idb` | `^8.0.3` | Blob outbox storage | HIGH | None |
| `ai` + `@ai-sdk/gateway` | `^6.0.185` / `^3.0.116` | VLM via Vercel AI Gateway | HIGH | Model — ADR-3 |
| `size-limit` + `@size-limit/preset-app` | `^12.1.0` | Bundle budget CI gate | HIGH | Initial thresholds (start permissive) |
| `treosh/lighthouse-ci-action@v12` + `patrickedqvist/wait-for-vercel-preview@v1` | latest | Lighthouse vs preview | HIGH | None |

**Anti-recommendations preserved:**

- Do NOT hash-only `script-src` (#326 already proved it fails on RSC Flight payloads).
- Do NOT use `bundlewatch`, `localforage`, `dexie`, direct Anthropic/Google SDKs, OpenRouter.
- Do NOT migrate Vision SAFE_SEARCH to VLM — keep purpose-built moderation.
- Do NOT add a 4th watchdog — instrument with `performance.mark()` + Sentry instead.
- Do NOT do file-by-file Cache Components migration — global flag, whole-app only.

### Expected Features

**Table stakes (5 P1 — gaps where absence feels like an omission):**

- Burn-report search (S, existing data) — Postgres FTS on `smoke_logs.review_text`.
- Pairing recall on cigar detail (S, existing data) — surface `pairing_drink`.
- Aging-ready push (S) — verify cron fan-out works.
- Lounge thread sort/filter (S, schema drift to codify).
- CSV export of humidor (S).

**Differentiators (sequence matters):**

- Public profile → Friends/Follow → Shop Check-In — sequential 3-link chain.
- Flavor wheel UI (data layer exists) — gating asset for "cigars like this" recs; 4-6 weeks of data accumulation needed post-launch.
- Cellar value dashboard — `price_paid_cents` exists; cost-basis MVP only.

**Anti-features (8 — DO NOT BUILD):**

E-commerce (PACT Act / Stripe restrictions), Boveda real-time sensor integration, native iOS/Android, photo-AI cigar identification ("Shazam for cigars"), real-time DMs/chat, gamification beyond membership card, generic "Ask the Sommelier" chatbot, public REST API.

### Architecture Approach

No new architectural patterns proposed. Existing patterns the roadmapper must respect:

- Single auth check per request via `proxy.ts` — new routes use `getServerUser()` from forwarded headers.
- Server-Components-first with Suspense islands — `page.tsx` (sync shell) + `_islands.tsx` (async data) + `_skeletons.tsx`.
- SWR cache keys in `lib/data/keys.ts` — tuple keys, never object literals.
- `unstable_cache` callbacks use `createAnonClient()` — `cookies()` defeats memoization.
- Service-role client `createServiceClient()` is server-only.
- Service worker source at `app/sw.ts` built by Serwist separately.

**Specific architectural contracts surfaced (from research/ARCHITECTURE.md):**

- Item 1 (CSP): `crypto.randomUUID()` → base64 → `x-nonce` request header → `headers().get('x-nonce')` in layout → `'strict-dynamic'` directive. Edge gotcha: `Buffer` unavailable, use `btoa()` or Uint8Array → base64.
- Item 2 (SW SWR): one-line strategy flip at `app/sw.ts:343-357` + activate handler addition at `app/sw.ts:400-411`. Existing `authPartitionPlugin` at `app/sw.ts:165-181` partitions correctly.
- Item 3 (Outbox v2): Serwist `BackgroundSyncQueue` structured-clones entire `Request` — File/Blob bodies durable across reload. User-scoping happens in custom `onSync`.
- Item 4 (Diagnostics): `performance.mark()` + Sentry transactions + watchdog-fire auto-flush. New `lib/diagnostics/marks.ts`.
- Item 5 (VLM): Split `app/api/vision/analyze/route.ts` into safety (Vision, unchanged) + ocr (VLM, new file `lib/vision-ocr.ts`). Use `gateway('anthropic/claude-haiku-4.5')` + `generateObject` with Zod schema.

**Open architectural decision:** CSP-vs-Cache-Components incompatibility — architecture question masquerading as stack choice.

### Critical Pitfalls (top 5)

1. **Nonce CSP silently disables PPR.** Every prerendered route flips `○ Static → ƒ Dynamic`. Avoidance: evaluate SRI before committing; or scope nonce to authenticated routes via `proxy.ts` matcher.

2. **Cache Components forces Edge routes back to Node + breaks GET route handlers.** `home/page.tsx`, `api/burn-report/route.ts` use `runtime = "edge"`. Avoidance: scratch-branch migration; per-route Node-vs-exclude decision before flag flip.

3. **SW SWR re-introduces the auth-leak class.** `authPartitionPlugin` partitions cache keys, not response delivery during auth transition; cached chunk URLs 404 post-deploy. Avoidance: Playwright auth-transition test FIRST; `caches.delete("navigations")` on `SW_UPDATED`; cap `maxAgeSeconds` ≤ 1 hour.

4. **Service-role call sites multiplied 11 → ~30 in 13 days without a wrapper.** Avoidance: ship `createServiceClientFor(callerId, reason)` as the only constructor; deprecate direct import; audit becomes mechanical `grep`.

5. **VLM migration has a denial-of-wallet axis.** Per-token billing replaces flat-fee Vision; 5000×7000 image looped at 30/hour rate limit = ~$30/user/hour. Avoidance: two-bucket rate limit (calls + tokens); pre-VLM size cap (1024×1024, 2 MB); AI Gateway daily cost ceiling.

Five more medium-severity pitfalls detailed in PITFALLS.md (cron auth silent fail, modal a11y iOS keyboard re-focus, contrast sweep over translucent overlays, `forum_posts` schema-diff toolchain, CI bundle false positives, lint-debt type-inference regressions).

---

## Implications for Roadmap

### Open Decisions (ADR-style) — Dave Must Answer Before Roadmap Drafts

**ADR-1: CSP enforcement path.**

- **A — Nonce-based.** Canonical Next 16. Cost: every prerendered route flips to dynamic; Cache Components incompatible. Best for: security-first.
- **B — SRI (`experimental.sri.algorithm: 'sha256'`).** Preserves static generation. Cost: experimental flag; Stripe Elements / Google Maps inline init must move behind `next/script`. Best for: perf-first.
- **C — Scoped nonce (auth routes only).** `proxy.ts` matcher splits — nonce on `(app)`, no nonce on marketing/landing. Cost: more proxy complexity. Best for: pragmatic middle.

**ADR-2: Cache Components migration.**

- If ADR-1 = A: defer indefinitely OR wait for `'use cache: remote'` to mature.
- If ADR-1 = B or C: proceed; whole-app PR with revert plan; audit every `runtime = "edge"` first.

**ADR-3: VLM model selection.** Ship `model` query param; A/B Haiku 4.5 vs Gemini 2.5 Flash for one week on real cigar bands; commit after.

**ADR-4: P1 product items — single phase or distributed?** Recommendation: **single small phase sequenced after auth fixture but BEFORE heavy CSP/Cache Components work** — cheap product value while infra queues.

### Suggested Phase Structure

| # | Phase | Rationale | Pitfalls addressed | Research flag |
|---|---|---|---|---|
| **1** | Foundation — Playwright auth fixture + staging environment | Unblocks Phases 3, 4, 5, 7, 8, 12 | #3, #9, #10, #12 | STANDARD |
| **2** | Service-role wrapper + audit closeout | Protects against site #31; audit becomes `grep` | #4 | STANDARD |
| **3** | SW navigation SWR — safety net first | Auth-transition test + cache-bust + feature flag, THEN strategy swap | #3 | STANDARD |
| **4** | P1 product wins (single small phase) | Burn-report search, pairing recall, aging-push verify, lounge sort/filter, CSV export | — | STANDARD |
| **5** | Outbox v2 — multipart via Serwist BackgroundSync + iOS guardrails | 50 MB cap, Blob URL revocation, persistent failure UI | #5 | STANDARD (MEDIUM on iOS quota — real-device verify) |
| **6a** | VLM pre-flight infrastructure | Two-bucket rate limit + pre-call size cap + AI Gateway daily ceiling | #6 | RESEARCH (pricing is a live target) |
| **6b** | VLM model swap | `model` query param; A/B; commit; Vision flag preserved | #6 | RESEARCH (re-verify AI Gateway docs) |
| **7** | `forum_posts` schema codification | `supabase db pull`; codify with `IF NOT EXISTS`; dry-run on staging | #10 | STANDARD |
| **8** | Lint-debt cleanup + lint gate | 4-8 PRs of 5-10 fixes each AFTER auth fixture; enable gate as final commit | #12 | STANDARD |
| **9** | CSP enforcement (per ADR-1) | Architectural; cannot start without ADR-1 | #1 | RESEARCH if ADR-1 = B or C |
| **10** | Cache Components migration (conditional on ADR-2) | Only if ADR-1 = B or C | #2 | RESEARCH (largest single change) |
| **11** | CI gates — bundle + Lighthouse (advisory → enforced) | 2-week advisory window; AFTER Phase 8 so backlog doesn't keep CI red | #11 | STANDARD |
| **12** | Modal a11y + contrast sweep | Both need Phase 1's auth fixture | #8, #9 | STANDARD |
| **13** | Diagnostics — make next hang self-describing | `performance.mark()` + Sentry transactions + watchdog auto-flush. NO 4th watchdog | §Tech Debt | STANDARD |
| **14+** | Product expansion (second wave): 14a Public profile → 14b Follow → 14c Shop check-in; 14d Flavor wheel → 14e Cigars-like-this; 14f Cellar value; 14g Multi-humidor; 14h UPC scan | Differentiators from FEATURES.md | — | per-item |

### Phase Ordering Rationale

- **Phase 1 first** because Phases 3, 4, 5, 7, 8, 12 all need authenticated tests and/or staging.
- **Phase 2 second** because every subsequent server-side change risks adding another `createServiceClient()` site.
- **Phase 3 before Phase 5** because SW changes interleave; safer to land navigation strategy before adding outbox complexity.
- **Phase 4 in the middle** because it ships product value while heavier infrastructure queues; not blocked by 5-13.
- **Phase 6 split** because pricing risk (6a) is the real risk, not the model swap (6b).
- **Phases 9 and 10 mutually exclusive** based on ADR-1.
- **Phase 11 after Phase 8** because lint debt would keep the gate red.
- **Phase 13 anytime** — independent, but should exist before the next hang report.
- **Phase 14+ deferred** until platform stabilizes.

### Research Flags

**Need `/gsd:plan-phase --research-phase <N>`:**
- Phase 6 (VLM) — Vercel AI Gateway + model pricing are live targets.
- Phase 9 (CSP) — if ADR-1 = B (SRI experimental) or C (scoped nonce not in docs).
- Phase 10 (Cache Components) — largest architectural change; Next 16 caching surface ships rapidly.

**Standard patterns (skip research):** Phases 1, 2, 3, 4, 5, 7, 8, 11, 12, 13.

---

## Confidence Assessment

| Area | Confidence | Notes |
|---|---|---|
| Stack | HIGH | Items 1-4, 6 verified against Next 16 docs + Serwist official + Context7. Item 5 MEDIUM (needs prod A/B). |
| Features | MEDIUM | Competitor claims training-data only; WebSearch denied. Internal reasoning (deps, P1 vs P2) HIGH (codebase ground truth). |
| Architecture | HIGH | No new architecture proposed; `codebase/ARCHITECTURE.md` refreshed 2026-05-18. Research/ARCHITECTURE.md present at correct path. |
| Pitfalls | HIGH on Next/Serwist/Supabase. MEDIUM on iOS Safari + Vercel platform (general knowledge, no live source). |

**Overall confidence:** HIGH on technical conclusions and sequencing. MEDIUM on competitor claims (re-verify before Phase 14+).

### Gaps to Address

- VLM pricing is a live target — re-run `curl https://ai-gateway.vercel.sh/v1/models | jq` at start of Phase 6.
- Competitor features need manual install check before Phase 14a (Cigar Aficionado app, Cigar Scanner OCR, Vivino "Wines Like This").
- iOS Safari outbox quota behavior — verify on real device during Phase 5.
- Boveda Butler API status — spot-check before Phase 14g context.
- SRI experimental flag stability — re-verify if ADR-1 = B.
- CI infrastructure now exists (`.github/workflows/ci.yml` typecheck-only) — Phases 8 and 11 layer on top.

---

*Research synthesis: 2026-05-19*
*Ready for roadmap: yes — pending ADR-1 (CSP path), ADR-2 (Cache Components timing), ADR-3 (VLM model), ADR-4 (P1 product items single phase). Roadmapper should request answers before drafting Phase 4 / Phase 6b / Phase 9 / Phase 10.*
