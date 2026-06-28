# PWA Simplify: Network-First Service Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop caching the authenticated app shell. Replace the auth-partitioned StaleWhileRevalidate navigation cache with a network-first handler + a cached `/offline` fallback, and remove the offline-mutation outbox and iOS splash-image set.

**Architecture:** Adapt rhyme.com's model — cache public/static assets, never the app shell. The whole app is authenticated, so any cached navigation HTML embeds per-user data; we never write it to cache. A dedicated `ae-offline-fallback` cache (populated on SW install) holds only the user-agnostic `/offline` page, served when a live navigation fetch fails. All public-asset runtime caches (static, images, fonts, Supabase public storage), push notifications, telemetry, and the static precache stay exactly as they are.

**Tech Stack:** Next.js App Router, Serwist (post-build SW bundler), TypeScript, vitest (lib only), Playwright (E2E).

## Global Constraints

- No em dashes in user-facing copy (UI strings, errors shown to users). Code/comments exempt.
- Immutable update patterns; explicit types on exported functions; no `any` (use `unknown` + narrow).
- `/offline` is NOT auth-gated (`proxy.ts:27` lists it as session-free) — safe to cache and fetch cookieless.
- The static precache (`...self.__SW_MANIFEST`), `serwist.config.mjs`, and the `sw-precache-check` CI gate are OUT OF SCOPE — do not touch them.
- Service-worker code (`app/sw.ts`) is type-checked with `tsconfig.sw.json` (webworker lib), built by `serwist build` inside `npm run build`. There is no unit-test harness for the SW; verification is typecheck + build + grep + manual PWA checks. Do NOT fabricate SW unit tests.
- Branch off freshly-synced `main` (see Task 0). One PR for the whole change.

---

## File Structure

| File | Change |
|---|---|
| `app/sw.ts` | Modify: swap navigation strategy, add `/offline` install-cache + activate purge, delete auth-partition plugins + outbox section |
| `app/layout.tsx` | Modify: remove `iosSplash` helper + `startupImage` array |
| `app/(app)/layout.tsx` | Modify: remove `OutboxManager` import + mount |
| `components/humidor/BurnReport.tsx` | Modify: remove offline-outbox import; replace catch-block offline branch with plain error handling |
| `lib/offline-outbox.ts` | Delete |
| `components/system/OutboxManager.tsx` | Delete |

---

## Task 0: Branch off synced main

**Files:** none (git only)

- [ ] **Step 1: Sync main and branch**

The spec (`docs/superpowers/specs/2026-06-28-pwa-strategy-rhyme-audit.md`) and this plan are currently untracked working-tree files; they survive the checkout. Move to a clean branch off synced main:

```bash
cd /Users/dave.black/Documents/the-humidor
git stash push -u -- docs/superpowers/specs/2026-06-28-pwa-strategy-rhyme-audit.md docs/superpowers/plans/2026-06-28-pwa-simplify-network-first.md 2>/dev/null || true
git fetch origin main && git checkout main && git merge --ff-only origin/main
git checkout -b feat/pwa-simplify-network-first
git stash pop 2>/dev/null || true
```

- [ ] **Step 2: Verify clean base**

Run: `git log --oneline main..origin/main`
Expected: prints nothing (local main matches origin/main).

- [ ] **Step 3: Commit the planning docs**

```bash
git add docs/superpowers/specs/2026-06-28-pwa-strategy-rhyme-audit.md docs/superpowers/plans/2026-06-28-pwa-simplify-network-first.md
git commit -m "docs: PWA strategy audit + network-first simplification plan"
```

---

## Task 1: Navigation → network-first with cached /offline fallback

**Files:**
- Modify: `app/sw.ts`

**Interfaces:**
- Consumes: `OFFLINE_URL` (existing const, `"/offline"`), Serwist `runtimeCaching` handler accepts an async `({ request }) => Promise<Response>` callback.
- Produces: a navigation route that never writes to cache; a dedicated `ae-offline-fallback` cache name; activate-time purge of the legacy `navigations` cache.

- [ ] **Step 1: Add the offline-fallback cache constants**

In `app/sw.ts`, find:

```ts
const OFFLINE_URL = "/offline";
```

Replace with:

