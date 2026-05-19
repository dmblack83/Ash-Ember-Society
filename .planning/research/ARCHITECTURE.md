# Architecture Research

**Domain:** premium mobile-first PWA for cigar enthusiasts (Next.js 16 App Router + Supabase + Stripe on Vercel)
**Researched:** 2026-05-19
**Confidence:** HIGH (Context7 verified for Next.js CSP, Serwist BackgroundSync, AI SDK Gateway); MEDIUM for item 4 (no canonical "diagnose unknown PWA hang" pattern exists — synthesized from primitives)

## Scope Statement — What This Doc Is NOT

This is **not** a re-documentation of the current architecture. `.planning/codebase/ARCHITECTURE.md`, `INTEGRATIONS.md`, and `CONCERNS.md` are the ground-truth descriptions of what ships today. This document covers the **five forward-looking architectural items** flagged in `CONCERNS.md` that need design decisions before the next milestone phases. For each: canonical pattern, integration points with existing files, load-bearing risks, and dependency ordering.

---

## Item Summary (For The Roadmapper)

| # | Item | Risk | Ships Independently? | Depends On | Suggested Phase Order |
|---|------|------|----------------------|------------|------------------------|
| 1 | CSP nonce enforcement | **HIGH** | No — touches `proxy.ts` (hottest file) + every server component that renders inline `<Script>`/inline-style | Item 4 watchdogs stay in place; nonces interact with the 3 hashed inline scripts | First — security blocker, isolatable |
| 2 | SW StaleWhileRevalidate + cookie-aware navigation cache | MEDIUM | Yes — scoped to `app/sw.ts` | Stale-chunk recovery (#288) must stay armed (mitigates the same risk that reverted SWR in PR #271) | After Item 1 (independent surfaces; safer to land second so CSP enforcement settles first) |
| 3 | Outbox v2 (Serwist `BackgroundSyncPlugin` + multipart File support) | MEDIUM | Yes — `lib/offline-outbox.ts`, `app/sw.ts` outbox section, three call sites | None — but supersedes the bespoke outbox in v1; cutover requires migration of in-flight queued records | After Item 2 (both touch `app/sw.ts`; serialize to avoid merge conflicts) |
| 4 | PWA-hang diagnostic architecture | MEDIUM | Yes — pure additive instrumentation | None — but informs whether watchdogs in Item 1/2 stay or get retired | Parallel with Item 1 (independent file surface; pure observability) |
| 5 | VLM band-OCR via Vercel AI Gateway | LOW | Yes — `app/api/vision/analyze/route.ts` is the entire blast radius | Existing Vision Safe Search stays; only TEXT_DETECTION path migrates | Anytime — fully decoupled |

**Parallelism note:** Items 1+4 can run in parallel (different files). Items 2+3 share `app/sw.ts` and must serialize. Item 5 is fully independent.

---

## Item 1: CSP Nonce-Based Enforcement (Next.js 16)

### Canonical Pattern (Context7-verified — Next 16 docs)

From `vercel/next.js/docs/01-app/02-guides/content-security-policy.mdx`. The exact pattern Next 16 ships:

```typescript
// proxy.ts
const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
const cspHeader = `
  script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''};
  style-src 'self' 'nonce-${nonce}';
  ...
`
requestHeaders.set('x-nonce', nonce)
requestHeaders.set('Content-Security-Policy', cspHeader)
```

Then in server components: `const nonce = (await headers()).get('x-nonce')` and pass to `<Script nonce={nonce}>`.

