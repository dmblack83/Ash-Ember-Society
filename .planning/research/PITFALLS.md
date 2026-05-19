# Pitfalls Research

**Domain:** Premium mobile-first PWA (Next 16 App Router / Vercel / Supabase / Serwist) — subsequent milestone
**Researched:** 2026-05-19
**Confidence:** HIGH on Next-16 RSC / CSP / Cache Components items (verified against `node_modules/next/dist/docs/`). HIGH on Serwist + Supabase items (verified against the repo). MEDIUM on iOS-Safari / Vercel-platform items (verified against repo + general PWA + Vercel knowledge; no live source check possible — WebSearch is denied in this environment).

> **Conventions for this file.** Each pitfall has a severity (`high` / `medium` / `low`), is tagged with the affected Active backlog item from `.planning/PROJECT.md`, and includes detection (concrete signal) + avoidance (the right pattern, not "be careful"). The five incidents the milestone context flagged (#326, #378, the three watchdogs, the `seed-cigar-default-images.ts` script) are referenced but not re-listed.

---

## Critical Pitfalls

### Pitfall 1: Nonce-based CSP silently disables Partial Prerendering and the static shell

**Severity:** high
**Affected backlog item:** CSP enforcement — Report-Only → enforced via nonce.

**What goes wrong:**
The Next 16 CSP guide states it explicitly: *"all pages must be dynamically rendered ... Partial Prerendering (PPR) is incompatible with nonce-based CSP since static shell scripts won't have access to the nonce ... pages cannot be cached by CDNs without additional configuration."* (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` §"Static vs Dynamic Rendering with CSP"). Switching `next.config.ts` from header-only `Content-Security-Policy-Report-Only` to a nonce flow generated in `proxy.ts` turns every authenticated page into a dynamic render. The six-phase performance plan from May 2026 — Suspense islands, `unstable_cache` dedup on `getProfileLite` / `getLatestNews`, static shell first paint — depends on the prerender step running at build time. A nonce flow defeats that step.

**Detection:**
- After enforcing nonce: run `npm run build` and check the build summary — pages that were marked `○ (Static)` or `◐ (Partially Prerendered)` will flip to `ƒ (Dynamic)`. The diff is the regression surface.
- LCP / TTFB in Vercel Speed Insights will rise on `/home`, `/humidor`, `/lounge`, `/discover/cigars` — those are the routes whose Suspense-island shell currently lands inside the prerendered output.
- `view-source:` on any page: if a `<script>` tag has both `src` and `nonce`, the nonce flow is engaged. If it has neither, the page is still in the static shell.

**Avoidance:**
Evaluate the experimental hash-based **Subresource Integrity (SRI)** path described in the same guide (`experimental.sri.algorithm: "sha256"`) BEFORE committing to nonces. SRI keeps static generation and CDN caching intact — the build computes hashes for every script chunk and adds `integrity` attributes; CSP stays `script-src 'self'`. The cost is the experimental flag and no support for dynamically-generated scripts (Stripe Elements / Google Maps inline init blocks need to keep their existing hash entries OR move behind `next/script`). If nonces are required for compliance reasons, scope the rollout: keep `Report-Only` on prerendered routes, switch to enforced nonces only on the authenticated app surface — using a `proxy.ts` matcher to inject the nonce header only on a subset of paths.

---

### Pitfall 2: Cache Components conversion forces edge routes back to Node and changes route-handler caching semantics

**Severity:** high
**Affected backlog item:** `unstable_cache` → Cache Components migration.

**What goes wrong:**
The Next 16 migration guide states *"`runtime = 'edge'` Not supported. Cache Components requires the Node.js runtime"* (`node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md` lines 173-175). The repo's CONVENTIONS confirm `app/(app)/home/page.tsx` and `app/api/burn-report/route.ts` opt into `export const runtime = "edge"`. Enabling `cacheComponents: true` in `next.config.ts` flips every such route to Node — cold-start changes, memory/CPU pricing changes, and (subtly) every `getServerUser()` call resolves slightly slower because there's no Edge cold-path.

Secondary trap: the Caching with Cache Components guide notes *"When Cache Components is enabled, `GET` Route Handlers follow the same prerendering model as pages"* (`08-caching.md` line 42). That means any `GET` route handler that today reads cookies/headers without `'use cache'` or `Suspense` will throw `Uncached data was accessed outside of <Suspense>` at build time. `app/api/*` is full of `getServerUser()` calls that read `x-ae-user-*` cookies via `headers()`.

**Detection:**
- `npm run build` after enabling the flag — look for `Uncached data was accessed outside of <Suspense>` errors. Each one is a route that needs either `'use cache'` with `cacheLife(...)` or a `<Suspense>` wrapper (for pages) / explicit dynamic opt-in (for route handlers).
- `grep -rn "runtime = \"edge\"" app/` — every match is a forced Node migration with billing/perf implications.
- Watch Vercel function invocation duration on `home`/`humidor` after migration — Node cold start ~150-300 ms higher than Edge.

**Avoidance:**
Do the migration on a **scratch branch** with `cacheComponents: true`, run `next build`, fix every error, and only then merge. Do NOT enable the flag in a PR that also changes business logic — the migration is "whole-app" by definition, so it has to be its own concern. For each `runtime = "edge"` route, decide before flipping the flag whether the route stays on Node (`'use cache'` over the heavy work + `cacheLife("hours" | "max")`) or moves out of the Cache-Components-managed surface (e.g. proxy.ts continues to live in the Edge runtime; that is unaffected). The repo's existing pattern of `getServerUser()` reading forwarded headers is the closest analogue to "extract runtime value, pass into cached function" shown in the Cache Components docs (`08-caching.md` §"Passing runtime values to cached functions") — keep that shape.

---

### Pitfall 3: Service-worker StaleWhileRevalidate for navigations re-introduces the auth-leak class that #381 reverted

**Severity:** high
**Affected backlog item:** SW navigation strategy upgrade (`NetworkFirst` → `StaleWhileRevalidate`).

**What goes wrong:**
The reverted-by-#381 design is well-documented in `app/sw.ts` lines 319-342. The cookie-aware `authPartitionPlugin` exists, but it only partitions the **cache key**, not the **HTTP response body**. SWR returns the cached body first, then revalidates in the background. If User A's HTML for `/lounge` was cached against their `sub` claim, then User A signs out and User B signs in on the same device, the new auth cookie produces a **different cache key** → cache miss → fresh fetch — fine. BUT: if the SW serves a stale entry to a not-yet-revalidated tab during the auth transition, or if any navigation has the cookie partition computed BEFORE the sign-out fully propagates, the wrong user's HTML can paint for one frame. Phase-1 streamed shell-with-data means that one frame contains rendered private state (humidor counts, profile name).

Secondary trap: post-deploy stale-chunk regression — the comment block at `app/sw.ts` lines 319-342 explains it: SWR returned cached HTML embedding chunk URLs (`/_next/static/chunks/...HASH.js`) that no longer existed on origin after a deploy, causing the indefinite white screen the three watchdogs were built to catch. The `stale-chunk-recovery.ts` script catches it *reactively* (cache-bust + reload) with a visible flash. Re-introducing SWR multiplies the rate at which that flash happens.

**Detection:**
- Add a Playwright test that signs in as User A, navigates `/humidor`, signs out, signs in as User B, navigates `/humidor` again with `await page.context().clearCookies()` between → assert User A's email/avatar is NEVER in the DOM at any point. The test must run with the SW registered (use a `webServerCommand` that builds prod, not the dev SW disable).
- Sentry mark `ae:chunk-load-error` rate per deploy — if SWR is enabled and this fires >5×/deploy, the staleness window is widening.
- Manually: deploy → keep an old tab open → navigate within the PWA → if a route 404s on a chunk, SWR is the cause.

**Avoidance:**
Do not swap to SWR as a "one-line strategy flip". The ship-shape for this work is:
1. Land a deploy-time cache-bust mechanism (postMessage `SW_UPDATED` already exists at `app/sw.ts:400-411` — pair it with a client-side `caches.delete("navigations")` on `SW_UPDATED` so old HTML can't be served against a new chunk manifest).
2. Add the Playwright SWR + auth-transition regression test ABOVE the strategy swap PR. Test must fail on `NetworkFirst → StaleWhileRevalidate` without the cache-bust step, pass with it.
3. Cap the navigations-cache `maxAgeSeconds` from the current 7 days down to something deploy-cadence-aware (Vercel deploys are minutes — even 1 hour kills the worst staleness).
4. Keep `NetworkFirst` as a feature-flagged fallback (env var or build flag) so a regression rolls back without a revert PR.

---

### Pitfall 4: Service-role bypass call sites multiply (11 → 30 in 13 days) without an audit gate

**Severity:** high
**Affected backlog item:** Re-audit ~19 new `createServiceClient()` call sites added since 2026-05-06.

**What goes wrong:**
`createServiceClient()` bypasses Postgres RLS. The codebase has 21 call sites across `app/` and `lib/` today (verified via `grep`: vision/analyze, youtube/sync, admin/submissions, admin/page, avatar, cigar-image, cron/aging-ready, news/sync, cron/push-retry, upload/image, stripe/webhook, lib/cron-log, lib/push). Every site must validate the caller (auth + ownership) BEFORE constructing the service client — otherwise RLS is just decoration. The 2026-05-06 audit memo verified all 11 sites in that snapshot were clean; growth to ~30 within two weeks means roughly 19 unverified sites. The risk class is **unauthorized read/write to any user's data** via a route that takes a `user_id` from the request body instead of from the verified session.

**Detection:**
- Re-run the documented audit method (`project_service_client_audit_2026-05-06.md`): for each call site, verify (a) `getServerUser()` runs first, returns 401 on null, and (b) every `.from(...).eq("user_id", X)` uses the verified `user.id` from step (a), NOT a request-supplied id.
- Add a `grep` precommit / CI gate: `git diff --name-only main...HEAD | xargs grep -l 'createServiceClient' | xargs grep -L 'getServerUser\|x-sync-secret\|x-cron-secret\|CRON_SECRET'` — any match means a new service-role call site without a recognized auth path landed.
- Sentry tag: instrument `createServiceClient()` itself to capture `Sentry.setTag("service_role_call", "<route>")` in dev — query the dashboard after a stress-click to see which routes invoke it.

**Avoidance:**
Wrap `createServiceClient()` in a `mustBeAuthorized()` helper that takes a `userId` argument and an explicit reason. Make the helper the only constructor; deprecate direct import. Pattern:
```ts
export function createServiceClientFor(
  callerId: string,
  reason: "webhook" | "cron" | "admin" | "self",
) {
  // Logs reason; rejects construction with logging if callerId is the empty string.
  return supabaseAdminInternal();
}
```
Every call site now declares why it's bypassing RLS, and a `grep` finds every "self" route — those are the high-risk ones (caller bypasses RLS on their own behalf, must re-check ownership in subsequent queries).

---

### Pitfall 5: Outbox photo-upload multipart fix introduces blob-cleanup leaks and quota errors on iOS

**Severity:** high
**Affected backlog item:** Multipart in outbox — photo uploads currently can't queue offline.

**What goes wrong:**
`lib/offline-outbox.ts` deliberately rejects multipart bodies today (`Body must be JSON-serializable text or null. multipart/form-data bodies (file uploads) are NOT supported in v1`). The "right" fix is storing the `Blob` in IndexedDB and reconstituting a `FormData` at replay time. Three traps:
1. **iOS Safari IDB quota:** iOS imposes a hard ~1 GB cap on origin storage AND aggressively evicts data when storage pressure hits. A 5 MB cigar photo × 30 queued posts = 150 MB; combined with the existing Serwist precache + image cache, eviction can drop the outbox on the floor with no warning. The user thinks their offline burn report uploaded; it's gone.
2. **Blob URL leaks:** `URL.createObjectURL(blob)` is used for preview rendering. If the outbox holds the Blob AND the preview holds a URL ref, the Blob never GC's even after replay succeeds. Multiply by 30+ queued items and the tab grows by hundreds of MB.
3. **EXIF + auth + size pre-check skipped on replay:** the current online path runs through `/api/upload/cigar-image` which validates size and content-type. If the outbox stores the raw bytes and replays them verbatim, a server-side change to those validators silently re-rejects every queued item with no UI to retry.

**Detection:**
- Local: open DevTools → Application → IndexedDB → `ae-offline-outbox` → manually count Blob sizes. If total > 50 MB, your test is exercising the iOS-eviction path.
- Sentry: instrument `enqueueMutation` and `dequeueMutation` to record `outbox.size_bytes`; alert when a single record > 10 MB.
- After replay, log `URL.revokeObjectURL(...)` call counts vs `URL.createObjectURL(...)` counts — any imbalance is a leak.
- Manual iOS test: Safari → Settings → Advanced → Website Data → check storage for the origin grows linearly with queued uploads and DROPS to zero after the OS reclaims storage. Repro: queue 20 photos offline, open 20 other PWAs, come back, queue is gone.

**Avoidance:**
- Store the Blob, but write a **transaction-safe replay** that re-runs the upload validators server-side and surfaces failures in a "review failed uploads" UI (not silent log).
- Hard-cap outbox total bytes at 50 MB. When the cap is hit, refuse the new enqueue and surface a toast: "Upload more photos when you're back online." Don't silently evict the oldest record.
- Pair every `createObjectURL` with a `revokeObjectURL` in a `useEffect` cleanup — this is a generic React rule but matters here because outbox UIs hold previews longer than typical.
- On replay success, delete the record in the **same transaction** as the file-bytes delete. Two-step deletes are where iOS partial writes corrupt the schema.

---

### Pitfall 6: VLM OCR migration replaces a fixed-cost API with a token-billed model — denial-of-wallet risk multiplies

**Severity:** high
**Affected backlog item:** Vision OCR for cigar bands → migrate to VLM (Claude Haiku 4.5 / Gemini Flash via Vercel AI Gateway).

**What goes wrong:**
Today's rate limit (`app/api/vision/analyze/route.ts` lines 100-130) caps users at 30 calls per hour against Google Vision — a per-request flat fee in the low cents. Migrating to a VLM:
1. **Pricing flips from per-call to per-token.** A user uploading a 4 MP photo costs ~1.5 k input tokens at Haiku rates ($0.001-0.003) — fine. A user uploading a *5000×7000* photo of a cluttered humidor shelf in a loop = 10 k tokens × 30 calls × rate-limit reset = ~$30 of wallet, per attacker, per hour.
2. **The existing rate limit was sized for Google Vision pricing.** 30/hour was the threshold for "expensive enough to need limiting, cheap enough not to break the band scanner UX." For a VLM the threshold is dollars, not call counts — need an input-tokens-per-hour budget instead of a call-count budget.
3. **Vercel AI Gateway is a single dependency** for routing to Anthropic/Google. If the gateway is down, the band scanner is dead. The plan retains Google Vision for SAFE_SEARCH — but if both calls share one route, a partial gateway outage degrades both.

**Detection:**
- Sentry metric: `vlm.tokens_in` and `vlm.tokens_out` per user, per route. Alert when a single user crosses 100 k input tokens / hour (~ $0.10 — already 100× more than a Vision call cost).
- Vercel AI Gateway dashboard: monitor cost-per-user vs cost-per-image baseline from Google Vision. If migrating costs more than 3× the Google Vision baseline at p50, the rate-limit needs tightening, not the model swap.
- Synthetic test: send a 24 MB photo to the band scanner with a CSRF-valid session. Verify the route rejects on size BEFORE the token-cost path. Today's route uses Vision's own size cap — the VLM route needs an explicit size cap PRE-VLM-call.

**Avoidance:**
- Hard pre-checks BEFORE the VLM call: max image dimensions (1024 × 1024 — VLM accuracy plateaus there for OCR), max file size (2 MB after client-side resize), client-side resize required (today's pattern in `components/scanners/`).
- Two-bucket rate limit: short-window call count (existing 30/hour) AND long-window token budget (e.g. 200 k input tokens / 24 h per user). Both must trip the 429.
- Cost cap at the AI Gateway level — Vercel exposes per-key cost limits; set a hard daily ceiling that fails the route with 503 well before the prod budget is exhausted.
- Keep the Google Vision route alive in a feature flag for at least 30 days post-migration. Roll back on a single line, not a deploy.

---

### Pitfall 7: Cron auth via `CRON_SECRET` fails open if Vercel ever strips the header (and silently)

**Severity:** medium
**Affected backlog item:** CI bundle/lint gates AND staging environment (both reduce blast radius of this class).

**What goes wrong:**
`vercel.json` declares 4 cron paths; `proxy.ts` line 18 explicitly allowlists `/api/cron` from auth. Header-based auth (`Authorization: Bearer ${CRON_SECRET}`) is the only gate. Failure modes:
1. **Header stripped by Vercel-side edge config / `headers()` rule:** Add a `headers()` rule in `next.config.ts` that overwrites incoming `Authorization` for a different route — Vercel's matcher can match `/api/cron/*` if the source is `/api/(.*)`. The cron then gets no Authorization header, returns 401 — but Vercel's cron retry logic does NOT alert; the cron just stops running. You notice a week later when aging notifications stop firing.
2. **Empty `CRON_SECRET` in production:** Concerns audit confirmed `cronSecret && auth === ...` fails closed (returns 401), not open. But Vercel's "Production / Preview / Development" env split means a copy-paste of secrets without checking which environments inherit can leave Production unset.
3. **The dev-only `vercel-cron/` UA fallback** in `app/api/cron/*/route.ts` is gated by `process.env.NODE_ENV !== "production"` — but Vercel Preview deploys run with `NODE_ENV === "production"`. Good. But Edge runtime sometimes sets `NODE_ENV` to `"development"` in older Next versions for `next dev`. A regression there silently re-opens the UA-spoof bypass.

**Detection:**
- Add a cron-fired log entry (`log.info("cron:run", { path, took })`) on every successful invocation. Sentry breadcrumb queryable by `scope:cron:*`. If the breadcrumb count for a path drops to zero overnight, the cron is dead.
- Vercel dashboard → Cron Jobs → status. Manually check weekly until you have a Sentry alert wired.
- Synthetic: hit `/api/cron/push-retry` from a Preview deploy with `curl -H "Authorization: Bearer <wrong>"`. Must return 401 with no DB side-effect.

**Avoidance:**
- Add a sticky log line `log.info("cron:auth_ok", { ... })` AFTER auth succeeds. The presence/absence of this in Sentry over 24 hours is the canary.
- Vercel env var convention: prefix cron-only secrets with `CRON_` and create the env var at the **project level**, not the team level — surfaces a single-page review.
- Move the cron auth check into a shared helper (`lib/cron-auth.ts`) that throws on missing `CRON_SECRET` in production. Today each route reimplements the check — drift is inevitable.
- Lower the chance that a `headers()` rule eats the Authorization header: keep `next.config.ts`'s `headers()` source patterns as narrow as possible; never match `/(.*)` or `/api/(.*)` for response-header rules.

---

### Pitfall 8: Modal a11y focus-trap implementation breaks iOS Safari's virtual keyboard dismiss + reopens on programmatic focus

**Severity:** medium
**Affected backlog item:** Modal a11y — focus trap (Tab cycling), button-styled backdrops.

**What goes wrong:**
The standard focus-trap pattern (focusin listener + first/last focusable detection + `e.preventDefault()` + `.focus()` on the opposite end) interacts badly with iOS Safari in two ways:
1. **Keyboard re-shows after dismiss.** When the user taps "Done" on the iOS keyboard while inside a sheet, Safari fires a blur on the input. The focus trap detects this, sees the activeElement is now `<body>`, and calls `.focus()` on the first focusable inside the modal. iOS interprets this `.focus()` on an input as "user wants to type" and re-shows the keyboard. The "Done" button is functionally broken.
2. **Sheet drag handle blocks the trap.** The slide-up sheet pattern (`components/humidor/AddCigarSheet.tsx:248-309`) uses a drag handle that's not in the tab order. A trap that cycles "first focusable → last focusable → first focusable" must skip the handle; otherwise tab order has a dead step.
3. **Backdrop focus.** Concerns notes "button-styled backdrops" (Escape-key hook from #328 scaffolded). If the backdrop is a `<button>`, it's the first focusable inside the modal — tab from any field cycles to a visually-invisible (or near-invisible) backdrop button before going to the close button. Screen-reader users hear "button" with no label.

**Detection:**
- Manual iOS test: open sheet → tap input → tap "Done" on iOS keyboard. Must NOT re-open the keyboard. If it does, the focus trap is over-reaching.
- axe-core / pa11y over the modal: scan with the modal open. Backdrop should have `aria-label="Close dialog"` or `role="presentation"` (if it's div-styled). Heading must have an id wired to `aria-labelledby` on the dialog wrapper.
- VoiceOver test (iOS Safari → triple-tap home → VoiceOver): rotor to "Headings" — modal heading must be the first heading announced after the modal opens.

**Avoidance:**
- Use the established libraries' focus traps (`focus-trap-react` or similar) ONLY after auditing their iOS behavior. Their default behaviour assumes a desktop keyboard tab loop, not a virtual keyboard.
- For iOS specifically: detect virtual-keyboard events via `visualViewport` (`window.visualViewport.height` shrinks when the keyboard is up). Disable programmatic `.focus()` on input elements while the visual viewport is < 75% of layout viewport.
- Backdrop NEVER goes in the tab order. Use `<div role="button" aria-label="Close dialog" tabindex="-1">` so click works but tab skips it. Escape key is the keyboard equivalent — already scaffolded in `lib/hooks/use-escape-key.ts`.
- Test rotor-with-VoiceOver before declaring "modal a11y done" — Lighthouse a11y score is necessary but not sufficient.

---

### Pitfall 9: Contrast sweep with axe-core misses translucent overlays + paywall-blur surfaces

**Severity:** medium
**Affected backlog item:** Live axe-core / Lighthouse contrast sweep on real pages.

**What goes wrong:**
The design system uses `--paper-mute` (rgba `F5E6D3` at 0.62 alpha over `#15110b`) and `--paper-dim` (0.55 alpha). axe-core computes contrast by sampling the computed color against the **immediate** background color — not the effective composite when the element sits over a textured / image / blurred-glass surface. Three blind spots:
1. **PaywallGate's 25% opacity preview** (`components/membership/PaywallGate.tsx`): blurred children show through a glass overlay. Any text inside the previewed children renders against a glass + background composite that axe doesn't compute. Real-world contrast can fall below 3:1 for muted labels.
2. **`<Image>` backdrops in lounge feed cards:** Burn-report preview cards show text over a user-uploaded photo as background. Contrast is image-content-dependent; axe-core sees `background: transparent` and skips the check.
3. **Toast border + transparent body:** `Toast` has a 4px amber left border on a near-card surface. If a toast appears OVER an open modal's backdrop (z-60 above z-50), the body color shifts visually and the computed contrast misses.

**Detection:**
- Lighthouse audit on a logged-out preview deploy fails to surface these because they require authenticated sessions to reproduce.
- Manual: open `/lounge` → take screenshot of a burn-report card with a dark-wrapper cigar photo → check contrast of the cigar name overlay in a contrast checker (e.g. WebAIM contrast checker). Aim for AA (4.5:1 normal text, 3:1 large).
- Storybook + axe-core integration only catches isolated component contrast, not page-level composite issues. Run pa11y against authenticated pages with a Playwright `storageState` (the stubbed authenticated test setup is the prerequisite).

**Avoidance:**
- For any text over a user-content image: enforce a gradient scrim (linear-gradient from `rgba(21, 17, 11, 0.85)` at the text region to transparent elsewhere). The scrim becomes the contrast partner, not the image.
- Never rely on `--paper-mute` (0.62 alpha) for primary text — the design system's own rule. Restrict it to secondary metadata. Lint rule candidate: a CSS scanner that flags `color: var(--paper-mute)` on `<p>` or `<h*>` elements.
- PaywallGate previews: blur with `filter: blur(8px) saturate(0.5)` so the preview is clearly UN-readable; do NOT let any of the previewed text approach contrast thresholds because users see partial words and assume the feature is broken.
- Live contrast sweep methodology: Playwright + axe-core on authenticated routes. Capture failures with screenshot + DOM path in the test report. The current 5-test smoke suite + 5 stubs is the prerequisite; this work piggybacks on the auth fixture.

---

### Pitfall 10: `forum_posts` schema dump-then-diff misses ad-hoc Supabase SQL editor changes that altered column defaults / RLS

**Severity:** medium
**Affected backlog item:** `forum_posts` schema drift — dump current schema, diff against migrations.

**What goes wrong:**
The CONCERNS audit identifies the drift: code reads `is_locked`, `is_system`, `smoke_log_id`, `image_url`, `is_pinned` from `forum_posts` (`lib/data/lounge-fetchers.ts:73-79`), but only `20260409_community_feed.sql` and `20260502_forum_posts_cascade_on_user_delete.sql` touch the table. The likely cause is ad-hoc SQL editor changes that added columns directly to prod. Three sub-traps when fixing:
1. **`pg_dump --schema-only` doesn't capture RLS policies in their as-applied form.** If a policy was edited in the SQL editor with different `WITH CHECK` semantics than the migration history, the dump captures the current SQL but not the diff against what the migration files would produce. The fix migration needs to be hand-verified against `pg_policies`.
2. **Column defaults that look "applied" in the table editor weren't from migrations.** `pg_dump` captures them as `DEFAULT ...`, the new migration captures them as `ADD COLUMN ... DEFAULT ...`. Replaying the new migration against a fresh staging DB silently changes the column order in `\d forum_posts` — harmless until a tool relies on column position (rare, but PostgREST select-by-position is one).
3. **Foreign key cascades:** `20260502_forum_posts_cascade_on_user_delete.sql` exists for a reason. Adding new columns / constraints without preserving the cascade semantics regresses the delete-user flow.

**Detection:**
- Two-step verification: (a) `supabase db pull --schema public --use-migra` against prod (or whatever the current toolchain is — Supabase CLI's `db diff` is the canonical surface). (b) Compare the generated migration to the union of files in `supabase/migrations/`. Any DDL in the generated migration that's missing from the union is the drift.
- Cross-check RLS: `select policyname, cmd, qual, with_check from pg_policies where tablename = 'forum_posts';` against prod and against staging-after-replay.
- Run the existing five smoke tests + (once unblocked) the lounge authenticated tests against a staging DB built from the migrations only. If lounge breaks, a column the code expects is missing from migrations.

**Avoidance:**
- Solo-dev convention: ALL schema changes via `supabase/migrations/*.sql`, NEVER via the SQL editor. Memory item should be updated to encode this rule.
- For each drift column found: write the codifying migration with `IF NOT EXISTS` on `ADD COLUMN` so replaying it against prod is a no-op.
- Test the migration against the staging environment (Active backlog item) before merging. Until staging exists, the verification is "deploy to Preview → preview's Supabase IS prod → check `select pg_get_viewdef(...) / pg_dump` BEFORE merging".

---

### Pitfall 11: CI bundle-budget gate creates false positives from third-party-script flux (Stripe, Maps) and locks routine PRs out

**Severity:** medium
**Affected backlog item:** Bundle / lint / Lighthouse gates in CI.

**What goes wrong:**
The naive "compare bundle output to `BUNDLE_BASELINE.md`" gate fails three classes of legitimate PRs:
1. **Third-party-script updates.** `@stripe/stripe-js`, `@googlemaps/js-api-loader`, Sentry SDK — each ships routine version bumps that change the parent-route chunk by 5-30 KB. A `±5%` budget breaks on the next Dependabot update.
2. **Server-component vs client-component balance.** Moving code into a server component shrinks the client bundle. The bundle gate sees only the client side and reports a "win" — but it's a false win if the server work now blocks LCP.
3. **Locale / chunking changes from Turbopack.** Next 16 with Turbopack-as-default (`version-16.md` lines 114-128) can re-split chunks on minor compiler changes. Same source code, different chunk graph, different sizes. A gate that's strict on per-chunk size flags this; a gate on total-page-weight doesn't.

**Detection:**
- Watch the first 3-5 CI runs after enabling the gate. If >30% of PRs fail the budget for non-bundle reasons, the threshold is too tight.
- Compare `npm run analyze` output between merge-base and HEAD: total weight, per-route weight, per-chunk weight. The three must move in the same direction to trust the verdict.

**Avoidance:**
- Gate on TWO axes: total-page-weight (JS + CSS, post-compression) AND first-load JS (Next's reported number per route). Use `±10%` not `±5%`. Stripe + Maps SDKs justify this slack.
- Pin third-party versions explicitly so a Dependabot bump is its own PR with a justified budget bump. The bundle baseline updates in the same commit as the SDK version.
- Treat the gate as advisory for the first 2 weeks (post-results to PR as a comment, don't block merge). After enough false-positive data is in hand, ratchet to enforcement.
- ABSOLUTELY do NOT compare against the merged baseline file. Compare against the `main`-branch CI artifact produced from the same git SHA's `next build` — that controls for Turbopack non-determinism.

---

### Pitfall 12: Lint-debt cleanup PRs accidentally land behavior changes by inferring `any` → wrong type

**Severity:** medium
**Affected backlog item:** Lint debt cleanup — 63 pre-existing `no-explicit-any` errors.

**What goes wrong:**
Replacing `: any` with a real type is a "refactor" in name but a "behavior change" in practice when the inferred type is wrong:
1. **Supabase query results.** `lib/data/humidor-fetchers.ts` uses `as unknown as HumidorItem[]` (CONVENTIONS line 60). A naive lint fix replaces `(data as any).cigar_id` with `(data as HumidorItem).cigar_id`, but if `HumidorItem.cigar_id` is `string` and the actual data sometimes returns `null` (orphan rows post-delete), the runtime fails silently — typechecker says "OK", undefined-deref crashes the page.
2. **Event handler types.** `(e: any) => ...` → `(e: React.MouseEvent) => ...` looks right but the call site might pass `KeyboardEvent`. The Tailwind/React event-target widening pattern is one of the noisiest sources of `any` in this codebase.
3. **Third-party untyped libs.** Web Push, parts of Stripe webhook payload. Replacing `any` with a hand-built interface invariably misses optional fields that the API can return — `WebPushError | undefined` is the safe pattern, but lint-debt PRs tend to pick the cleanest-looking shape.

**Detection:**
- Every lint-debt PR must run the existing 5 smoke + (once unblocked) authenticated suite. Currently CI is typecheck-only — `next build` passing is NOT proof the lint fix didn't break runtime behavior.
- For each `any` removal, the diff should also touch a test OR the PR description must explain why the type is safe (e.g. "value is always present because the upstream `getServerUser()` returns 401 on null").
- Sentry: after lint-debt PRs land, watch for an uptick in `TypeError: Cannot read property '...' of undefined` — that's an inferred type that missed nullability.

**Avoidance:**
- Lint-debt PRs limited to **5-10 fixes each**, scoped to one feature directory. Bundled cleanups are the explicit anti-pattern per `CLAUDE.md` engineering principles.
- For each fix: prefer narrower types — `unknown` + a narrowing guard is safer than a hand-built interface. `Record<string, unknown>` is fine for opaque payloads where only specific keys are read.
- Land the Playwright authenticated fixture (`TEST_USER_EMAIL` + `TEST_USER_PASSWORD` per TESTING.md lines 105-111) BEFORE the bulk of lint-debt PRs. Smoke tests catch landing-page regressions; authenticated tests catch the data-shape regressions that lint-debt creates.
- Sequence: enable `npm run lint` in CI **after** the 63 errors are cleared, not before. A "fix-as-you-go" rule for new code creates the same drift the pre-existing 63 errors document.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|---|---|---|---|
| Watchdog scripts masking root cause (stale-chunk recovery, hydration watchdog, auth timeout) | Production hangs become recoverable | Root cause never surfaces; new failure modes pile under the watchdogs; each watchdog adds bundle weight + a path that itself can fail | **Already in tree.** Acceptable until a single mark fires in production with a reproducer. Then root-cause that path and remove the watchdog. New watchdogs not acceptable — instrument and fix instead. |
| Inline `interface` over generated Supabase types | Zero generation step; works today | Schema drift (see `forum_posts`) is silent at compile time | Acceptable while solo-dev. When second contributor joins, regenerate types via `supabase gen types typescript` as a one-shot. |
| `as unknown as Foo` casts at Supabase boundary | Bypasses awkward generated select types | Hides nullability + drift | Acceptable for narrowly-scoped pages. NOT acceptable for shared `lib/data/*` fetchers — those need real runtime validation (zod-lite). |
| `console.error` instead of `lib/log.ts` `log.error` | Faster to write | Loses scope tags + Sentry queryability | Acceptable for one-off debugging that doesn't ship. NOT acceptable in committed code — use `log.error` going forward (existing call sites stay per CONVENTIONS line 125). |
| `unstable_cache` over `'use cache'` | Works today; per-file migration not blocking | Falls behind Next's caching surface; future Next versions may sunset it | Acceptable through the Cache Components migration window. Plan the cutover with the version-16 codemod. |
| Single Supabase project (no staging) | $0 setup cost | Every destructive migration is a production migration | Acceptable while solo-dev + low traffic. Becomes unacceptable the first time a migration needs a dry-run (likely the `forum_posts` codifying migration). |
| Service-role bypass without a wrapper helper | Direct + fast to write | Audit burden scales with call-site count (now 30) | NOT acceptable past 30 sites. Wrap in `createServiceClientFor(callerId, reason)` before adding the 31st site. |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|---|---|---|
| Next 16 Cache Components | Enabling `cacheComponents: true` and migrating data fetches in the same PR | Two PRs: (1) enable flag + fix every `Uncached data` build error with `<Suspense>` or `'use cache'` (2) optimize cache lifetimes per route |
| Nonce-based CSP | Setting nonce in `proxy.ts` AND keeping `Content-Security-Policy-Report-Only` header in `next.config.ts` — both fire, only one is enforced | Single source: nonce flow in `proxy.ts` writes both headers (Report-Only off in `next.config.ts` once nonce ships) |
| Serwist SW navigation cache | Trusting `authPartitionPlugin` to prevent cross-user leaks across the full lifecycle | Plugin partitions cache key, NOT response delivery during the auth-transition. Add `caches.delete("navigations")` on sign-out client-side |
| Supabase service-role | Calling `createServiceClient()` first, validating user identity second | Validate `getServerUser()` first; only construct service client after auth + ownership pass |
| Vercel AI Gateway (VLM migration) | Sharing one provider config for OCR (Haiku) and moderation (Vision SAFE_SEARCH) | Separate routes per concern. Gateway outage takes down one feature, not the band scanner whole-cloth |
| Vercel cron | Trusting cron-job dashboard alone to confirm runs | Add `log.info("cron:run", {scope, took})` per invocation; alert in Sentry on absence over a window |
| Web Push (PWA) | Calling `pushManager.subscribe()` before SW is `ready` | Always `await navigator.serviceWorker.ready` first; iOS 16.4+ requires the SW to be controlling the page before `subscribe()` resolves |
| iOS Safari standalone PWA | Using `window.location.reload()` to recover from hang | iOS PWA standalone mode loses session state on reload more aggressively than Chrome. Combine with Supabase session persistence check |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|---|---|---|---|
| Nonce CSP disabling PPR | Vercel Speed Insights LCP regression on prerendered routes; build summary shows fewer `○` routes | Use SRI experimental flag instead, OR scope nonce flow to authenticated routes only | Immediately on first enforced-CSP deploy |
| Cache Components forcing edge → Node | Function invocation duration up 100-300 ms on `/home`, `/humidor` | Audit `runtime = "edge"` exports; choose per-route either Node migration or excluding the route from Cache Components | On the build after `cacheComponents: true` lands |
| SW SWR navigation caching post-deploy | `ae:chunk-load-error` mark rate > 5×/deploy in Sentry | Cache-bust navigations on `SW_UPDATED` postMessage; cap `maxAgeSeconds` to deploy cadence | First deploy after SWR strategy lands |
| Outbox blob accumulation | iOS Safari tab memory >300 MB; quota errors in `enqueueMutation` | Hard 50 MB cap; pair `createObjectURL` with `revokeObjectURL`; surface "queue full" toast | Around 10-15 photo uploads queued offline |
| VLM token-cost runaway | Anthropic / Vercel AI Gateway cost spike for a single user | Two-bucket rate limit (calls + tokens); pre-VLM size cap | First time a user iterates on a humidor-shelf photo |
| Lint-debt PR runtime regression | Sentry `TypeError: Cannot read property '...' of undefined` post-merge | Bundle small (5-10 fixes); Playwright auth fixture must exist | Whenever an `any` was masking a real nullable type |

## Security Mistakes

| Mistake | Risk | Prevention |
|---|---|---|
| Adding a new `createServiceClient()` call site without ownership check | Cross-user data read/write | Wrapper helper `createServiceClientFor(callerId, reason)` becomes the only constructor |
| Trusting `x-ae-user-id` header on routes that bypass `proxy.ts` | Header spoofing — these are forwarded by proxy, but if an API runs in a runtime that skips proxy.ts (e.g. a future Edge Function), the spoof works | Validate every route's runtime against the proxy matcher; `proxy.ts:208` excludes `_next/static`, `monitoring`, manifest — keep that list narrow |
| CSP enforce without re-running the test suite against the prod build | Reverts like #326 → "Connection closed" prod outage | Build prod locally with `next build && next start`, click through all major flows, watch for CSP violations in DevTools before deploy |
| VLM call accepting user-supplied prompt text | Prompt injection → exfiltrate the system prompt / abuse the model for unintended tasks | Strict template: server controls the system prompt; user content is the IMAGE only. No user-supplied text into the prompt. |
| Outbox blob containing sensitive content (private burn report text) accessible to non-signed-in user on shared device | Leak across sign-out | `clearMutationsExceptUser` runs on auth state change (already implemented in `OutboxManager`). Multipart fix must preserve this. |
| Forum post drift letting a `forum_posts` insert miss RLS check | Posting as another user | Codifying migration re-asserts `enable row level security` and recreates policies with explicit `with check (user_id = auth.uid())` |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---|---|---|
| Service-worker update flash | User sees a momentary white flash + reload during deploys | `SW_UPDATED` postMessage → non-blocking "Update available" toast → user-initiated reload at a good moment (already partially scaffolded at `app/sw.ts:400-411`) |
| Outbox silent-replay-fail | User thinks burn report posted; it didn't | Persistent "1 failed upload — review" badge in nav; never silent-fail |
| Modal focus trap with iOS keyboard | "Done" button on iOS keyboard doesn't dismiss | Detect virtual keyboard via `visualViewport`; disable programmatic re-focus while keyboard is up |
| Contrast issues over user-content imagery | Burn-report cards in lounge feed have unreadable cigar names against dark wrapper photos | Gradient scrim layer between image and text — independent of axe-core verdict |
| Onboarding bottom-nav leak | New users see app chrome before completing onboarding — breaks brand intent | Move `onboarding/page.tsx` out of `(app)` route group OR conditionally hide nav in `(app)/layout.tsx` (Active backlog item) |
| Install-prompt fatigue (iOS Add-to-Home-Screen banner) | Returning users see prompt repeatedly | Track `display-mode: standalone` and a localStorage "install-dismissed" flag together — never show twice in same session, never to already-installed users |
| Push notification permission request on first visit | Users hit "Block" reflexively; permission is unrecoverable | Defer prompt until user has used the app for a session OR triggered a notify-worthy action (aging alert opt-in, e.g.) |

## "Looks Done But Isn't" Checklist

- [ ] **CSP nonce enforced:** verify `view-source:` on a production page shows `nonce=...` on every `<script>`, `Sentry.captureMessage` shows zero CSP violation events for 7 days, Speed Insights LCP not regressed >10%.
- [ ] **Cache Components migrated:** verify `npm run build` summary shows expected static/dynamic counts, every Edge route is intentionally Node-migrated or excluded, no `Uncached data was accessed outside of <Suspense>` errors.
- [ ] **SW StaleWhileRevalidate enabled:** verify Playwright auth-transition test passes with SWR enabled, `ae:chunk-load-error` Sentry mark rate per deploy < 1 per 1k sessions, `navigations` cache `maxAgeSeconds` ≤ 3600.
- [ ] **Outbox multipart:** verify Blob bytes round-trip through IDB on iOS Safari standalone PWA, hard 50 MB cap enforced with toast, blob URLs revoked on replay-success.
- [ ] **VLM OCR migrated:** verify token-budget rate limit active in addition to call-count limit, pre-VLM size cap rejects oversized images, Google Vision SAFE_SEARCH still wired, cost-per-OCR-call ≤ 3× Google Vision baseline.
- [ ] **Service-role re-audit:** verify each of the ~30 call sites has explicit `getServerUser()` or cron-secret check before service-client construction, and ownership check on every subsequent `.eq("user_id", ...)`.
- [ ] **CI bundle gate:** verify gate produces non-noisy results across 5 consecutive PRs before enforcing, advisory-only for first 2 weeks.
- [ ] **Lint clean + enforced:** verify all 63 `no-explicit-any` errors resolved with narrower types (not bulk `as unknown`), Playwright auth fixture available, no Sentry `TypeError` spike post-merge.
- [ ] **Modal a11y:** verify iOS Safari "Done" button on virtual keyboard dismisses cleanly, focus trap skips backdrop button, axe-core + VoiceOver rotor pass.
- [ ] **Contrast sweep:** verify pa11y/axe runs on authenticated routes, image-overlay text has gradient scrim, `--paper-mute` restricted to secondary metadata.
- [ ] **`forum_posts` schema:** verify `supabase db pull` against prod produces ONLY changes that are also in the codified migration; replaying migrations against staging matches prod schema and RLS policy by policy.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---|---|---|
| Nonce CSP regressed LCP > 20% | LOW | Set `Content-Security-Policy` back to `Content-Security-Policy-Report-Only` in proxy response; deploy. Revert PR if needed. SRI as alternate path. |
| Cache Components build broken | MEDIUM | Revert `cacheComponents: true` in `next.config.ts` — codemod-removed `unstable_` prefixes (`unstable_cache` etc.) need to be re-added if the codemod ran. Keep that diff small. |
| SW SWR auth leak in production | HIGH | Force SW unregister via emergency post-deploy script + `Clear-Site-Data: "cache","cookies","storage"` response header on `/` once. Users lose session, re-login. Roll back SW to NetworkFirst in next deploy. |
| Outbox quota loss on iOS | MEDIUM (data loss to user, not platform) | Surface persistent failure badge; expose "export queue as JSON" so user can resubmit via web. Add per-record durability check at enqueue time going forward. |
| VLM cost spike | LOW (cap stops it) | Vercel AI Gateway daily cap halts route. Set route to 503 with retry-after. Reduce hourly rate limit, deploy, re-enable. |
| Service-role bypass exploit | HIGH | Disable affected route immediately (return 503 via `next.config.ts` headers rule). Rotate `SUPABASE_SERVICE_ROLE_KEY`. Audit logs in Supabase dashboard for last 30 days. Patch route. |
| Cron silently dead | LOW (latent, not user-visible immediately) | Vercel dashboard → re-trigger cron manually; verify env vars; deploy fix; backfill missed runs by running the cron script with a `since=<date>` flag (build the flag if it doesn't exist). |
| Forum schema drift caused production write failure | MEDIUM | Open the SQL editor, hand-apply the missing column with `IF NOT EXISTS`. Codify in a migration file in the same PR. |

## Pitfall-to-Backlog Mapping

| Pitfall | Backlog item | Verification |
|---|---|---|
| #1 Nonce-CSP kills PPR | CSP enforcement | `next build` summary diff before/after; Speed Insights LCP unchanged ±10% |
| #2 Cache Components forces Node + breaks route handlers | `unstable_cache` → Cache Components migration | All `runtime = "edge"` routes audited; no `Uncached data` build errors |
| #3 SW SWR auth leak | SW navigation strategy upgrade | Playwright auth-transition test exists and passes; `ae:chunk-load-error` mark rate ≤ baseline |
| #4 Service-role call-site growth | Re-audit ~19 new `createServiceClient()` sites | Wrapper helper exists OR audit memo updated with all sites verified |
| #5 Outbox multipart leak/quota | Outbox + IDB BackgroundSync extension AND multipart in outbox | 50 MB cap enforced; iOS standalone PWA round-trip test |
| #6 VLM token denial-of-wallet | Vision OCR → VLM migration | Token-budget rate limit + pre-call size cap; AI Gateway daily cap set |
| #7 Cron auth silent fail | (Operational; touches CI bundle/lint gate work indirectly) | `cron:auth_ok` log in Sentry; weekly canary check |
| #8 Modal a11y iOS focus issues | Modal a11y | Manual iOS "Done" dismiss test; VoiceOver rotor pass |
| #9 Contrast sweep missing composites | Live axe-core / Lighthouse contrast sweep | Authenticated pa11y run; gradient scrims on image overlays |
| #10 forum_posts schema drift toolchain | `forum_posts` schema drift fix | `supabase db pull` produces no diff vs codified migrations; RLS policies match prod |
| #11 CI bundle false positives | Bundle / lint / Lighthouse gates in CI | 2-week advisory window; false-positive rate < 30% before enforcement |
| #12 Lint-debt type regression | Lint debt cleanup | Authenticated Playwright fixture exists; no Sentry `TypeError` spike post-merge |

## Sources

- `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` (HIGH — official Next 16 docs shipped with the installed version)
- `node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md` (HIGH — official Next 16 docs shipped with the installed version)
- `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md` (HIGH — Cache Components reference)
- `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` (HIGH — Next 16 upgrade reference)
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_cache.md` (HIGH — explicit "replaced by `use cache` in Next.js 16" note)
- `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` (HIGH — Next 16 PWA guide; SW registration, push, iOS install instructions)
- `.planning/codebase/CONCERNS.md` (HIGH — verified ground truth as of 2026-05-18)
- `.planning/codebase/CONVENTIONS.md` (HIGH — verified ground truth as of 2026-05-18)
- `.planning/codebase/TESTING.md` (HIGH — verified ground truth as of 2026-05-18)
- `.planning/PROJECT.md` (HIGH — current backlog and prior-work context)
- Repo files: `proxy.ts`, `app/sw.ts`, `lib/offline-outbox.ts`, `vercel.json`, `app/api/cron/*`, `utils/supabase/service.ts`, `grep` of `createServiceClient` call sites (HIGH — direct file inspection)
- Memory: `project_csp_nonce_required.md`, `project_service_client_audit_2026-05-06.md`, `project_phase4_denormalization_skipped_2026-05-06.md` (MEDIUM — point-in-time memos, reconciled against codebase docs above)
- Web search **not used** — WebSearch permission denied this session. Claims about iOS Safari behavior, Vercel platform behavior, and VLM pricing are MEDIUM confidence (general PWA + platform knowledge, no live source check). Flag for re-verification when production rollout of any affected item is on deck.

---
*Pitfalls research for: Ash & Ember Society — subsequent milestone (Cache Components / CSP / SW / outbox / VLM / a11y / CI / lint / schema work)*
*Researched: 2026-05-19*