```ts
const OFFLINE_URL = "/offline";

/* Dedicated cache for the user-agnostic offline fallback page. The app
   shell is never cached (see the navigation rule below), so this is the
   only thing a failed navigation can fall back to. */
const OFFLINE_CACHE = "ae-offline-fallback";

/* Legacy cache name from the old auth-partitioned StaleWhileRevalidate
   navigation rule. No longer written; purged on activate so no installed
   PWA can serve stale authenticated HTML after this update. */
const LEGACY_NAV_CACHE = "navigations";
```

- [ ] **Step 2: Delete the auth-partition + nav-stale plugins and their helpers**

In `app/sw.ts`, delete the entire block from the comment header `Auth-aware cache-key plugin` through the end of `navCacheStalePlugin` — i.e. remove these four definitions in full: `extractSubClaim`, `authHashForRequest`, `authPartitionPlugin`, and `navCacheStalePlugin` (the contiguous section currently spanning the `extractSubClaim` doc comment down to the closing `};` of `navCacheStalePlugin`). Leave `postReliability` (above it) and `OFFLINE_URL`/`OFFLINE_CACHE`/`LEGACY_NAV_CACHE` (just added) intact.

- [ ] **Step 3: Drop the now-unused `SerwistPlugin` import**

In `app/sw.ts`, find:

```ts
import {
  Serwist,
  CacheFirst,
  NetworkOnly,
  StaleWhileRevalidate,
  ExpirationPlugin,
  CacheableResponsePlugin,
  type SerwistPlugin,
  type PrecacheEntry,
} from "serwist";
```

Replace with (remove only `type SerwistPlugin` — every other symbol is still used):

```ts
import {
  Serwist,
  CacheFirst,
  NetworkOnly,
  StaleWhileRevalidate,
  ExpirationPlugin,
  CacheableResponsePlugin,
  type PrecacheEntry,
} from "serwist";
```

- [ ] **Step 4: Add an install listener that caches `/offline`**

In `app/sw.ts`, find the existing storage-diagnostic install listener:

```ts
self.addEventListener("install", () => {
  void (async () => {
    try {
      const est   = await navigator.storage.estimate();
```

Immediately BEFORE it, insert a new install listener:

```ts
/* ──────────────────────────────────────────────────────────────────
   Cache the offline fallback page on install.

   Network-first navigation (runtimeCaching below) never writes the
   authenticated shell to cache, so a failed navigation has nowhere to
   land unless we stash the generic /offline page here. /offline is not
   auth-gated (proxy.ts), so it returns 200 cookieless.

   fetch + cache.put (NOT cache.add) so a transient non-200 resolves
   without throwing — a rejected install waitUntil would hang activation
   and freeze push-subscribe, the exact failure class we removed in 2026-05. */
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      const res = await fetch(OFFLINE_URL, { cache: "reload" });
      if (res.ok) {
        const cache = await caches.open(OFFLINE_CACHE);
        await cache.put(OFFLINE_URL, res.clone());
      }
    } catch {
      /* offline at install time — non-fatal; the page just won't be
         available until a later install runs online. */
    }
  })());
});

```

- [ ] **Step 5: Add an activate listener that purges the legacy nav cache**

In `app/sw.ts`, find the existing SW_UPDATED activate listener:

```ts
self.addEventListener("activate", () => {
  void (async () => {
    try {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const client of clients) {
        try {
          client.postMessage({ type: "SW_UPDATED", version: SW_VERSION });
```

Immediately BEFORE it, insert a new activate listener:

```ts
/* One-time migration purge: delete the legacy auth-partitioned navigation
   cache. Prior builds cached per-user HTML under "navigations". That cache
   is never written now; deleting it guarantees no installed PWA serves a
   stale authenticated shell after this worker activates. caches.delete is
   reliable (unlike clients.matchAll on iOS), so waitUntil is safe here. */
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.delete(LEGACY_NAV_CACHE).then(() => undefined));
});

```

- [ ] **Step 6: Replace the navigation runtimeCaching rule**

In `app/sw.ts`, find the navigation rule (the last entry in `runtimeCaching`, with the long "Navigation (page) requests: StaleWhileRevalidate, partitioned" comment and `cacheName: "navigations"`). Replace the whole rule object AND its leading comment block with:

```ts
    /* ── Navigation (page) requests: network-first, /offline fallback ──
     *
     * The entire app is authenticated, so navigation HTML always embeds
     * per-user data. We therefore NEVER cache it: no auth-partition key
     * to maintain, no risk of serving User A's shell to User B, no stale
     * shell after a deploy. Always fetch live; on network failure fall
     * back to the cached, user-agnostic /offline page.
     *
     * This is the rhyme.com model adapted to an all-authenticated app:
     * cache public assets, never the shell. See
     * docs/superpowers/specs/2026-06-28-pwa-strategy-rhyme-audit.md
     */
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: async ({ request }) => {
        try {
          return await fetch(request);
        } catch {
          const cached = await caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE });
          return cached ?? Response.error();
        }
      },
    },
```

- [ ] **Step 7: Remove the Serwist `fallbacks` block**

In `app/sw.ts`, find and delete the entire `fallbacks` option passed to the `Serwist` constructor (the block with the "Offline fallback for navigation requests" comment and `entries: [{ url: OFFLINE_URL, matcher: ... }]`), including its trailing comma. The custom navigation handler in Step 6 now owns the fallback.

- [ ] **Step 8: Type-check the service worker**

Run: `npx tsc --noEmit -p tsconfig.sw.json`
Expected: PASS, no errors. (If it reports an unused `OFFLINE_URL` or similar, re-check Steps 4/6 — both reference it.)

- [ ] **Step 9: Commit**

```bash
git add app/sw.ts
git commit -m "feat(pwa): network-first navigation, drop auth-partitioned shell cache"
```

---

## Task 2: Remove the offline-mutation outbox from the service worker

**Files:**
- Modify: `app/sw.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: an `app/sw.ts` with no IndexedDB outbox code and no `sync` event listener.

- [ ] **Step 1: Delete the outbox section**

In `app/sw.ts`, delete the entire final section starting at the comment header `Offline mutation outbox replay (Phase 5 P5.6).` through the end of the file. This removes, in full: the `OUTBOX_DB` / `OUTBOX_STORE` / `OUTBOX_DB_VERSION` / `OUTBOX_SYNC_TAG` constants, the `OutboxRecord` interface, `openOutboxDB`, `readAllOutboxRecords`, `deleteOutboxRecord`, `replayOutbox`, the `SyncEvent` interface, and the `self.addEventListener("sync", ...)` listener.

After deletion the file ends with the `notificationclick` listener's closing `});`.

- [ ] **Step 2: Type-check the service worker**

Run: `npx tsc --noEmit -p tsconfig.sw.json`
Expected: PASS, no errors, no unused-symbol warnings.

- [ ] **Step 3: Confirm no outbox identifiers remain in the SW**

Run: `grep -n "outbox\|OUTBOX\|replayOutbox\|SyncEvent\|ae-offline-outbox\|ae-outbox-sync" app/sw.ts`
Expected: no output (all references gone).

- [ ] **Step 4: Commit**

```bash
git add app/sw.ts
git commit -m "feat(pwa): remove offline mutation outbox from service worker"
```

---

## Task 3: Remove outbox client glue and fix the burn-report submit path

**Files:**
- Delete: `lib/offline-outbox.ts`
- Delete: `components/system/OutboxManager.tsx`
- Modify: `app/(app)/layout.tsx`
- Modify: `components/humidor/BurnReport.tsx`

**Interfaces:**
- Consumes: the existing `fetch("/api/burn-report", ...)` submit in `BurnReport.tsx`.
- Produces: a burn-report submit whose network-failure path surfaces a retry error (no queuing). No remaining imports of `@/lib/offline-outbox` or `OutboxManager` anywhere.

- [ ] **Step 1: Remove the OutboxManager mount from the app layout**

In `app/(app)/layout.tsx`, delete the import line:

```ts
import { OutboxManager } from "@/components/system/OutboxManager";
```

and delete the render line:

```tsx
      <OutboxManager />
```

- [ ] **Step 2: Remove the offline-outbox import from BurnReport**

In `components/humidor/BurnReport.tsx`, delete the import line:

```ts
import { enqueueFetchMutation, isLikelyOfflineError } from "@/lib/offline-outbox";
```

- [ ] **Step 3: Replace the submit catch block**

In `components/humidor/BurnReport.tsx`, find the catch block (currently starting `} catch (err) {` with the "fetch threw" comment and the `isLikelyOfflineError(err)` branch through its closing `}` before `setSubmitting(false); setSuccess(true);`). Replace the whole `catch (err) { ... }` body with:

```ts
    } catch (err) {
      /* fetch threw, typically a network failure. Surface it so the user
         can retry when back online. Offline queuing was removed with the
         PWA network-first simplification (see the 2026-06-28 rhyme audit
         spec); most lounges have wifi, so offline submit is not supported. */
      setSubmitError(
        err instanceof Error && err.message
          ? err.message
          : "Submit failed. Check your connection and try again.",
      );
      setSubmitting(false);
      return;
    }