Key directive: `'strict-dynamic'`. It tells the browser "any script loaded by a nonce-allowed script is also trusted." This is what unblocks Next 16 RSC Flight payloads — the per-request inline `<script>` tags carry the nonce, and any chunk they load inherits trust. The previous failed approach (PR #326) pinned `script-src` to three SHA-256 hashes, which Flight scripts could never match because their bodies are generated per request.

### Integration Points (concrete file map)

**Generate nonce → write CSP header:** `proxy.ts`
- Add nonce generation after the cookie-strip / before `Promise.race` (`proxy.ts:42-117`).
- Set `x-nonce` on `forwardHeaders` alongside the existing `x-ae-*` headers (`proxy.ts:184-190`). Existing pattern already proves request-scoped header forwarding works.
- Build the CSP string with `${nonce}` interpolated. Move CSP construction out of `next.config.ts:48-62` (static string) into the proxy because it must vary per request. The static `headers()` config in `next.config.ts:async headers()` keeps the non-varying security headers (HSTS, X-Frame-Options, Permissions-Policy, etc.) but drops `Content-Security-Policy*`.
- Return the CSP on the response (already partially set today via `next.config.ts` — switch to proxy-set).

**Read nonce → pass to layout/scripts:** `app/layout.tsx`
- Today: imports `STALE_CHUNK_RECOVERY_SCRIPT`, `COLD_SMOKE_INIT_SCRIPT`, `HYDRATION_WATCHDOG_SCRIPT` from `components/system/` and `components/cold-open-smoke/`, renders them as `<script dangerouslySetInnerHTML={{__html: SCRIPT}} />` (hashes computed in `next.config.ts:22-26`).
- Migration: read `headers().get('x-nonce')`, pass `nonce={nonce}` to the three inline script tags. Drop `SCRIPT_HASHES` from `next.config.ts` entirely.
- Vercel Speed Insights component (`<SpeedInsights />` at `app/layout.tsx:237`) and any other client lib that emits its own inline script may need its `nonce` prop wired through.

**Third-party iframes/scripts** (no migration needed — they're loaded via `<iframe>`/`<script src=...>`, not inline; `script-src 'self' 'nonce-...' 'strict-dynamic'` covers them because the loading script carries the nonce). Verify:
- Stripe.js (loaded via `@stripe/stripe-js` from a client component) → loads its iframe; `frame-src` already allowlists `js.stripe.com`.
- Google Maps link-out is anchor-only today; no script.
- Sentry tunnel (`/monitoring`) is `connect-src`, not `script-src`.

### Risks (load-bearing)

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Edge runtime support for `Buffer.from(...).toString('base64')`** — Edge runtime lacks Node `Buffer`. Use `btoa(crypto.randomUUID())` or `Uint8Array → base64` instead | HIGH | `proxy.ts` runs on Edge (`runtime = "edge"` is the default for Next 16 middleware/proxy). Verify the chosen encoding works in Edge before shipping. |
| **`'strict-dynamic'` ignores host allowlists** — the existing `script-src 'self'` becomes effectively meaningless once `'strict-dynamic'` is in. Acceptable because any script must trace back to a nonce-tagged loader, but it's a different threat model than "host allowlist" | MEDIUM | Document the change; matches the published Next 16 guide. |
| **Service worker registration** — `navigator.serviceWorker.register("/sw.js")` is called from a client component (`components/ui/RegisterServiceWorker.tsx`). The SW itself doesn't run inline scripts; CSP doesn't apply inside the SW context. No change needed. | LOW | Verify SW registration still works under enforce. |
| **`unstable_cache` + nonce** — pages cached at the edge would serve the same nonce to multiple users, violating per-request uniqueness. `cookies()` and `headers()` are dynamic APIs so this is already enforced, but any future caching of the root layout would be a footgun. | MEDIUM | Document: root layout (which reads `x-nonce`) MUST stay dynamic. Add a comment in `app/layout.tsx`. |
| **Style-src nonces** — Tailwind v4 + inline React `style={{}}` props currently rely on `'unsafe-inline'` (`next.config.ts:51`). Nonce-ing styles is invasive (every style prop would need transformation). Keep `'unsafe-inline'` for `style-src`; nonce only `script-src`. The Next 16 guide implies nonce-ing both but acknowledges the tradeoff. | LOW | Accept current `style-src 'unsafe-inline'`. XSS in CSS is a much lower threat than XSS in script. |
| **`/monitoring` tunnel-route + CSP** — Sentry events POST to the tunnel; this is `connect-src` (already allowed). The browser-side Sentry SDK init script is bundled via `@sentry/nextjs`, not inline, so the nonce path doesn't affect it. | LOW | Already covered. |
| **Inline `<style>` in `<head>` from Next** — Next emits some `<style>` tags for critical CSS. Tagged with `data-emotion` / `data-precedence` — they fall under `style-src 'unsafe-inline'`. | LOW | Already permitted by the current style-src directive. |

### Contracts Between Components

- **`proxy.ts` → `app/layout.tsx`**: `x-nonce` request header (per-request UUID, base64). Both must agree on the header name. Document the constant — recommend a shared `lib/csp.ts` with `NONCE_HEADER = "x-nonce"` exported.
- **`proxy.ts` → response**: `Content-Security-Policy` header with the nonce string interpolated. Static directives stay in `next.config.ts:async headers()`.
- **`app/layout.tsx` → inline scripts**: pass `nonce` prop directly to the three watchdog `<script>` tags. The three script-body constants in `components/system/` and `components/cold-open-smoke/` stay unchanged.

### Sequencing

1. **Land nonce generation** in proxy (gated by env flag `CSP_MODE=enforce|report`). Default to `report` initially.
2. **Wire nonce through layout** so Flight scripts carry it. Verify in `Content-Security-Policy-Report-Only` mode that zero violations fire.
3. **Flip flag** to enforce. Watch Sentry for `securitypolicyviolation` events (existing listener in `instrumentation-client.ts:54-82`).
4. **Remove `SCRIPT_HASHES`** from `next.config.ts` after a stable enforce window.

---

## Item 2: SW StaleWhileRevalidate for Navigation + Cookie-Aware Cache Keys

### Canonical Pattern (Context7-verified — Serwist docs)

From `serwist.pages.dev/docs/serwist/runtime-caching/caching-strategies`:

```typescript
import { StaleWhileRevalidate } from "serwist";
new StaleWhileRevalidate({
  cacheName: "navigations",
  plugins: [
    authPartitionPlugin,           // already exists at app/sw.ts:165-181
    new CacheableResponsePlugin({ statuses: [0, 200] }),
    new ExpirationPlugin({ ... }),
  ],
})
```

The `authPartitionPlugin` uses `cacheKeyWillBeUsed` to mutate the cache key by appending `#auth=<sha256 of JWT sub claim>` as a URL fragment. Per Serwist docs: "cacheKeyWillBeUsed runs both for read and write... Returning a different Request object changes only the key — the network fetch path uses the ORIGINAL request object." This is exactly what's needed for shared-device safety: User A's cached HTML lives under `key#auth=hashA`; User B's lookup hashes their own cookie and misses.

### Integration Points

**Single file:** `app/sw.ts:343-357` (the navigation route). Change `new NetworkFirst(...)` → `new StaleWhileRevalidate(...)`. The `authPartitionPlugin` block on line 348 stays.

### Risks (load-bearing)

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Stale chunk URLs in cached HTML** — this is exactly why PR #271 reverted from SWR to NetworkFirst. Cached HTML embeds `/_next/static/chunks/...HASH.js` URLs that 404 after deploy → React never hydrates → indefinite white screen. The comment at `app/sw.ts:319-342` is the historical record. | **HIGH** | Two-layer defense: (1) `stale-chunk-recovery.ts` already reactively reloads on chunk 404 — keep this watchdog armed. (2) On SW `activate`, programmatically wipe the `navigations` cache (it's stale by definition after deploy). Pattern: `caches.open("navigations").then(c => c.keys().then(keys => keys.forEach(k => c.delete(k))))` inside the activate handler at `app/sw.ts:400-411`. This trades one extra network round-trip per route after deploy for a guaranteed-fresh cache. |
| **Auth-state transitions** — when a user signs out, their JWT changes; the next navigation request hashes to a different cache key, misses the cache, hits the network. Correct behavior. But the OLD cache entry stays in IDB until expiration (7 days). Storage cost is bounded by `maxEntries: 60`. | LOW | No action needed; ExpirationPlugin handles it. |
| **Cookie change mid-session** — Supabase refreshes auth cookies periodically. The `sub` claim of the JWT is stable across refresh (refresh changes the access token, not the user identity). `authHashForRequest` hashes `sub` specifically, not the raw cookie. Already correct. | LOW | Verify `extractSubClaim` is robust to refresh-token rotation. |
| **`navigationPreload: true` interaction** — preload starts a network request the moment the SW boots. With SWR, that preload race is moot (cache is returned first anyway). Marginally wasted bandwidth but not functionally broken. | LOW | Acceptable. |
| **`BroadcastUpdatePlugin` opportunity** — Serwist offers a plugin that broadcasts a message when SWR detects updated content. Could surface "fresh content available — refresh?" but adds complexity. | N/A | Defer to future enhancement. Don't bundle into this PR. |

### Contracts Between Components

- **`app/sw.ts` activate handler ↔ `navigations` cache**: activate handler wipes the cache after every SW upgrade. Existing activate logic at line 400-411 only does `postMessage`; add a cache-clear step.
- **`stale-chunk-recovery.ts` ↔ users**: keeps current contract — fire on chunk 404, nuke caches, reload. This is the safety net.
- **`authPartitionPlugin` ↔ navigation cache**: unchanged. Already in place; just gets exercised more often.

### Sequencing

1. **Add post-activate `navigations` cache wipe** in `app/sw.ts:400-411`. Ship this independently — it's a defensive measure that works under both NetworkFirst and SWR.
2. **Flip strategy** from `NetworkFirst` → `StaleWhileRevalidate`. One-line change once #1 is in.
3. **Monitor stale-chunk-recovery activations** in Sentry (`ae:chunk-load-error` performance mark) for a week. If activations spike, the cache-wipe step isn't catching the deploy edge fully — investigate.

---

## Item 3: Outbox v2 — Serwist `BackgroundSyncPlugin` + Multipart Support

### Canonical Pattern (Context7-verified — Serwist BackgroundSync docs)

Two distinct mechanisms in Serwist; current app uses **neither**:

**Pattern A — `BackgroundSyncPlugin` declarative** (`serwist.pages.dev/docs/serwist/runtime-caching/plugins/background-sync-plugin`):
```typescript
const backgroundSync = new BackgroundSyncPlugin("ae-mutations", {
  maxRetentionTime: 24 * 60,
});
serwist.registerCapture(
  ({ url }) => url.pathname.startsWith("/api/") && [...mutation paths],
  new NetworkOnly({ plugins: [backgroundSync] }),
  "POST"
);
```

**Pattern B — `BackgroundSyncQueue` imperative** (`serwist.pages.dev/docs/serwist/core/background-sync-queue`):
```typescript
const queue = new BackgroundSyncQueue("ae-mutations");
self.addEventListener("fetch", (event) => {
  if (shouldEnqueue(event.request)) {
    event.respondWith((async () => {
      try { return await fetch(event.request.clone()); }
      catch { await queue.pushRequest({ request: event.request }); return Response.error(); }
    })());
  }
});
```

Both store requests in IndexedDB under the `workbox-background-sync` schema, register a `sync` event with a tag, and replay via `replayRequests()` (default `onSync`).

### Why Migrate Off The Current Bespoke Outbox

Current `lib/offline-outbox.ts` is hand-rolled IDB + a hand-rolled replay loop at `app/sw.ts:644-649`. Reasons to switch:

1. **Multipart blocker is structural in v1.** Comment at `lib/offline-outbox.ts:47-48`: *"multipart/form-data bodies (file uploads) are NOT supported in v1 — they're tied to File objects that aren't durable across page reloads."* Serwist's `BackgroundSyncQueue` stores the entire `Request` object including its body. `Request` is structured-cloneable, and File/Blob are structured-cloneable; the queue handles binary bodies natively.
2. **`pushRequest` is request-object-shaped, not URL+body-shaped.** Lets the SW fetch handler intercept ANY failed mutation generically — no per-call-site `enqueueFetchMutation()` wrapper.
3. **Browser-native exponential backoff.** Per docs: *"For browsers supporting the API, retries are managed by the browser using exponential backoff."* Current code retries on every `sync` event (no backoff).

### Integration Points

**`app/sw.ts` — new file scope:**
- Import `BackgroundSyncQueue` from `serwist`.
- Define a queue: `const outbox = new BackgroundSyncQueue("ae-outbox-v2", { maxRetentionTime: 24*60, onSync: customOnSync })`.
- The custom `onSync` is where user-scoping happens: pop each request, read a `X-AE-User-Id` header (or a sidecar key in the IDB record metadata), compare against `clients.matchAll()` for the active user, drop if mismatched. **This is the cross-user replay safety story** (currently lives in `clearMutationsExceptUser` at `lib/offline-outbox.ts:138-163`).
- Replace the `app/sw.ts:644-649` `sync` listener — `BackgroundSyncQueue` registers its own.
- Intercept failing mutations: either via `BackgroundSyncPlugin` on a route matcher (declarative, no app-side change needed) OR a generic `fetch` handler that catches `Response.error` for matching paths.

**`lib/offline-outbox.ts` — slim down:**
- Keep the public API surface (`enqueueFetchMutation`, `requestBackgroundSync`) but reimplement against the new queue.
- For Pattern A (declarative plugin), the client just `fetch()`s and lets the SW intercept. The `enqueueFetchMutation` helper at line 171-193 becomes obsolete — keep an "enqueue when SW is unavailable" fallback for the no-SW path (e.g. iOS Safari before 16.4 PWA install).
- Drop `clearMutationsExceptUser` — replaced by user-scoping inside `onSync`.

**Three call sites that need wiring (per `PROJECT.md` "Active" list):**
- `components/humidor/BurnReport.tsx` — already on v1; cutover.
- Lounge post create — currently fails silently offline. Path: `app/api/lounge/...` (verify in code).
- Humidor add — currently fails silently offline. Path: `app/api/humidor/...` (verify in code).
- Photo uploads (multipart) — verify which API route accepts `FormData`. Likely `app/api/avatar/route.ts` for avatars; lounge-post images are uploaded via Supabase Storage client-side (so probably no API route involved — different problem).

**Multipart specifics:**
- `Request.formData()` preserves Blob bodies. Storing `Request` in IDB via `BackgroundSyncQueue` works for multipart automatically.
- Photo upload from Supabase Storage client-side: this isn't an API mutation — it's a direct SDK upload. To queue offline, swap to an API-route-mediated upload (`POST /api/upload` with `FormData`), then let `BackgroundSyncPlugin` capture it on the matcher. Architecturally: introduces a server-side mediator for one class of upload to enable offline. Acceptable trade.

### Risks (load-bearing)

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Migration of in-flight v1 records** — users with queued burn reports in the v1 IDB store would lose them on cutover unless migrated | MEDIUM | One-shot migration on SW activate: open the old `ae-offline-outbox` IDB, read records, `outbox.pushRequest(reconstructedRequest)` each, delete the old DB. Document in a runbook. |
| **User-scoping inside `onSync`** — `BackgroundSyncQueue` doesn't know about users. Custom `onSync` must read user-id metadata from each entry and skip mismatches. The pattern works (Serwist supports custom metadata via the `metadata` field of `pushRequest`), but requires more code than the declarative `BackgroundSyncPlugin` path | MEDIUM | Choose **Pattern B (imperative `BackgroundSyncQueue`)** specifically because user-scoping needs custom `onSync`. Pattern A loses this guarantee. |
| **Safari Background Sync support** — `SyncManager` is Chromium/Firefox only. Safari falls back to "replay on SW startup" via `forceSyncFallback: true` (Serwist doc). Already covered by `OutboxManager`'s online-event listener for the v1 outbox; reuse the pattern. | LOW | Set `forceSyncFallback: false` (default), keep `OutboxManager` online listener for Safari. |
| **Request body durability** — `Request` is structured-cloneable, but consuming the body (via `.json()` or `.formData()`) renders it unusable. The SW must `request.clone()` before any consumption. Pattern shown in Serwist docs: `fetch(event.request.clone())` | LOW | Standard SW hygiene; document. |
| **Idempotency on replay** — replayed mutations may double-fire if the original request actually succeeded but the response was lost. Server-side dedup needed for any non-idempotent mutation. Burn-report inserts are already idempotent-by-id (UUID generated client-side); confirm same for lounge post and humidor add. | MEDIUM | Audit each mutation. Add Idempotency-Key header where missing. Stripe webhook already does this; pattern is established. |
| **IDB schema collision** — Serwist's `workbox-background-sync` IDB store coexists with the existing `ae-offline-outbox`. No collision (different DB names) but creates two stores during migration window. | LOW | Migration script deletes the old DB at end of cutover. |

### Contracts Between Components

- **Client mutation → SW**: client just calls `fetch(url, {method, body})`. If offline, SW catches the rejection, `pushRequest`s into the queue. No more `enqueueFetchMutation()` wrapper in app code.
- **SW → server replay**: replayed request includes the original `credentials: "include"` and cookies. Server endpoint must tolerate replay (idempotency).
- **SW → user-scoping**: each queued request's `metadata` field carries `{userId: string}`. `onSync` reads it, compares against the active client's user (via `postMessage` ask or a passed-in context), drops mismatched.
- **`OutboxManager` (client component) → SW**: stays as the Safari fallback. On `online` event, posts a message to SW to trigger `replayRequests()`.

### Sequencing

1. **Migrate burn-report alone** to `BackgroundSyncQueue` (smallest blast radius, already on v1). Validate replay end-to-end.
2. **Add migration shim** that reads `ae-offline-outbox` IDB and seeds the new queue.
3. **Wire lounge-post + humidor-add** to fail-via-SW (drop the explicit `enqueueFetchMutation` wrapper from these flows; let the SW intercept).
4. **Multipart upload route** for photos as a separate scoped change.

---

## Item 4: PWA-Hang Diagnostic Architecture

### Problem Restated

Three watchdogs ship today, each catching a known failure mode of an indefinite black-screen hang whose **root cause has never been reproduced**. From `CONCERNS.md`: *"each watchdog catches a symptom... not a fix... if none fire → narrows to a fourth, currently-unknown root cause."* This is the textbook CLAUDE.md anti-pattern ("masking a broken function with a timeout/retry/fallback") and the engineering principles flag it directly.

The honest framing: we need a **diagnostic architecture**, not another watchdog. The goal is to make the next hang report self-describing.

### Canonical Pattern — Layered Performance Marks + Sentry Custom Traces

No single library packages "diagnose unknown PWA hangs." The pattern is to compose primitives:

1. **`performance.mark()` at every plausible hang boundary** — already present for chunk-load-error, watchdog-fired, hydrated. Extend coverage to: SW registration start/end, SW message-handler entry/exit, fetch-handler entry/exit for navigation, Supabase auth start/end (both server-side in proxy and client-side in any SWR fetcher), React hydration start (root layout `<script>` body) + end (`__AE_HYDRATED` flag).
2. **Sentry custom transactions for the cold-boot path** — wrap "from page request to first interactive" as a single transaction. Sentry's Performance UI surfaces the slowest span. Use `Sentry.startSpan({ name: "cold-boot" }, async (span) => { ... })` and child spans for SW boot, hydration, first network fetch.
3. **Forced telemetry on watchdog fire** — when ANY watchdog fires today, flush all collected marks to Sentry as a structured event. Currently only the mark is set; the report assumes you have DevTools open. Auto-uploading the mark trail on watchdog fire turns "Dave's report" into "Sentry event with timeline."
4. **Sentry Replay (still off)** — `CONCERNS.md` notes Replay is intentionally disabled for cost. Reconsider for hang-diagnosis ONLY when a hang is reproduced. The 80 KB gzipped cost is one-time enable to capture one reproducer; disable again after.

### Integration Points

**New file:** `lib/diagnostics/marks.ts`
- Exports: `mark(name: string, detail?: object)`, `flushMarksToSentry(reason: string)`, `setupHangDiagnostics()`.
- Wraps `performance.mark` with a parallel in-memory log so we can serialize the timeline on demand (the User Timing API itself is queryable via `performance.getEntriesByType("mark")` but doesn't include `detail` payloads in all browsers).

**Watchdog augmentation:**
- `components/system/stale-chunk-recovery.ts` (script body) — on fire, call `flushMarksToSentry("chunk-load-error")` BEFORE reload.
- `components/system/hydration-watchdog.ts` — on fire, call `flushMarksToSentry("hydration-timeout")` BEFORE reload.
- `proxy.ts:97-117` — on timeout, log includes a structured payload (currently just `console.warn`). Move to `lib/log.ts` `log.warn` so Sentry captures it as a queryable event with scope.

**Cold-boot transaction:** `app/layout.tsx`
- Start a Sentry transaction in the root layout (server side) or in the client init. Tag with `route`, `auth_state`, `is_pwa_install`.
- Cancel transaction when `__AE_HYDRATED` is set (or after a timeout).

**SW-side marks:** `app/sw.ts`
- Surface SW lifecycle (`install`, `activate`, `fetch` for navigation, `sync`) via `postMessage` to the active client, which forwards to the in-memory mark log.

### Risks (load-bearing)

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Adding marks could itself become a hang vector** — synchronous `performance.mark` is cheap; `Sentry.captureMessage` from a watchdog-fire path is async and could itself wait on network | MEDIUM | Watchdog-fire path uses `Sentry.captureMessage` with `Sentry.flush({ timeout: 1000 })` then reloads. Bounded timeout — if Sentry is the thing that's hanging, we still reload after 1s. |
| **Telemetry storm under degenerate state** — if a hang affects 1% of sessions and each generates a Sentry event, free-tier quota is bounded but a regression could blow it | LOW | Rate-limit at the watchdog level: max 1 hang-report per browser per hour (localStorage cooldown). |
| **Watchdog removal premature** — removing any of the three watchdogs before the unknown root cause is identified would revert a known mitigation | HIGH | Do NOT remove watchdogs in this milestone. Diagnostic instrumentation is **additive**; removal waits until a hang reproduces with a mark trail and the underlying bug is fixed. |
| **Mark names not standardized** — drift between scripts. Three inline script names are loose strings today. | LOW | Centralize names in `lib/diagnostics/marks.ts` as a const enum. |

### Contracts Between Components

- **Watchdog scripts → mark log**: inline scripts call `window.__AE_MARKS.push({name, t: performance.now(), detail})`. Buffer drains on either Sentry flush or when a `MarkConsumer` mounts.
- **Mark log → Sentry**: on watchdog fire, serialize buffer + `performance.getEntriesByType()` and emit as `Sentry.captureMessage("[hang] <reason>", { extra: { timeline } })`.
- **SW → marks**: `app/sw.ts` posts `{type: "MARK", name, t}` to clients; client-side mark log appends.

### Sequencing

1. **Land `lib/diagnostics/marks.ts`** with the mark/flush helpers. No behavior change.
2. **Augment watchdogs** to flush before reloading.
3. **Wait for one hang report with a mark trail** before any further architectural change. The whole point of this phase is to make the next report diagnosable. Resist the urge to add a fourth watchdog.

---

## Item 5: VLM Band-OCR via Vercel AI Gateway

### Canonical Pattern (Context7-verified — Vercel AI SDK v6)

From `vercel/ai/content/docs/02-getting-started/02-nextjs-app-router.mdx` and `01-ai-sdk-providers/00-ai-gateway.mdx`:

```typescript
import { gateway } from 'ai';                  // bundled in `ai` v5+
import { generateObject } from 'ai';
import { z } from 'zod';

const { object } = await generateObject({
  model: gateway('anthropic/claude-haiku-4.5'), // or 'google/gemini-flash-...'
  schema: z.object({
    brand: z.string().nullable(),
    series: z.string().nullable(),
    vitola: z.string().nullable(),
    confidence: z.number().min(0).max(1),
  }),
  messages: [
    { role: 'user', content: [
      { type: 'text', text: 'Extract cigar band info...' },
      { type: 'file', mediaType: 'image/jpeg', data: imageBuffer },
    ]},
  ],
});
```

**Why AI Gateway (vs. direct Anthropic/Google SDKs):**
- Single API key for multiple providers (env: `AI_GATEWAY_API_KEY` or OIDC on Vercel deployments).
- Provider fallback via `providerOptions.gateway.order: ['anthropic', 'google']` — if Anthropic 429s, retry on Gemini.
- Per-request cost tracked in Vercel dashboard alongside Speed Insights / Sentry.
- No vendor lock-in — model string is the only thing to change.

### Integration Points

**Modify:** `app/api/vision/analyze/route.ts` (215 lines today)
- Split the route into two code paths based on a query param or sub-route:
  - **Safety path (unchanged):** Google Vision SAFE_SEARCH_DETECTION. Used for moderation of lounge post images and avatars. Keep `@google-cloud/vision` SDK; keep `lib/vision-safety.ts`.
  - **OCR path (new):** AI Gateway `generateObject`. Replace the TEXT_DETECTION call with the AI SDK invocation. Same input shape (multipart image), new output shape (structured object).
- Suggested split: `app/api/vision/analyze/route.ts` becomes a thin dispatcher; `lib/vision-safety.ts` stays; new `lib/vision-ocr.ts` exports a `recognizeBand(buffer): Promise<BandRecognition>` function.

**Schema lives in `lib/vision-ocr.ts`:**
```typescript
export const BandRecognitionSchema = z.object({
  brand:      z.string().nullable(),    // "Padron"
  series:     z.string().nullable(),    // "1964 Anniversary"
  vitola:     z.string().nullable(),    // "Exclusivo"
  confidence: z.number().min(0).max(1), // model self-rated
});
```

**Caller (`components/cigars/BandScanner...`):**
- The fetch URL/method stays the same. Response shape changes from "raw text blob" to `BandRecognitionSchema`. The client downstream that parses the band text into brand/series candidates simplifies — the model does the parsing.

**Rate limit:**
- Existing `checkRateLimit(user.id, { limit: 30, window: "1 h", prefix: "vision-analyze" })` at `app/api/vision/analyze/route.ts:100-130` carries over. AI Gateway has its own quota; layer the app-side limit on top.

### Risks (load-bearing)

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Cost-per-call jump vs. Google Vision** — Vision TEXT_DETECTION is ~$1.50/1000; Haiku 4.5 with a single image is more (currently approx $2-5/1000 depending on token count). At indie scale (a few hundred scans/month) the cost is negligible, but the per-call upper bound is higher | LOW | Cap output tokens (`maxOutputTokens: 200`). Set a hard monthly spend cap in Vercel AI Gateway dashboard. The Upstash rate limit (30/h/user) also bounds total volume. |
| **VLM hallucination** — model invents a brand for an unreadable image. Confidence field is the guard, but model may report 0.9 on a hallucinated answer | MEDIUM | UI consumer treats `confidence < 0.7` as "show as suggestion, not autofill." Add a `notes` field to the schema for the model to flag uncertainty. |
| **Provider availability** — Anthropic 429s during peak hours. AI Gateway fallback to Gemini handles this declaratively. | LOW | Use `providerOptions.gateway.order: ['anthropic', 'google']`. |
| **Vercel AI Gateway pricing tier** — needs verification that the free tier or hobby tier covers expected volume; if it requires Pro, that's a budget decision | MEDIUM | Verify pricing tier required for production traffic before locking in. Check current AI Gateway terms. |
| **Image-size limits** — VLMs typically cap at ~5MB / ~2048x2048. iPhone camera produces larger. | LOW | Compress client-side before upload (already done for cigar-photos bucket? Verify in the scanner code path). |
| **Structured-output failure mode** — `generateObject` retries internally on schema-mismatch but can ultimately throw. Catch and fall back to a raw-text response so the UI can still show "we got something, here's what" | LOW | Wrap in try/catch; on schema-validation failure return `{ raw: text, parsed: null }`. |
| **Auth on AI Gateway from Edge runtime** — `app/api/vision/analyze/route.ts` runs on Node (uses `@google-cloud/vision` which needs Node `crypto`). AI Gateway works in Edge too if Vision stays on Node. Both runtimes work; pick based on what runs alongside | LOW | Keep route on Node runtime since Vision Safe Search is co-located. |

### Contracts Between Components

- **Client → API**: same `POST /api/vision/analyze` with a `mode` query param: `?mode=safety` (existing) or `?mode=ocr` (new). Multipart body unchanged.
- **API → caller**: `safety` returns existing safety verdict shape; `ocr` returns `BandRecognitionSchema`.
- **`lib/vision-ocr.ts`** is the only file that knows about AI Gateway. Future provider swaps (e.g. Llama 3 Vision via Bedrock) only touch this file.
- **Env var**: `AI_GATEWAY_API_KEY` (or rely on Vercel OIDC auto-injection for deployments). Document in PROJECT.md env list.

### Sequencing

1. **Add `lib/vision-ocr.ts`** with the schema and the gateway call. Pure new code.
2. **Add `?mode=ocr` branch** to `app/api/vision/analyze/route.ts`. Keep `?mode=safety` (default) on Vision.
3. **Client cutover** — update the band scanner to call `?mode=ocr` and consume the structured response. UI changes pair with this.
4. **Decommission the old TEXT_DETECTION path** after one stable release.

---

## Dependency Graph (For Roadmap Phase Ordering)

```text
                  ┌─────────────────────┐
                  │ Item 4: Diagnostics │  (independent, additive)
                  └──────────┬──────────┘
                             │
                  ┌──────────┴──────────┐
                  │ Item 1: CSP Nonce   │  (proxy.ts + layout.tsx; touches
                  │      Enforcement    │   hottest file in tree)
                  └──────────┬──────────┘
                             │
                  ┌──────────┴──────────┐
                  │ Item 2: SW Nav SWR  │  (app/sw.ts navigation strategy)
                  └──────────┬──────────┘
                             │
                  ┌──────────┴──────────┐
                  │ Item 3: Outbox v2   │  (app/sw.ts + lib/offline-outbox.ts)
                  │ + multipart         │
                  └─────────────────────┘

       Independent track:
                  ┌─────────────────────┐
                  │ Item 5: VLM OCR     │  (one route handler + new lib file)
                  └─────────────────────┘
```

**Why this ordering:**
- **Item 1 first** — security blocker mentioned in the active list of PROJECT.md. Isolatable. Touches `proxy.ts` which everything else also touches eventually, so do it when the file is least crowded.
- **Item 2 after Item 1** — both touch `proxy.ts`/`app/sw.ts`. Sequencing avoids merge conflicts and lets each ship + bake independently.
- **Item 3 after Item 2** — both touch `app/sw.ts`. Item 2 is a strategy flip (small diff); Item 3 is a structural change (large diff). Better to land the small one first.
- **Item 4 parallel to Item 1** — pure additive instrumentation. Different files (`lib/diagnostics/`, watchdog scripts).
- **Item 5 anytime** — completely decoupled from items 1-4. Could ship first or last.

---

## Anti-Patterns To Avoid

### Anti-Pattern 1: Adding A Fourth Watchdog

**What people do:** Production hang reported → write a fourth watchdog covering some new boundary → ship.
**Why it's wrong:** Each watchdog masks a root cause. Stacking watchdogs guarantees production runs, but every layer makes the underlying bug harder to reproduce. CLAUDE.md explicitly flags this anti-pattern.
**Do this instead:** Land Item 4's diagnostic architecture. Next hang report includes a mark trail. Fix the actual bug. Then consider retiring watchdogs from the bottom up.

### Anti-Pattern 2: Hash-Pinning CSP `script-src` On Next 16

**What people do:** Compute SHA-256 hashes of inline scripts, enforce CSP, ship.
**Why it's wrong:** RSC Flight payloads are per-request inline scripts. Their hashes change every request. PR #326 already proved this; PR #332 reverted. The pattern works on Next 13/14 (static inline scripts only); fails on Next 16 (RSC streaming).
**Do this instead:** Nonce + `'strict-dynamic'` per Item 1.

### Anti-Pattern 3: `unstable_cache`-ing The Root Layout

**What people do:** Cache the layout output for perf wins.
**Why it's wrong:** Once nonces ship (Item 1), the root layout reads `headers().get('x-nonce')` — which is a per-request value. Caching the layout would serve the same nonce to multiple users, breaking CSP guarantee (or worse: violating uniqueness in a way that allows replay).
**Do this instead:** Keep the layout dynamic. Cache below the layout (in islands, in `unstable_cache`-wrapped data fetchers — both already done).

### Anti-Pattern 4: Hand-Rolling Outbox Replay

**What people do:** Re-implement IDB queue + replay loop because "we know our payloads best."
**Why it's wrong:** Browser Background Sync API has battle-tested edge cases (Safari fallback, exponential backoff, retention TTL, schema migration on SW upgrade). Re-implementing is months of bug-fixing; Serwist's `BackgroundSyncQueue` solves it.
**Do this instead:** Wrap Serwist's queue (Pattern B from Item 3) with the user-scoping logic only. Inherit everything else.

### Anti-Pattern 5: Replacing Google Vision Wholesale With A VLM

**What people do:** Migrate both Safe Search and OCR to a VLM "because LLMs can do moderation too."
**Why it's wrong:** Safe Search has a published taxonomy (adult, racy, violent, medical, spoof) and known calibration. A VLM doing moderation introduces a different threat model, requires its own evals, and costs more per call. The CONCERNS.md guidance is specifically "Keep Google Vision SAFE_SEARCH_DETECTION for moderation; migrate band-scanner OCR to VLM."
**Do this instead:** Split the route into two paths (Item 5). Safety stays on Vision; OCR moves to VLM.

---

## Integration Points (External Services)

| Service | Item | Integration Pattern | Notes / Gotchas |
|---------|------|---------------------|------------------|
| Vercel AI Gateway | 5 | `gateway('anthropic/...')` from `ai` package | New env var `AI_GATEWAY_API_KEY`; check pricing tier; supports OIDC on Vercel |
| Anthropic / Google (via Gateway) | 5 | Provider fallback via `providerOptions.gateway.order` | Per-request cost visible in Vercel dashboard |
| Sentry | 4 | `Sentry.captureMessage` from watchdog fire path; bounded `flush({ timeout: 1000 })` | Existing instrumentation; tunnel route at `/monitoring` already routes events through origin |
| Upstash | 5 | Existing `checkRateLimit` continues to gate `/api/vision/analyze` | No change |
| Supabase Storage | 3 | Photo uploads currently SDK-direct from client. To enable offline replay, mediate through an API route | Architectural shift for one upload class; trade-off accepted |
| Google Cloud Vision | 5 | Safe Search stays; TEXT_DETECTION retires | `lib/vision-safety.ts` unchanged |

## Internal Boundaries

| Boundary | Item | Communication | Notes |
|----------|------|---------------|-------|
| `proxy.ts` ↔ `app/layout.tsx` | 1 | `x-nonce` request header | Centralize header name in `lib/csp.ts` |
| `app/layout.tsx` ↔ inline watchdog scripts | 1 | `nonce` prop on `<script>` tags | Replaces SHA-256 hashes in `next.config.ts` |
| Client mutations ↔ `app/sw.ts` outbox | 3 | Failed `fetch` intercepted by SW fetch handler | Removes need for explicit `enqueueFetchMutation()` wrapper |
| `lib/diagnostics/marks.ts` ↔ watchdog scripts | 4 | `window.__AE_MARKS` buffer | Watchdog fire flushes buffer to Sentry |
| `app/api/vision/analyze/route.ts` ↔ `lib/vision-ocr.ts` | 5 | `recognizeBand(buffer)` function call | Schema lives in `lib/vision-ocr.ts` |
| `app/sw.ts` activate ↔ `navigations` cache | 2 | Post-activate cache wipe | Defensive measure for stale-chunk edge case |

---

## Sources

**Authoritative (Context7-verified, HIGH confidence):**
- Next.js 16 CSP guide — `/vercel/next.js`, `docs/01-app/02-guides/content-security-policy.mdx` (nonce pattern, `'strict-dynamic'`, third-party scripts, `headers().get('x-nonce')` in App Router)
- Serwist BackgroundSyncQueue + BackgroundSyncPlugin — `/serwist/serwist` and `serwist.pages.dev/docs/serwist/core/background-sync-queue`, `.../runtime-caching/plugins/background-sync-plugin`, `.../guide/background-syncing`
- Serwist StaleWhileRevalidate + cacheKeyWillBeUsed — `serwist.pages.dev/docs/serwist/runtime-caching/caching-strategies/stale-while-revalidate`, `.../strategy-handler`
- Vercel AI SDK v5/v6 generateObject + AI Gateway — `/vercel/ai`, `content/docs/03-ai-sdk-core/10-generating-structured-data.mdx`, `content/providers/01-ai-sdk-providers/00-ai-gateway.mdx`, `content/cookbook/05-node/41-stream-object-with-image-prompt.mdx`

**Ground-truth codebase docs (read in full at start of session):**
- `.planning/codebase/ARCHITECTURE.md` — current system overview, single-auth-check invariant, watchdog roster
- `.planning/codebase/INTEGRATIONS.md` — Serwist runtime caching table, Sentry config, env var inventory
- `.planning/codebase/CONCERNS.md` — CSP enforcement gap, SW nav strategy, outbox limits, watchdog tech-debt classification
- `.planning/codebase/STACK.md` — Next 16.2.1, React 19.2.4, Serwist 9.5.11, AI SDK not yet installed
- `.planning/PROJECT.md` — active list (CSP, SW strategy upgrade, outbox extension, multipart, VLM), constraints, key decisions

**Source files verified:**
- `proxy.ts` (210 lines, full read) — confirmed Edge runtime + `x-ae-*` header forwarding pattern is in place; nonce header would slot in identically
- `lib/offline-outbox.ts` (229 lines, full read) — confirmed v1 limitations: JSON-only bodies, manual user-scoping, no exponential backoff
- `app/sw.ts:165-181` — confirmed `authPartitionPlugin` is already implemented; SWR migration is a one-line strategy swap
- `app/sw.ts:319-357` — confirmed NetworkFirst comment explains why SWR was reverted (stale chunk URLs)
- `app/sw.ts:644-649` — confirmed hand-rolled sync replay listener; replaceable by Serwist's queue
- `next.config.ts:22-90` — confirmed CSP currently uses three SHA-256 hashes; migration path is to drop hashes + nonce-ize

---

*Architecture research for: Ash & Ember Society subsequent milestone — five items from CONCERNS.md*
*Researched: 2026-05-19*
