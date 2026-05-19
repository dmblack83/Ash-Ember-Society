# Stack Research

**Domain:** Premium mobile-first PWA — six targeted additions/migrations
**Researched:** 2026-05-18
**Confidence:** HIGH on five items, MEDIUM on Item 5 (VLM model selection is a moving target)

> This is NOT a full-stack survey. The existing stack (Next 16.2.1 / React 19.2.4 / Supabase / Stripe / Tailwind 4 / Sentry / Serwist 9.5.11 / SWR / Upstash) is fixed per `PROJECT.md` constraints. This document is prescriptive for the six items in the active milestone backlog.

---

## Item-by-Item Recommendations

### 1. CSP enforcement via nonce-based `script-src`

**Recommendation:** Adopt the canonical Next 16 nonce pattern. Move CSP generation out of `next.config.ts` `headers()` and into `proxy.ts`. Use `'strict-dynamic'` so trusted scripts can load further scripts without per-asset hashing. Drop the three hand-computed hashes (`STALE_CHUNK_RECOVERY_SCRIPT`, `COLD_SMOKE_INIT_SCRIPT`, `HYDRATION_WATCHDOG_SCRIPT`) once those inline scripts read `nonce` from `headers()`.

**Canonical code (from `nextjs.org/docs/app/guides/content-security-policy`, version 16.2.6, lastUpdated 2026-05-18):**

```ts
// proxy.ts
const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
const isDev = process.env.NODE_ENV === 'development'
const cspHeader = `
  default-src 'self';
  script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''};
  style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`};
  img-src 'self' blob: data: https://*.supabase.co;
  font-src 'self';
  connect-src 'self' https://*.supabase.co wss://*.supabase.co
              https://api.stripe.com https://*.ingest.sentry.io
              https://vitals.vercel-insights.com https://va.vercel-scripts.com;
  frame-src https://js.stripe.com https://*.stripe.com https://*.google.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`.replace(/\s{2,}/g, ' ').trim()

const requestHeaders = new Headers(request.headers)
requestHeaders.set('x-nonce', nonce)
requestHeaders.set('Content-Security-Policy', cspHeader)