```

- [ ] **Step 4: Delete the outbox source files**

```bash
git rm lib/offline-outbox.ts components/system/OutboxManager.tsx
```

- [ ] **Step 5: Confirm no dangling references repo-wide**

Run: `grep -rn "offline-outbox\|OutboxManager\|enqueueFetchMutation\|isLikelyOfflineError" app components lib`
Expected: no output. (If anything prints, remove that reference before continuing.)

- [ ] **Step 6: Type-check the app**

Run: `npx tsc --noEmit`
Expected: PASS, no errors (no unresolved imports, no unused `user`/`item` errors in BurnReport).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(pwa): drop offline outbox client glue, plain burn-report error path"
```

---

## Task 4: Remove iOS splash images

**Files:**
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: an `appleWebApp` metadata object with no `startupImage`; no `iosSplash` helper.

- [ ] **Step 1: Delete the `iosSplash` helper and its doc comment**

In `app/layout.tsx`, delete the comment block beginning `/* iOS launch (splash) images.` and the entire `const iosSplash = (...) => { ... };` arrow function that follows it.

- [ ] **Step 2: Remove the `startupImage` array**

In `app/layout.tsx`, change the `appleWebApp` block from:

```ts
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ash & Ember",
    startupImage: [
      /* iPhones — portrait. Listed largest to smallest so iOS picks
         the most specific match (it evaluates top-down). */
      iosSplash(440, 956, 3),  // 16 Pro Max
      iosSplash(402, 874, 3),  // 16 Pro
      iosSplash(430, 932, 3),  // 15 Pro Max, 14 Pro Max
      iosSplash(428, 926, 3),  // 14 Plus
      iosSplash(393, 852, 3),  // 15 Pro, 14 Pro
      iosSplash(414, 896, 3),  // 11 Pro Max, XS Max
      iosSplash(414, 896, 2),  // 11, XR
      iosSplash(390, 844, 3),  // 14, 13, 13 Pro, 12, 12 Pro
      iosSplash(375, 812, 3),  // 13 mini, 12 mini, 11 Pro, XS, X
      iosSplash(414, 736, 3),  // 8 Plus, 7 Plus, 6S Plus
      iosSplash(375, 667, 2),  // 8, 7, 6S, 6, SE (2/3)
      iosSplash(320, 568, 2),  // SE (1st gen), 5S, 5
      /* iPads — portrait. */
      iosSplash(1024, 1366, 2), // Pro 12.9"
      iosSplash(834, 1194, 2),  // Pro 11"
      iosSplash(820, 1180, 2),  // Air 10.9"
      iosSplash(810, 1080, 2),  // 10.2"
      iosSplash(744, 1133, 2),  // mini (6th gen)
      iosSplash(768, 1024, 2),  // 9.7", mini (older)
    ],
  },
```

to:

```ts
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ash & Ember",
    /* No startupImage set. The cold-open smoke overlay (server-rendered,
       throttled) covers the launch gap instead of native splash PNGs.
       Testing whether dropping splash regresses the launch feel — see the
       2026-06-28 rhyme audit spec. To restore: re-add startupImage with the
       iosSplash helper from git history. */
  },
```

- [ ] **Step 3: Confirm `iosSplash` is fully removed**

Run: `grep -n "iosSplash\|startupImage" app/layout.tsx`
Expected: no output.

- [ ] **Step 4: Type-check the app**