const response = NextResponse.next({ request: { headers: requestHeaders } })
response.headers.set('Content-Security-Policy', cspHeader)
```

Layout reads the nonce via `(await headers()).get('x-nonce')` and applies to inline `<Script>` tags. **Next.js automatically injects the nonce into all framework scripts (React runtime, page bundles, Flight payloads)** because it parses the `Content-Security-Policy` header at SSR time and extracts the `'nonce-{value}'` pattern. This is why PR #326 failed with hash-only CSP — RSC Flight payloads are per-request inline scripts that no static hash can cover.

**Matcher should exclude prefetches and static assets** (also from official docs):

```ts
export const config = {
  matcher: [{
    source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
    missing: [
      { type: 'header', key: 'next-router-prefetch' },
      { type: 'header', key: 'purpose', value: 'prefetch' },
    ],
  }],
}
```

**Confidence:** HIGH. Verified against `nextjs.org/docs/app/guides/content-security-policy` (Next 16.2.6) via Context7 `/vercel/next.js` AND direct fetch. Code is copy-paste from official docs.

**Critical caveat — pulled directly from the official guide:**

> "When you use nonces in your CSP, all pages must be dynamically rendered ... Static optimization and Incremental Static Regeneration (ISR) are disabled ... Partial Prerendering (PPR) is incompatible with nonce-based CSP since static shell scripts won't have access to the nonce."

This is in direct tension with Item 4 (`use cache` / Cache Components) which **requires** prerendered static shells. **Sequence matters: ship nonce CSP first while still on `unstable_cache`, then evaluate whether to drop nonce in favor of SRI when Cache Components migration begins.** The official docs explicitly suggest SRI (Subresource Integrity, `experimental.sri.algorithm: 'sha256'`) as the static-friendly alternative.

**Anti-recommendations:**

| Avoid | Reason |
|---|---|
| Hash-only `script-src 'self' <hashes>` (the PR #326 approach) | Next 16 RSC streams per-request Flight scripts; no static hash can cover them; produces "Connection closed" stream errors |
| Keeping CSP in `next.config.ts` `headers()` once nonces are used | Nonce must be unique per request → can only generate in proxy/middleware |
| Static SRI + nonce simultaneously | Documented as compatible but adds two layers of complexity for solo-dev maintenance |

---

### 2. Service Worker navigation strategy: NetworkFirst → StaleWhileRevalidate

**Recommendation:** Swap `NetworkFirst` for `StaleWhileRevalidate` on the navigation route in `app/sw.ts:319-358`. Keep the existing `authPartitionPlugin` (already implemented at `app/sw.ts:165`). Keep `serwist` `^9.5.11` — already installed and current.

Per Serwist docs (`/websites/serwist_pages_dev`, source `serwist.pages.dev/docs/serwist/runtime-caching`):

> "The StaleWhileRevalidate strategy serves a cached response immediately if available and updates the cache in the background with a fresh response from the network. If the asset is not cached, it waits for the network response."

Minimal change:

```ts
// app/sw.ts navigation route — replace NetworkFirst with StaleWhileRevalidate
{
  matcher: ({ request }) => request.mode === 'navigate',
  handler: new StaleWhileRevalidate({
    cacheName: 'navigations',
    plugins: [
      authPartitionPlugin,        // already in place — keeps User A's HTML out of User B's cache
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
  }),
}
```

**Why this is safe NOW (and wasn't earlier):**
- `authPartitionPlugin` (cache-keyed by `sha256(sub-claim of auth cookie)`) is in place — shared device safety is solved.
- Stale-chunk-recovery script (PR #288) + hydration watchdog (#289) catch the original SWR risk (cached HTML referencing deleted chunk URLs post-deploy).

**Confidence:** HIGH. Verified Serwist API + already-present partition plugin in the repo (`app/sw.ts:165`).

**Anti-recommendations:**

| Avoid | Reason |
|---|---|
| `cacheOnNavigation: true` in `serwist.config.mjs` | This is for `next/link` prefetch caching — different concern; orthogonal to the strategy swap and adds overhead |
| Migrating off Serwist to Workbox directly | Serwist IS the maintained fork of Workbox; same API surface; no benefit |
| Custom cache-key fn instead of `cacheKeyWillBeUsed` plugin pattern | Plugin pattern is the documented Serwist API; non-standard cache keys break `ExpirationPlugin` LRU |

---

### 3. IndexedDB outbox + Background Sync for offline mutations

**Recommendation:** Use Serwist's built-in `BackgroundSyncQueue` and `BackgroundSyncPlugin` (both ship with `serwist` `^9.5.11`, already installed). Stop hand-rolling outbox replay logic in client code where the SW can do it.

**Two patterns from the official Serwist docs:**

**Pattern A (declarative, preferred for fire-and-forget POSTs like lounge-post create):**

```ts
import { BackgroundSyncPlugin, NetworkOnly } from "serwist";

const backgroundSync = new BackgroundSyncPlugin("ae-outbox-sync", {
  maxRetentionTime: 24 * 60, // 24 h in minutes
});

serwist.registerCapture(
  /\/api\/(lounge|humidor|burn-report)\/.*/,
  new NetworkOnly({ plugins: [backgroundSync] }),
  "POST",
);
```

When offline, the plugin captures the failed POST, persists it to IndexedDB (queue is named `ae-outbox-sync`), and the browser fires a `sync` event on reconnect — Serwist replays the queue.

**Pattern B (imperative, for cases where the client needs to know the request was queued):**

```ts
import { BackgroundSyncQueue } from "serwist";

const queue = new BackgroundSyncQueue("ae-outbox-sync");

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "POST") return;
  event.respondWith((async () => {
    try {
      return await fetch(event.request.clone());
    } catch {
      await queue.pushRequest({ request: event.request });
      return Response.error();
    }
  })());
});
```

**Multipart photo uploads — the only manual piece:**

The Background Sync API serializes `Request.clone()` to IndexedDB, but **Blob/FormData bodies don't survive structured-clone roundtrips reliably across all browsers**. For photo uploads (avatar, lounge post images, cigar photos), wrap the Blob in IDB Blob storage explicitly using `idb` `^8.0.3`:

```ts
import { openDB } from 'idb';

const db = await openDB('ae-uploads', 1, {
  upgrade(db) { db.createObjectStore('blobs', { keyPath: 'id', autoIncrement: true }); }
});
// Store
const id = await db.put('blobs', { blob, mimeType, target: '/api/upload', meta });
// Replay (in SW on 'sync' event):
const all = await db.getAll('blobs');
for (const entry of all) {
  const form = new FormData();
  form.append('file', entry.blob, entry.meta.filename);
  await fetch(entry.target, { method: 'POST', body: form });
  await db.delete('blobs', entry.id);
}
```

**Why `idb` over `idb-keyval`:** outbox needs object stores with indexes (replay-by-timestamp, group-by-user, retry-count). `idb-keyval` is a flat key-value store and would force JSON-stringifying everything, losing Blob fidelity.

**Confidence:** HIGH. Verified `BackgroundSyncQueue` + `BackgroundSyncPlugin` API against `/websites/serwist_pages_dev`. `idb` `^8.0.3` is the latest (Jake Archibald, npm `idb`).

**Anti-recommendations:**

| Avoid | Reason |
|---|---|
| Manual `postMessage` to SW from client + custom replay logic | Serwist's `BackgroundSyncQueue` already does this; reinventing it is unnecessary complexity |
| Storing FormData bodies directly in `BackgroundSyncPlugin`'s queue | Plugin serializes `Request.clone()`; multipart bodies are unreliable across browsers; use separate IDB blob store |
| Polling reconnect in the client and replaying from the page | The whole point of Background Sync API is the browser fires `sync` even when the tab is closed |
| `localforage` | Heavier abstraction over IDB; team would inherit a transitive dep when `idb` (~1KB gzipped) covers the use case |
| `dexie` | ORM-style; overkill for a single-store outbox; adds 30KB+ |

---

### 4. `unstable_cache` → Next 16 Cache Components (`'use cache'`)

**Recommendation:** Migrate when Item 1 (CSP nonces) is either deferred or replaced with SRI. **Do not start the migration until that decision is made** — see Item 1's "Critical caveat".

**Current state per Next 16.2.6 docs (`nextjs.org/docs/app/api-reference/directives/use-cache`):**

| Aspect | Status |
|---|---|
| `'use cache'` directive | **Stable in Next 16.0+** (was experimental in 15.0). Per the Version History table in the official docs. |
| `cacheComponents: true` config flag | Required at `next.config.ts` top level (no longer under `experimental.`) |
| `cacheLife(profile)` | Stable. Built-in profiles: `'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'max'`. Default profile: stale 5min / revalidate 15min / never expires. |
| `cacheTag(...tags)` | Stable. Up to 128 tags per call, 256 chars each. |
| `updateTag(tag)` | Stable. **Use for read-your-own-writes** (immediate invalidation). |
| `revalidateTag(tag)` | Stable. **Use for background revalidation** (next request gets fresh data). |

**Migration template (from `unstable_cache` to `'use cache'`):**

```ts
// BEFORE
import { unstable_cache } from 'next/cache';
export const getProfileLite = unstable_cache(
  async (userId: string) => { /* ... */ },
  ['profile-lite'],
  { revalidate: 900, tags: ['profile'] }
);

// AFTER
import { cacheLife, cacheTag } from 'next/cache';
export async function getProfileLite(userId: string) {
  'use cache';
  cacheLife('minutes');           // ~15min server revalidate, 5min client stale
  cacheTag('profile', `profile:${userId}`);
  /* ... */
}
```

**Three constraints from official docs that affect this codebase:**

1. **No `cookies()` / `headers()` inside cached scopes.** Already a pattern in `utils/supabase/anon.ts` (the anon client used inside `unstable_cache` calls). Migration mostly mechanical.
2. **Pass-through for non-serializable values is OK as long as you don't introspect.** `children`, Server Actions, JSX slots — fine. Class instances, URL objects, functions (called inside) — not OK.
3. **Serverless caveat:** "Cache entries typically don't persist across requests" in Vercel's serverless. For Ash & Ember Society's traffic profile (solo dev, low volume), this means `'use cache'` is primarily a static-prerender mechanism, not a hot-cache layer. **For runtime caching that DOES persist (counts, feed pages), keep using Upstash Redis directly** — or evaluate `'use cache: remote'` if/when Vercel ships it.