Run: `npx tsc --noEmit`
Expected: PASS, no errors (no unused `iosSplash`).

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(pwa): drop iOS splash image set, rely on cold-open overlay"
```

---

## Task 5: Full build, verification, and PR

**Files:** none (verification + git)

- [ ] **Step 1: Full production build (includes the Serwist SW build)**

Run: `npm run build`
Expected: build succeeds; `serwist build serwist.config.mjs` regenerates `public/sw.js` with no errors. Confirm the generated worker reflects the changes:

Run: `grep -c "navigations\|authPartition\|replayOutbox\|ae-outbox-sync" public/sw.js`
Expected: `0`.

Run: `grep -c "ae-offline-fallback" public/sw.js`
Expected: `1` or more (the new fallback cache name is present).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: PASS (no new errors in `app/sw.ts`, `app/layout.tsx`, `app/(app)/layout.tsx`, `components/humidor/BurnReport.tsx`).

- [ ] **Step 3: Unit tests (lib) still green**

Run: `npm run test:unit`
Expected: PASS. (No outbox tests existed; this confirms nothing in `lib/` depended on the deleted file.)

- [ ] **Step 4: PWA URL check**

Run: `npm run check:pwa`
Expected: PASS (manifest/PWA URL invariants unaffected by this change).

- [ ] **Step 5: Manual PWA verification checklist (record results in the PR body)**

Run `npm run dev` (or use a preview deploy) and, installed as an iOS PWA where possible, confirm:
- App launches and navigates between Home / Humidor / Lounge online after the worker swaps (first launch may swap the SW; second launch is clean).
- DevTools → Application → Cache Storage shows NO `navigations` cache and an `ae-offline-fallback` cache containing `/offline`. Navigation responses are served from network, not cache.
- Airplane mode → navigating to a not-yet-loaded route shows `/offline`, not a chrome error.
- A push notification still delivers and its tap routes into the app.
- Cold-open smoke overlay still plays on a throttled cold open.
- Launch feel without splash PNGs is acceptable (this is the thing under test).

- [ ] **Step 6: Push and open the PR**

```bash
git push -u origin feat/pwa-simplify-network-first
gh pr create --base main --title "feat(pwa): network-first SW, drop authed-shell cache + outbox + splash" --body "$(cat <<'EOF'
## Summary
Adopts rhyme.com's PWA model (adapted for an all-authenticated app): cache public/static assets, never the app shell.

- Navigation: auth-partitioned StaleWhileRevalidate → network-first with a cached `/offline` fallback. Retires the multi-user shell-leak risk and the auth-partition machinery.
- Removes the offline mutation outbox (SW `sync` handler, `lib/offline-outbox.ts`, `OutboxManager`, BurnReport queuing). Offline submit is no longer supported; most lounges have wifi.
- Removes the 17-entry iOS `apple-touch-startup-image` set; the cold-open smoke overlay covers the launch gap (under test).

## Out of scope (intentionally unchanged)
Static precache (`__SW_MANIFEST`), `serwist.config.mjs`, the `sw-precache-check` CI gate, push, telemetry, cold-smoke overlay, hydration watchdog, ResumeHandler, proxy auth timeout.

## Risk + rollback
Touches `app/sw.ts`. Steady state is safer (network-first can't serve stale/wrong-user shells); the risk window is the activation that swaps the worker and purges the legacy `navigations` cache. `/sw.js` is `max-age=0` so a bad worker is replaced on next launch. Rollback = revert this PR.

## Test plan
- [ ] `npm run build` (Serwist SW regenerates clean)
- [ ] `npm run lint`, `npm run test:unit`, `npm run check:pwa`
- [ ] Manual iOS PWA: launch/nav online, `/offline` on airplane mode, push delivery + tap routing, cold-smoke overlay, no `navigations` cache, `ae-offline-fallback` present
- [ ] Launch feel acceptable without splash PNGs

Spec: docs/superpowers/specs/2026-06-28-pwa-strategy-rhyme-audit.md
EOF
)"
```

---

## Self-Review notes

- **Spec coverage:** Navigation strategy swap (Task 1), auth-partition removal (Task 1), outbox removal SW + client (Tasks 2-3), splash removal (Task 4), "keep static precache + CI gate + push + telemetry + overlays" (enforced as Global Constraints / out-of-scope). All spec section-8b items map to a task.
- **Deliberate non-TDD:** per Global Constraints, `app/sw.ts` has no unit harness (vitest is scoped to `lib/`, SW uses webworker globals). The deleted pure logic (`extractSubClaim`) is removed, not added, so there is nothing new to test-drive. Verification is typecheck + build + grep + manual PWA checks — the appropriate strategy for a SW refactor, stated honestly rather than via fabricated tests.
- **Type consistency:** `OFFLINE_URL`, `OFFLINE_CACHE`, `LEGACY_NAV_CACHE` defined once (Task 1 Step 1) and referenced in the install listener, activate purge, and navigation handler. The navigation `handler` uses Serwist's documented `RouteHandlerCallback` signature (`async ({ request }) => Promise<Response>`).