**Confidence:** HIGH on the API. MEDIUM on the migration risk — solo-dev whole-app flag swap is a one-shot deployment; rollback is a revert of `cacheComponents: true`, not file-by-file.

**Critical incompatibilities:**

| Incompatible with `'use cache'` | Why |
|---|---|
| Nonce-based CSP | All pages become dynamic; static shells (where `'use cache'` shines) get no nonce; see Item 1 caveat |
| `'use cache: private'` | Different directive for runtime cookies/headers; do not mix |
| Direct `cookies()` / `headers()` inside cached function | Throws immediately at build time |
| `React.cache()` value passed in from outside the cache scope | `React.cache` operates in isolated scope inside `'use cache'`; pass via arguments only |

**Anti-recommendations:**

| Avoid | Reason |
|---|---|
| File-by-file migration | `cacheComponents: true` is a global flag; partial migration leaves the project in an inconsistent state |
| Keeping `unstable_cache` forever | It still works in 16.x but is the slower-evolving codepath; Cache Components is where new features (`updateTag`, `cacheLife` profiles, `use cache: remote`, SRI) land |
| `'use cache: remote'` on Vercel before checking pricing | Per docs: "requires a network roundtrip to check the cache and typically incurs platform fees" |
| Putting `'use cache'` on every Server Component reflexively | Cached output's serialization is more restrictive than non-cached; some components (those that take URL/class instances as props) cannot be cached |

---

### 5. Google Vision TEXT_DETECTION → VLM (Vercel AI Gateway)

**Recommendation:** Use **Vercel AI Gateway** as the model router (platform-native; no extra credentials needed if Vercel-deployed). Drive it via the AI SDK (`ai` `^6.0.185`). For cigar-band OCR, prefer **`anthropic/claude-haiku-4-5`** as primary model; fall back to **`google/gemini-2.5-flash`** for cost optimization.

**Keep Google Cloud Vision SAFE_SEARCH_DETECTION** in `lib/vision-safety.ts` — it's purpose-built and cheaper than running general VLMs for moderation.

**Authoritative source:** `vercel.com/docs/ai-gateway/models-and-providers` (last_updated 2026-03-24, fetched via WebFetch).

**Installation:**

```bash
npm install ai @ai-sdk/gateway
# Optional, only if you want strongly-typed provider instance vs plain string model IDs
# npm install @ai-sdk/anthropic @ai-sdk/google
```

**Versions verified via `npm view`:**
- `ai@6.0.185` (latest)
- `@ai-sdk/gateway@3.0.116`
- `@ai-sdk/anthropic@3.0.78`
- `@ai-sdk/google@3.0.75`

**Canonical pattern (vision/OCR) from `vercel/ai` Context7:**

```ts
import { generateText } from 'ai';

// Plain-string model routes through Vercel AI Gateway by default
const result = await generateText({
  model: 'anthropic/claude-haiku-4-5',
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'Extract the cigar brand, line, and vitola from this band. Return JSON: {brand, line, vitola}.' },
      { type: 'file', data: imageBuffer, mediaType: 'image/jpeg' },
    ],
  }],
});
```

**Why AI Gateway over direct Anthropic/Google SDKs:**
- No managing Anthropic + Google API keys separately — Gateway uses Vercel's OIDC token automatically on Vercel deploys, or `AI_GATEWAY_API_KEY` env var locally.
- Switch models with one string change (`anthropic/claude-haiku-4-5` → `google/gemini-2.5-flash`).
- Built-in fallback/retry across providers via `providerOptions` (docs: `/docs/ai-gateway/models-and-providers/provider-options`).
- Per-model usage tracking + cost rollup in Vercel dashboard.

**Why Claude Haiku 4.5 first, Gemini Flash second:**
- Cigar bands are stylized typography on metallic foil with low contrast — Claude's vision currently outperforms Gemini on stylized text per published benchmarks.
- Gemini 2.5 Flash is roughly 2-3x cheaper than Haiku 4.5 per million tokens — keep it as the fallback / batch path.
- **Validate this empirically.** Cigar-band OCR is a narrow domain. Ship a `model` query param on `/api/vision/analyze` and A/B both for a week before committing.

**Live-pricing discovery (per `/docs/ai-gateway/models-and-providers`, no auth required):**

```bash
curl https://ai-gateway.vercel.sh/v1/models | jq '.data[] | select(.id == "anthropic/claude-haiku-4-5" or .id == "google/gemini-2.5-flash") | {id, pricing}'
```

Use this exactly when speccing the implementation PR — pricing in this doc would be stale within weeks.

**Confidence:** HIGH on AI Gateway + AI SDK API. MEDIUM on Haiku 4.5 vs Gemini 2.5 Flash relative quality for cigar bands — needs A/B in production.

**Anti-recommendations:**

| Avoid | Reason |
|---|---|
| Direct Anthropic SDK (`@anthropic-ai/sdk`) | Locks you into one provider; loses Vercel Gateway's routing/fallback/observability; needs separate API key |
| Direct Google Generative AI SDK (`@google/generative-ai`) | Same problem — separate key, no fallback path |
| Replacing Google Vision SAFE_SEARCH_DETECTION with VLM moderation | SAFE_SEARCH is a single API call returning likelihood enums; cheaper and faster than running a 1B+ param VLM for every upload |
| OpenRouter as the gateway | Adds an out-of-platform dependency; Vercel AI Gateway covers the same routing surface with Vercel-native auth |
| Loading raw images larger than 1MB into Claude messages | Resize/compress to ~1MB max before sending; bands are tiny; you're paying per-pixel tokens |
| Storing API responses as authoritative cigar metadata without confirmation | OCR confidence is variable; always show the user the extracted fields and require confirm before INSERT into `cigar_catalog` |

---

### 6. Bundle / lint / Lighthouse gates in CI

**Recommendation:** Three independent CI jobs added to the existing `.github/workflows/ci.yml`. Each is a separate concern; ship them as three separate PRs.

#### 6a. Lint gate

Block on `npm run lint`. Required prerequisite: clean up the 63 `no-explicit-any` errors (per `PROJECT.md` Active backlog item). Do this as 4-8 cleanup PRs of 8-15 fixes each — one concern per PR, per `CLAUDE.md`.

No new tooling needed — `eslint` `^9` + `eslint-config-next` `16.2.1` already installed.

```yaml
# .github/workflows/ci.yml
- name: Lint
  run: npm run lint
```

#### 6b. Bundle-size gate

**Use `size-limit`** (`^12.1.0` latest, verified via `npm view`). Solo-dev-friendly, runs as a single npm script, fails CI on regression with a clear diff.

```bash
npm install -D size-limit @size-limit/preset-app
```

```jsonc
// package.json
"scripts": {
  "size": "size-limit"
},
"size-limit": [
  {
    "name": "First Load JS (shared)",
    "path": ".next/static/chunks/main-*.js",
    "limit": "100 KB"
  },
  {
    "name": "App shell route",
    "path": ".next/static/chunks/app/**/page-*.js",
    "limit": "50 KB each"
  }
]
```

```yaml
# .github/workflows/ci.yml
- run: npm ci && npm run build
- run: npm run size
```

**Why size-limit over `bundlewatch`:** size-limit is more actively maintained, has `@size-limit/preset-app` tuned for Next.js, integrates with `andresz1/size-limit-action` for PR-comment diffs.

**Why not just `npm run analyze` diff:** `next experimental-analyze` produces a report file, not a pass/fail gate. `BUNDLE_BASELINE.md` (already in repo) is a manual checkpoint, not enforcement. Wire size-limit to fail PRs that exceed the budgets defined there.

#### 6c. Lighthouse gate

**Use `treosh/lighthouse-ci-action@v12`** (latest major). Verified via Context7 `/treosh/lighthouse-ci-action`.

```yaml
# .github/workflows/lighthouse.yml
on:
  pull_request:
jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Wait for Vercel preview
        uses: patrickedqvist/wait-for-vercel-preview@v1
        id: preview
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          max_timeout: 600
      - name: Lighthouse audit
        uses: treosh/lighthouse-ci-action@v12
        with:
          urls: |
            ${{ steps.preview.outputs.url }}
            ${{ steps.preview.outputs.url }}/login
            ${{ steps.preview.outputs.url }}/humidor
          budgetPath: ./lighthouse-budget.json
          uploadArtifacts: true
          temporaryPublicStorage: true
```

```jsonc
// lighthouse-budget.json
[{
  "path": "/*",
  "resourceSizes": [
    { "resourceType": "document", "budget": 50 },
    { "resourceType": "script", "budget": 350 },
    { "resourceType": "image", "budget": 500 },
    { "resourceType": "total", "budget": 1500 }
  ],
  "timings": [
    { "metric": "interactive", "budget": 4000 },
    { "metric": "first-contentful-paint", "budget": 2000 }
  ]
}]
```

**Why run against Vercel preview, not localhost:** RUM-equivalent network conditions; Speed Insights (already shipped) measures the same surface; preview deploy is the actual production-shape artifact.

**Confidence:** HIGH on tool choice. MEDIUM on budget thresholds — start permissive (above current measurements) and ratchet down PR by PR.

**Anti-recommendations:**

| Avoid | Reason |
|---|---|
| `bundlewatch` over `size-limit` | Less actively maintained; no Next.js preset |
| Lighthouse run on localhost in CI | Network conditions don't match production; flaky; Vercel preview is already produced for every PR |
| Lighthouse `assertions: { "categories:performance": ["error", { "minScore": 0.9 }] }` initially | Score-based asserts are flaky on Lighthouse; resource-size budgets are deterministic; start there |
| Skipping the lint cleanup before enabling the gate | Adding gates before clearing existing debt produces "stuck red" CI that gets bypassed |
| Running all three in one big PR | Per `CLAUDE.md`: "One concern per PR. No 'while I'm in there' bundled cleanups." |

---

## Recommended Stack (Summary)

### Core Technologies (already installed — do not change)

| Technology | Version | Status |
|------------|---------|--------|
| `next` | `16.2.1` | Current, stable; matches all docs cited above |
| `react` | `19.2.4` | Current |
| `serwist` / `@serwist/next` / `@serwist/cli` | `^9.5.11` | Current; covers Items 2 + 3 |
| `swr` | `^2.4.1` | Current; remaining migration scoped in `PROJECT.md` |
| `@upstash/ratelimit` | `^2.0.8` | Current |
| `@sentry/nextjs` | `^10.51.0` | Current |
| `stripe` | `^21.0.1` | Current |

### New Dependencies (this milestone)

| Library | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| `idb` | `^8.0.3` | Promise-based IDB wrapper for Blob outbox (Item 3) | HIGH |
| `ai` | `^6.0.185` | Vercel AI SDK for VLM calls (Item 5) | HIGH |
| `@ai-sdk/gateway` | `^3.0.116` | Vercel AI Gateway provider (Item 5) | HIGH |
| `size-limit` | `^12.1.0` | Bundle budget enforcement (Item 6b) | HIGH |
| `@size-limit/preset-app` | `^12.1.0` | Next.js-tuned size-limit preset | HIGH |

### New CI Actions

| Action | Purpose | Confidence |
|--------|---------|------------|
| `treosh/lighthouse-ci-action@v12` | Lighthouse perf budget in CI (Item 6c) | HIGH |
| `patrickedqvist/wait-for-vercel-preview@v1` | Block Lighthouse until preview is ready | HIGH |
| `andresz1/size-limit-action@v1` (optional) | PR-comment bundle-size diffs | MEDIUM |

### Optional Direct Providers (if AI Gateway becomes a bottleneck)

Only install if you decide to bypass the Gateway for a specific provider — not the default path.

| Library | Version | When |
|---------|---------|------|
| `@ai-sdk/anthropic` | `^3.0.78` | Only if you need Anthropic-specific features unavailable through Gateway |
| `@ai-sdk/google` | `^3.0.75` | Only if you need Google-specific features unavailable through Gateway |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Hash-only `script-src` in Next 16 | RSC Flight payloads are per-request inline scripts; no static hash covers them (PR #326 evidence) | Nonce-based `script-src` with `'strict-dynamic'` (Item 1) |
| File-by-file `'use cache'` migration | `cacheComponents: true` is a global flag; partial migration is inconsistent | Whole-app PR with explicit revert plan (Item 4) |
| `localforage` / `dexie` for outbox | Heavyweight for a single-store outbox | `idb` `^8.0.3` (~1KB gzipped) |
| Manual SW `postMessage` outbox replay | Browser's Background Sync API already does this | `BackgroundSyncQueue` / `BackgroundSyncPlugin` (Item 3) |
| Direct Anthropic / Google SDKs | Locks you into one provider; needs separate API key; loses Vercel observability | Vercel AI Gateway via `ai` + `@ai-sdk/gateway` (Item 5) |
| Replacing Google Vision SAFE_SEARCH with VLM | SAFE_SEARCH is purpose-built moderation; VLMs are 10-100x more expensive | Keep Vision SAFE_SEARCH, migrate only TEXT_DETECTION to VLM (Item 5) |
| `bundlewatch` for bundle budgets | Less actively maintained; no Next.js preset | `size-limit` + `@size-limit/preset-app` (Item 6b) |
| Lighthouse on localhost in CI | Network conditions don't match production; flaky | Lighthouse against Vercel preview deploys (Item 6c) |
| `'unstable_cache'` for new code | Slower-evolving codepath; `'use cache'` is where new features land | Plan migration with Item 4 sequencing |
| `'use cache: private'` to handle cookies | Different directive; mixing modes complicates mental model | Refactor to pass cookie/header values as arguments |

---

## Critical Sequencing (Roadmap Hint)

The items have a hard dependency that the roadmapper must respect:

```
Item 1 (CSP nonce)   ─── INCOMPATIBLE WITH ───  Item 4 ('use cache' / Cache Components)
```

Per official Next.js docs: nonces force all pages dynamic; Cache Components require static shells. **You can't have both at the same time** unless you migrate to SRI (`experimental.sri.algorithm: 'sha256'`) as the static-friendly alternative to nonces.

**Suggested order:**

1. **Item 6a** (lint cleanup + lint gate) — pure cleanup, no architectural risk, unblocks future items by reducing noise
2. **Item 2** (SW navigation SWR) — small, low-risk, pure win
3. **Item 3** (outbox + Background Sync) — extends shipped burn-report infrastructure; no conflicts
4. **Item 6b + 6c** (bundle + Lighthouse gates) — protects everything downstream
5. **Item 5** (VLM migration) — independent vertical slice; can ship in parallel with anything
6. **Item 1 (CSP nonce) OR Item 4 ('use cache') — pick one path:**
   - **Path A (security-first):** Ship Item 1, defer Item 4 indefinitely (or revisit with SRI)
   - **Path B (perf-first):** Ship Item 4, keep CSP in Report-Only until SRI is mature

Path A is the lower-risk default for solo-dev given the current backlog. The CSP gap is a real security delta; the `unstable_cache` → `'use cache'` migration is a perf optimization on top of an already-shipped six-phase perf plan.

Other items can ship in parallel since they touch disjoint surfaces (SW, AI, CI).

---

## Sources

| Source | Authority | Items Verified |
|--------|-----------|----------------|
| Context7 `/vercel/next.js` (v16.2.6 docs, lastUpdated 2026-05-18) | HIGH — official Next.js docs | Items 1, 4 |
| `nextjs.org/docs/app/guides/content-security-policy` (direct fetch, v16.2.6) | HIGH — official Next.js docs | Item 1 — full code block copy-paste |
| `nextjs.org/docs/app/api-reference/directives/use-cache` (direct fetch, v16.2.6) | HIGH — official Next.js docs | Item 4 — every constraint and pattern |
| Context7 `/websites/serwist_pages_dev` | HIGH — official Serwist docs | Items 2, 3 |
| `vercel.com/docs/ai-gateway/models-and-providers` (direct fetch, last_updated 2026-03-24) | HIGH — official Vercel AI Gateway docs | Item 5 |
| Context7 `/vercel/ai` (AI SDK) | HIGH — official AI SDK | Item 5 — Claude image-input pattern |
| Context7 `/jakearchibald/idb` | HIGH — official idb repo | Item 3 — Blob storage |
| Context7 `/treosh/lighthouse-ci-action` | HIGH — official action repo | Item 6c |
| `npm view` for latest versions of `idb`, `size-limit`, `ai`, `@ai-sdk/gateway`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@lhci/cli` | HIGH — npm registry, fetched 2026-05-18 | All version pins |
| Worktree inspection: `app/sw.ts`, `package.json` | HIGH — ground truth | Confirmed `authPartitionPlugin` already at `sw.ts:165`; confirmed installed versions |

---

*Stack research for: Six targeted milestone additions to existing premium PWA stack*
*Researched: 2026-05-18*
