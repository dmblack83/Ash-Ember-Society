# Reliability Instrumentation Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire structured Sentry events for the five reliability buckets (SW lifecycle, auth/session, network resilience, iOS WebKit, state persistence) so future reliability PRs can validate against rate-and-trend instead of anecdote.

**Architecture:** One shared TS helper (`lib/telemetry/reliability.ts`) calls `Sentry.captureMessage` with a discriminated-union tag schema. A small client bootstrap (`components/system/ReliabilityBootstrap.tsx`) bridges two execution contexts where Sentry is not directly available: (1) the service worker, which posts `RELIABILITY_EVENT` messages to clients, and (2) inline `<head>` scripts, which set sessionStorage sentinels + performance marks that the bootstrap reads on mount. Six PRs total: PR A lands the helper + bridge + first bucket; B-E ship each remaining bucket; PR F lands the in-repo dashboard doc after 24h of real data.

**Tech Stack:** TypeScript, Next.js 16 App Router, @sentry/nextjs, Serwist (service worker), Vitest (unit tests), Playwright (E2E — not used in this pass).

**Spec:** [docs/superpowers/specs/2026-06-03-reliability-instrumentation-pass-design.md](../specs/2026-06-03-reliability-instrumentation-pass-design.md)

**Working agreement:** [docs/superpowers/specs/2026-06-03-reliability-working-agreement.md](../specs/2026-06-03-reliability-working-agreement.md)

---

## Pre-flight (every PR)

Before starting any PR below, sync `main`:

```bash
git fetch origin main
git checkout main
git merge --ff-only origin/main
git log --oneline main..origin/main   # must print nothing
```

Then branch off freshly-synced `main` per the branch-name convention used in each PR.

## Pre-flight (only before PR A)

Confirm the current Sentry plan can absorb the expected event volume before PR A merges. Order-of-magnitude estimate: dozens of reliability events per day under normal conditions, low hundreds during an active incident.

Open Sentry → Settings → Subscription. Confirm monthly event quota has headroom. If quota is tight, switch the noisier subtypes (`nav_cache_stale`, `chunk_load_error`, `optimistic_rollback`) to sampled `Sentry.captureMessage` calls before merging PR A by wrapping their call sites with `if (Math.random() < 0.1) trackReliability(...)`. Document in the PR description if so.

---

## PR A — Helper, bootstrap, and sw_lifecycle bucket

**Branch:** `feat/reliability-telemetry-helper`

**Goal:** Land the `trackReliability` helper, the client bootstrap that bridges SW + inline-head-script contexts, and the four `sw_lifecycle` call sites.

### Task A1: Write failing tests for the helper

**Files:**
- Create: `lib/telemetry/__tests__/reliability.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as Sentry from "@sentry/nextjs";
import { trackReliability } from "../reliability";

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
}));

describe("trackReliability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls Sentry.captureMessage with reliability:bucket.subtype message", () => {
    trackReliability({ bucket: "sw_lifecycle", subtype: "activate_fail" });
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "reliability:sw_lifecycle.activate_fail",
      expect.any(Object),
    );
  });

  it("applies the type=reliability tag and bucket/subtype tags", () => {
    trackReliability({ bucket: "auth_session", subtype: "jwt_verify_fail", cause: "bad_signature" });
    const call = vi.mocked(Sentry.captureMessage).mock.calls[0];
    const opts = call[1] as { tags: Record<string, string> };
    expect(opts.tags.type).toBe("reliability");
    expect(opts.tags.bucket).toBe("auth_session");
    expect(opts.tags.subtype).toBe("jwt_verify_fail");
    expect(opts.tags.cause).toBe("bad_signature");
  });

  it("defaults cause tag to 'unknown' when omitted", () => {
    trackReliability({ bucket: "ios_webkit", subtype: "splash_fail" });
    const opts = vi.mocked(Sentry.captureMessage).mock.calls[0][1] as { tags: Record<string, string> };
    expect(opts.tags.cause).toBe("unknown");
  });

  it("sets level to warning", () => {
    trackReliability({ bucket: "state_persistence", subtype: "draft_save_fail" });
    const opts = vi.mocked(Sentry.captureMessage).mock.calls[0][1] as { level: string };
    expect(opts.level).toBe("warning");
  });

  it("truncates detail to 200 chars", () => {
    const long = "x".repeat(300);
    trackReliability({ bucket: "network_resilience", subtype: "fetch_timeout", detail: long });
    const opts = vi.mocked(Sentry.captureMessage).mock.calls[0][1] as { extra: { detail: string } };
    expect(opts.extra.detail).toHaveLength(200);
  });

  it("merges custom extra fields after detail", () => {
    trackReliability({
      bucket: "network_resilience",
      subtype: "body_too_large",
      extra: { size_bytes: 5_000_000 },
    });
    const opts = vi.mocked(Sentry.captureMessage).mock.calls[0][1] as { extra: Record<string, unknown> };
    expect(opts.extra.size_bytes).toBe(5_000_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/telemetry/__tests__/reliability.test.ts`
Expected: FAIL with "Cannot find module '../reliability'"

### Task A2: Implement the helper

**Files:**
- Create: `lib/telemetry/reliability.ts`

- [ ] **Step 1: Write the helper module**

```typescript
import * as Sentry from "@sentry/nextjs";

export type ReliabilityBucket =
  | "sw_lifecycle"
  | "auth_session"
  | "network_resilience"
  | "ios_webkit"
  | "state_persistence";

export type ReliabilitySubtype =
  // sw_lifecycle
  | "activate_fail"
  | "precache_fail"
  | "nav_cache_stale"
  | "update_banner_cycle"
  // auth_session
  | "jwt_verify_fail"
  | "proxy_auth_timeout"
  | "cookie_domain_mismatch"
  | "oauth_host_drift"
  // network_resilience
  | "body_too_large"
  | "outbox_replay_fail"
  | "fetch_timeout"
  | "chunk_load_error"
  // ios_webkit
  | "splash_fail"
  | "scope_violation"
  | "redirect_loop"
  | "hydration_watchdog_fired"
  // state_persistence
  | "draft_save_fail"
  | "optimistic_rollback"
  | "edit_dropped";

export interface ReliabilityEvent {
  bucket:  ReliabilityBucket;
  subtype: ReliabilitySubtype;
  cause?:  string;
  detail?: string;
  extra?:  Record<string, string | number | boolean>;
}

export function trackReliability(e: ReliabilityEvent): void {
  Sentry.captureMessage(`reliability:${e.bucket}.${e.subtype}`, {
    level: "warning",
    tags: {
      type:    "reliability",
      bucket:  e.bucket,
      subtype: e.subtype,
      cause:   e.cause ?? "unknown",
    },
    extra: {
      detail: e.detail?.slice(0, 200),
      ...e.extra,
    },
  });
}
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run lib/telemetry/__tests__/reliability.test.ts`
Expected: PASS — 6 tests passing.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/telemetry/reliability.ts lib/telemetry/__tests__/reliability.test.ts
git commit -m "feat(telemetry): trackReliability helper + tests"
```

### Task A3: Implement the client bootstrap

**Files:**
- Create: `components/system/ReliabilityBootstrap.tsx`

**Why:** Two execution contexts cannot call `trackReliability` directly:
1. The service worker — different bundle, no `@sentry/nextjs` import.
2. Inline `<head>` scripts — run before any bundle loads.

The bootstrap is a small client component, mounted once in `app/layout.tsx`, that:
- Listens for `RELIABILITY_EVENT` postMessages from the SW and forwards them to `trackReliability`.
- On mount, scans for known performance marks (`ae:watchdog-fired`, `ae:chunk-load-error`) and forwards them as the matching reliability events.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useEffect } from "react";
import {
  trackReliability,
  type ReliabilityBucket,
  type ReliabilitySubtype,
} from "@/lib/telemetry/reliability";

interface SwReliabilityMessage {
  type:     "RELIABILITY_EVENT";
  bucket:   ReliabilityBucket;
  subtype:  ReliabilitySubtype;
  cause?:   string;
  detail?:  string;
  extra?:   Record<string, string | number | boolean>;
}

function isSwReliabilityMessage(d: unknown): d is SwReliabilityMessage {
  if (!d || typeof d !== "object") return false;
  const m = d as Record<string, unknown>;
  return m.type === "RELIABILITY_EVENT" && typeof m.bucket === "string" && typeof m.subtype === "string";
}

/*
 * Bridges SW and inline-head-script reliability signals into the
 * trackReliability helper. Mounted once at the app root.
 */
export default function ReliabilityBootstrap() {
  useEffect(() => {
    /* 1. Listen for SW-bridged events. */
    const onMessage = (event: MessageEvent) => {
      if (!isSwReliabilityMessage(event.data)) return;
      trackReliability({
        bucket:  event.data.bucket,
        subtype: event.data.subtype,
        cause:   event.data.cause,
        detail:  event.data.detail,
        extra:   event.data.extra,
      });
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);

    /* 2. Forward inline-head-script signals once per session.
     *
     * The head scripts (stale-chunk-recovery, hydration-watchdog)
     * write try-counters to sessionStorage and trigger a reload.
     * Performance marks reset on reload — sessionStorage does not.
     * We read the counters here and fire telemetry exactly once
     * per session per signal, guarded by our own sessionStorage flag.
     */
    if (typeof window !== "undefined") {
      const FIRED_KEY = "ae-reliability-fired";
      const fired = new Set((sessionStorage.getItem(FIRED_KEY) ?? "").split(",").filter(Boolean));
      const markFired = (name: string) => {
        fired.add(name);
        sessionStorage.setItem(FIRED_KEY, Array.from(fired).join(","));
      };

      const watchdogTries = parseInt(sessionStorage.getItem("ae-hydrate-watchdog-tries") ?? "0", 10);
      if (watchdogTries >= 1 && !fired.has("watchdog")) {
        trackReliability({
          bucket:  "ios_webkit",
          subtype: "hydration_watchdog_fired",
          cause:   "head_script",
          extra:   { tries: watchdogTries },
        });
        markFired("watchdog");
      }

      const chunkTries = parseInt(sessionStorage.getItem("ae-chunk-bust-tries") ?? "0", 10);
      if (chunkTries >= 1 && !fired.has("chunk")) {
        trackReliability({
          bucket:  "network_resilience",
          subtype: "chunk_load_error",
          cause:   "head_script",
          extra:   { tries: chunkTries },
        });
        markFired("chunk");
      }
    }

    return () => {
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);

  return null;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

### Task A4: Mount the bootstrap in `app/layout.tsx`

**Files:**
- Modify: `app/layout.tsx` — add ReliabilityBootstrap import + mount

- [ ] **Step 1: Read the current layout to find the mount point**

Run: `grep -n "ServiceWorker\|HydrationMark\|<body" app/layout.tsx | head -10`

You will see existing system-level components mounted near the body root (e.g., `HydrationMark`, `ServiceWorkerUpdateNotice`). Mount `ReliabilityBootstrap` alongside them.

- [ ] **Step 2: Add the import**

In `app/layout.tsx`, add to the imports block:

```typescript
import ReliabilityBootstrap from "@/components/system/ReliabilityBootstrap";
```

- [ ] **Step 3: Mount the component**

In the same JSX block where `HydrationMark` and `ServiceWorkerUpdateNotice` are rendered, add:

```tsx
<ReliabilityBootstrap />
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/system/ReliabilityBootstrap.tsx app/layout.tsx
git commit -m "feat(telemetry): client bootstrap that bridges SW + head-script reliability signals"
```

### Task A5: Add SW-side postReliability helper

**Files:**
- Modify: `app/sw.ts` — add helper near the top of the file (after the imports, before the Serwist init)

**Why:** The SW runs in its own bundle and cannot import `@sentry/nextjs`. To get SW events into Sentry, the SW posts a `RELIABILITY_EVENT` message to every controlled client; the bootstrap (Task A3) forwards it.

- [ ] **Step 1: Find an existing helper near the top of `app/sw.ts` to anchor the insertion**

Run: `grep -n "^/\* ──\|^const\|^function" app/sw.ts | head -20`

Locate the section before the `new Serwist({ ... })` constructor call. Insert the new helper there.

- [ ] **Step 2: Add the helper**

```typescript
/* ──────────────────────────────────────────────────────────────────
   Bridge SW reliability signals into Sentry by posting to every
   controlled client. The client-side ReliabilityBootstrap component
   forwards the message into trackReliability.

   Fire-and-forget: postMessage to detached clients can throw — we
   swallow the error so the SW lifecycle is never blocked by telemetry.
   ────────────────────────────────────────────────────────────────── */
type ReliabilityBucket =
  | "sw_lifecycle"
  | "auth_session"
  | "network_resilience"
  | "ios_webkit"
  | "state_persistence";

interface SwReliabilityPayload {
  bucket:  ReliabilityBucket;
  subtype: string;
  cause?:  string;
  detail?: string;
  extra?:  Record<string, string | number | boolean>;
}

async function postReliability(p: SwReliabilityPayload): Promise<void> {
  try {
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    for (const client of clients) {
      try {
        client.postMessage({ type: "RELIABILITY_EVENT", ...p });
      } catch {
        /* detached client — non-fatal */
      }
    }
  } catch {
    /* matchAll may fail on iOS — non-fatal */
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.sw.json`
Expected: no errors.

### Task A6: Wire sw_lifecycle call sites in `app/sw.ts`

**Files:**
- Modify: `app/sw.ts` — 4 call sites

- [ ] **Step 1: Wire `activate_fail`**

Locate the activate handler around `app/sw.ts:475` (`self.addEventListener("activate", () => {`). The inner `catch` blocks currently swallow errors silently. Modify the outer-catch path to post telemetry:

```typescript
self.addEventListener("activate", () => {
  void (async () => {
    try {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const client of clients) {
        try {
          client.postMessage({ type: "SW_UPDATED", version: SW_VERSION });
        } catch {
          /* postMessage can throw on detached clients; non-fatal. */
        }
      }
    } catch (err) {
      /* matchAll can fail on iOS; non-fatal — but worth knowing. */
      void postReliability({
        bucket:  "sw_lifecycle",
        subtype: "activate_fail",
        cause:   "matchall_threw",
        detail:  err instanceof Error ? err.message : String(err),
      });
    }
  })();
});
```

- [ ] **Step 2: Wire `update_banner_cycle`**

The `SW_VERSION` constant is broadcast on every activate. The client component `ServiceWorkerUpdateNotice` already dedupes by stashing the dismissed version in localStorage. We need to fire telemetry when the dedupe SUPPRESSES the banner — i.e., the SW activated with the same version the user just dismissed.

This is a *client-side* signal, not a SW signal. Modify `components/system/ServiceWorkerUpdateNotice.tsx` instead.

Run: `grep -n "SW_UPDATED\|version\|localStorage" components/system/ServiceWorkerUpdateNotice.tsx | head -20`

Find the dedupe branch (the early-return that fires when the message version equals the just-dismissed version). Add immediately before the early return:

```typescript
import { trackReliability } from "@/lib/telemetry/reliability";

/* ... existing code ... */

if (dismissedVersion === incomingVersion) {
  trackReliability({
    bucket:  "sw_lifecycle",
    subtype: "update_banner_cycle",
    cause:   "version_match",
    extra:   { version: incomingVersion },
  });
  return; // existing dedupe behavior
}
```

If the exact dedupe branch differs, locate the equivalent guard and place the call there.

- [ ] **Step 3: Wire `precache_fail`**

Serwist's precache install is configured via the constructor (`precacheEntries: [...]`). Failures surface as a rejected `install` event. Add a listener that runs *after* Serwist's listeners (don't replace them — that breaks Serwist).

Locate the storage-quota install listener around `app/sw.ts:417` and add a second install listener immediately after it:

```typescript
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      /* Reading the cache that Serwist precaches into is a cheap probe:
         if precache failed, the cache won't exist or will be missing
         entries from the manifest. We sample one entry. */
      const manifest = (self as unknown as { __SW_MANIFEST?: Array<{ url: string }> }).__SW_MANIFEST ?? [];
      if (manifest.length === 0) return;
      const cache = await caches.open("serwist-precache-v2");
      const sample = manifest[0];
      const hit = await cache.match(sample.url);
      if (!hit) {
        await postReliability({
          bucket:  "sw_lifecycle",
          subtype: "precache_fail",
          cause:   "sample_miss",
          detail:  sample.url,
        });
      }
    } catch (err) {
      await postReliability({
        bucket:  "sw_lifecycle",
        subtype: "precache_fail",
        cause:   "probe_threw",
        detail:  err instanceof Error ? err.message : String(err),
      });
    }
  })());
});
```

Note: the cache name `serwist-precache-v2` is Serwist's default. If your Serwist version uses a different name, run `grep "precacheCacheName" node_modules/@serwist/sw/dist/*.d.ts` to confirm and adjust.

- [ ] **Step 4: Wire `nav_cache_stale`**

In the navigation StaleWhileRevalidate handler around `app/sw.ts:376-390`, the `redirected` property of the cached response is the signal. We need a custom Serwist plugin that inspects each cache hit.

Add this plugin definition above the Serwist constructor (anywhere after the imports):

```typescript
const navCacheStalePlugin = {
  cachedResponseWillBeUsed: async ({
    cachedResponse,
  }: {
    cachedResponse: Response | null;
  }) => {
    if (cachedResponse && cachedResponse.redirected) {
      void postReliability({
        bucket:  "sw_lifecycle",
        subtype: "nav_cache_stale",
        cause:   "redirected_in_cache",
        detail:  cachedResponse.url,
      });
    }
    return cachedResponse;
  },
};
```

Then add it to the navigation handler's plugin array (after `authPartitionPlugin`):

```typescript
plugins: [
  authPartitionPlugin,
  navCacheStalePlugin,
  new CacheableResponsePlugin({ statuses: [0, 200] }),
  new ExpirationPlugin({ /* ... unchanged ... */ }),
],
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.sw.json && npx tsc --noEmit`
Expected: no errors in either.

- [ ] **Step 6: Build the SW + app to confirm no runtime regression**

Run: `npm run build`
Expected: build completes successfully. (Note: do not deploy yet — that's Task A7.)

- [ ] **Step 7: Commit**

```bash
git add app/sw.ts components/system/ServiceWorkerUpdateNotice.tsx
git commit -m "feat(telemetry): sw_lifecycle bucket — activate_fail, precache_fail, nav_cache_stale, update_banner_cycle"
```

### Task A7: Open PR A and validate on preview

- [ ] **Step 1: Push and open PR**

```bash
git push -u origin feat/reliability-telemetry-helper
gh pr create --title "feat(telemetry): reliability helper + sw_lifecycle bucket" --body "$(cat <<'EOF'
**Root cause:** N/A — instrumentation, not a fix.
**Evidence:** Recent SW PRs (#473, #479, #480, #427) shipped without instrumentation; rate-and-trend invisible.
**Why this addresses X:** Lands the shared `trackReliability` helper, the client bootstrap that bridges SW + inline-head contexts, and four `sw_lifecycle` call sites. The Sentry "Reliability — SW" saved search populates after merge.
**Validation:** See trigger steps below.
**Revert:** Single squash-revert. No runtime behavior change beyond Sentry postMessage / network calls.

## Trigger steps on preview deploy

- Force a precache fail by gating a `public/` asset behind auth temporarily on this branch; reload PWA on preview; confirm `precache_fail` event in Sentry.
- Trigger `nav_cache_stale`: open a server-action route that issues a redirect, then navigate to the same URL after the cache populates. Confirm event.
- Confirm `update_banner_cycle` fires by manually dismissing the banner, then triggering another SW_UPDATED message with the same SW_VERSION (e.g., reload the PWA without redeploying).
- `activate_fail` is iOS-only; floor is code review.

## Out of scope

- Other four buckets (separate PRs).
- Sentry saved-search creation (manual, after PR E).
EOF
)"
```

- [ ] **Step 2: Verify preview events**

Wait for Vercel preview deploy. Use the trigger steps above; check `tags[type]:reliability` in Sentry's Issue Search. Each fired subtype must appear within 60s of the trigger.

- [ ] **Step 3: Merge**

Only merge after the validation events are confirmed in Sentry on the preview deploy.

---

## PR B — auth_session bucket

**Branch:** `feat/reliability-telemetry-auth-session`

**Goal:** Instrument JWT verify failures, the expired-token fallback timeout, and OAuth host-drift in `proxy.ts` + `app/actions/auth.ts`.

**Note on spec drift:** The original spec listed `cookie_domain_mismatch`. Code review during scouting showed this requires raw `Cookie` header parsing not currently in the proxy — out of scope for this pass. Three subtypes ship in PR B; `cookie_domain_mismatch` is deferred to a follow-up.

### Task B1: Wire `jwt_verify_fail` in `proxy.ts`

**Files:**
- Modify: `proxy.ts` — line ~150 (the `catch (err)` block) and ~181 (the silent non-expired branch)

- [ ] **Step 1: Add the import**

At the top of `proxy.ts`:

```typescript
import { trackReliability } from "@/lib/telemetry/reliability";
```

- [ ] **Step 2: Modify the catch block to fire telemetry on non-expired failures**

Replace the `} catch (err) { ... }` block in the proxy (currently around `proxy.ts:150-182`) with:

```typescript
} catch (err) {
  if (err instanceof joseErrors.JWTExpired) {
    // Slow path: access token expired — delegate to Supabase for a single
    // refresh network call. Fires at most once per user per ~1 hour.
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request: { headers: forwardHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      user = {
        id:                  session.user.id,
        email:               session.user.email,
        onboardingCompleted: Boolean(
          session.user.user_metadata?.onboarding_completed
        ),
      };
    }
  } else {
    /* Bad signature, malformed token, JWKS fetch fail, etc. — user stays null. */
    trackReliability({
      bucket:  "auth_session",
      subtype: "jwt_verify_fail",
      cause:   err instanceof Error ? err.name : "unknown",
      detail:  err instanceof Error ? err.message : String(err),
    });
  }
}
```

### Task B2: Wire `proxy_auth_timeout` around the expired-token fallback

**Files:**
- Modify: `proxy.ts` — wrap the `supabase.auth.getSession()` call in the expired-token path

**Why:** The expired-token fallback calls Supabase Auth over the network. On a cold connection or transient Auth API slowness, this can stall the proxy and hold the document response open. The existing code has no timeout; this task adds one PLUS fires telemetry on timeout. Behavior change: timed-out requests fall through to "unauthenticated" (the same outcome a bad-signature reaches).

- [ ] **Step 1: Add a Promise.race timeout helper at the top of the file**

Below the existing imports in `proxy.ts`:

```typescript
const AUTH_SESSION_TIMEOUT_MS = 3000;

function raceWithTimeout<T>(p: Promise<T>, ms: number): Promise<T | "__TIMEOUT__"> {
  return Promise.race([
    p,
    new Promise<"__TIMEOUT__">((resolve) => setTimeout(() => resolve("__TIMEOUT__"), ms)),
  ]);
}
```

- [ ] **Step 2: Wrap the `getSession()` call**

Inside the `if (err instanceof joseErrors.JWTExpired) { ... }` branch added in B1, replace:

```typescript
const { data: { session } } = await supabase.auth.getSession();
```

with:

```typescript
const sessionResult = await raceWithTimeout(supabase.auth.getSession(), AUTH_SESSION_TIMEOUT_MS);
if (sessionResult === "__TIMEOUT__") {
  trackReliability({
    bucket:  "auth_session",
    subtype: "proxy_auth_timeout",
    cause:   "getSession_3s",
    extra:   { timeout_ms: AUTH_SESSION_TIMEOUT_MS },
  });
} else {
  const session = sessionResult.data.session;
  if (session?.user) {
    user = {
      id:                  session.user.id,
      email:               session.user.email,
      onboardingCompleted: Boolean(
        session.user.user_metadata?.onboarding_completed
      ),
    };
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

### Task B3: Wire `oauth_host_drift` in `app/actions/auth.ts`

**Files:**
- Modify: `app/actions/auth.ts` — line ~81 (the `siteUrl` env-var fallback)

- [ ] **Step 1: Add the import**

At the top of `app/actions/auth.ts`:

```typescript
import { trackReliability } from "@/lib/telemetry/reliability";
```

- [ ] **Step 2: Wrap the fallback assignment to detect when it triggers**

Replace:

```typescript
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.ashember.vip'
```

with:

```typescript
const siteUrlEnv = process.env.NEXT_PUBLIC_SITE_URL;
const siteUrl    = siteUrlEnv || 'https://www.ashember.vip';
if (!siteUrlEnv) {
  trackReliability({
    bucket:  "auth_session",
    subtype: "oauth_host_drift",
    cause:   "site_url_env_empty",
    detail:  "NEXT_PUBLIC_SITE_URL was empty; fell back to www.ashember.vip",
  });
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add proxy.ts app/actions/auth.ts
git commit -m "feat(telemetry): auth_session bucket — jwt_verify_fail, proxy_auth_timeout, oauth_host_drift"
```

### Task B4: Open PR B and validate

- [ ] **Step 1: Push and open PR**

```bash
git push -u origin feat/reliability-telemetry-auth-session
gh pr create --title "feat(telemetry): auth_session bucket" --body "$(cat <<'EOF'
**Root cause:** N/A — instrumentation. One small behavior change: expired-token Supabase fallback now has a 3s timeout (previously unbounded). Timed-out requests fall through to unauthenticated, identical to bad-signature outcome.
**Evidence:** PR #444 introduced jose JWKS verification; failures and the expired-token Supabase fallback were uninstrumented.
**Why this addresses X:** Fires telemetry on JWT verify failure (non-expired), expired-token fallback timeout, and OAuth host-drift fallback.
**Validation:** See trigger steps below.
**Counter-evidence considered:** A 3s timeout on the fallback could mask a real Supabase outage. Counter: the same condition currently produces an indefinite document-response hang on iOS PWA — strictly worse. Timeout + unauth-redirect surfaces the issue faster.
**Revert:** Single squash-revert; restores unbounded fallback.

## Trigger steps on preview deploy

- `jwt_verify_fail`: `curl https://<preview>.vercel.app/home -H "cookie: sb-<projectref>-auth-token=base64-bogus"` — confirm `jwt_verify_fail` in Sentry.
- `oauth_host_drift`: temporarily unset `NEXT_PUBLIC_SITE_URL` on the preview deploy; trigger sign-in flow; confirm event.
- `proxy_auth_timeout`: not easily reproduced on preview without a deliberate Supabase Auth slowdown; floor is code review.

## Out of scope

- `cookie_domain_mismatch` — deferred; requires raw Cookie header parsing not currently in the proxy.
EOF
)"
```

- [ ] **Step 2: Validate + merge**

Confirm `jwt_verify_fail` and `oauth_host_drift` fire on preview. Merge.

---

## PR C — network_resilience bucket

**Branch:** `feat/reliability-telemetry-network`

**Goal:** Instrument chunk-load errors, outbox replay failures, and Vercel-4.5MB body limits.

**Scope adjustment vs spec:** `fetch_timeout` is removed from this PR. The spec referenced "the PR #290 proxy pattern" but the proxy refactor (PR #444) removed that pattern. No existing client-side Promise.race remains. Adding a generic fetch wrapper is out of scope; the subtype stays in the union for future use.

### Task C1: Wire `chunk_load_error` via the head-script bridge

**Files:**
- Already handled by `components/system/ReliabilityBootstrap.tsx` (Task A3).

- [ ] **Step 1: Verify the bootstrap forwards the `ae:chunk-load-error` perf mark**

Re-read `components/system/ReliabilityBootstrap.tsx` lines that handle `performance.getEntriesByName("ae:chunk-load-error")`. The bootstrap already forwards this to `trackReliability({ bucket: "network_resilience", subtype: "chunk_load_error", cause: "head_script" })`.

No code change required for chunk_load_error in PR C.

### Task C2: Wire `outbox_replay_fail` in `app/sw.ts`

**Files:**
- Modify: `app/sw.ts` — around lines 681-710 (the `for (const rec of records)` replay loop)

- [ ] **Step 1: Fire telemetry on permanent 4xx delete + network catch**

Locate the `replayOutbox` function around `app/sw.ts:667`. Replace the relevant section of the for-loop with:

```typescript
for (const rec of records) {
  try {
    const init: RequestInit = {
      method:      rec.method,
      headers:     rec.headers,
      credentials: "include",
    };
    if (rec.body !== null && rec.method !== "GET" && rec.method !== "HEAD") {
      init.body = rec.body;
    }

    const res = await fetch(rec.url, init);

    if (res.ok) {
      await deleteOutboxRecord(db, rec.id);
      continue;
    }

    /* 4xx (except 408 timeout, 429 rate-limit) are permanent —
       drop the record so we don't replay forever on a malformed
       or auth-rejected request. */
    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      void postReliability({
        bucket:  "network_resilience",
        subtype: "outbox_replay_fail",
        cause:   `http_${res.status}`,
        detail:  `${rec.method} ${rec.url}`,
        extra:   { status: res.status, category: rec.category },
      });
      await deleteOutboxRecord(db, rec.id);
      continue;
    }

    /* 5xx, 408, 429: leave for next sync. */
  } catch (err) {
    /* Network still failing — leave for next sync. */
    void postReliability({
      bucket:  "network_resilience",
      subtype: "outbox_replay_fail",
      cause:   "fetch_threw",
      detail:  err instanceof Error ? err.message.slice(0, 200) : String(err),
      extra:   { category: rec.category },
    });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.sw.json`
Expected: no errors.

### Task C3: Wire `body_too_large` in upload paths

**Files:**
- Modify: every fetch call site that uploads a body where 413 is possible. Find with: `grep -rn "fetch(.*method.*POST\|fetch(.*method.*PUT" components/ lib/ app/ --include="*.ts" --include="*.tsx" | grep -v node_modules`

**Practical scope:** burn-report photo upload and avatar upload are the only known 4.5MB-relevant paths. Add a tiny helper rather than instrumenting each call site.

- [ ] **Step 1: Create a small fetch-status-check helper**

Create file: `lib/telemetry/fetch-checks.ts`

```typescript
import { trackReliability } from "./reliability";

/*
 * Inspect a Response that came back from a fetch the caller cares
 * about. Fires `body_too_large` for 413; no-op otherwise. Designed
 * to be called on the response of every body-carrying client fetch
 * that could exceed Vercel's 4.5 MB limit (image upload paths).
 *
 * Returns the response unchanged so it can be inlined:
 *   const res = await checkResponse(await fetch(url, init), { route });
 */
export function checkResponse(res: Response, ctx: { route: string }): Response {
  if (res.status === 413) {
    trackReliability({
      bucket:  "network_resilience",
      subtype: "body_too_large",
      cause:   "http_413",
      detail:  ctx.route,
    });
  }
  return res;
}
```

- [ ] **Step 2: Find every fetch site that uploads a body, and wrap with `checkResponse`**

Run: `grep -rn "FormData\|multipart/form-data\|new FormData()" components/ lib/ --include="*.ts" --include="*.tsx" | grep -v node_modules`

For each site found, wrap the fetch result. Example pattern:

```typescript
// Before:
const res = await fetch("/api/burn-report", { method: "POST", body: formData });

// After:
import { checkResponse } from "@/lib/telemetry/fetch-checks";
const res = checkResponse(
  await fetch("/api/burn-report", { method: "POST", body: formData }),
  { route: "/api/burn-report" },
);
```

If grep returns more than ~5 sites, stop and consult Dave — instrumenting all of them in one PR may be larger than 100 LOC and warrant a split.

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add app/sw.ts lib/telemetry/fetch-checks.ts <list-of-modified-fetch-sites>
git commit -m "feat(telemetry): network_resilience bucket — outbox_replay_fail, body_too_large"
```

### Task C4: Open PR C and validate

- [ ] **Step 1: Push and open PR**

```bash
git push -u origin feat/reliability-telemetry-network
gh pr create --title "feat(telemetry): network_resilience bucket" --body "$(cat <<'EOF'
**Root cause:** N/A — instrumentation only.
**Evidence:** PRs #288 (chunk-load recovery) and #474 (Vercel 4.5MB limit fix) shipped without telemetry.
**Why this addresses X:** Forwards the existing `ae:chunk-load-error` perf mark to Sentry via the bootstrap from PR A. Adds outbox replay-failure telemetry. Adds a `checkResponse` helper used in upload paths to fire on 413.
**Validation:** See trigger steps below.
**Revert:** Single squash-revert.

## Trigger steps on preview deploy

- `chunk_load_error`: deploy this branch, manually delete a chunk URL from the CDN cache (or rename a chunk in the build), navigate; confirm event.
- `outbox_replay_fail`: enqueue an offline mutation against a deliberately broken route; let SW replay; confirm event.
- `body_too_large`: upload a >5MB photo via burn report on preview; confirm event.

## Scope note

`fetch_timeout` was deferred — no current Promise.race in client code. Subtype stays in the union for future use.
EOF
)"
```

- [ ] **Step 2: Validate + merge**

---

## PR D — ios_webkit bucket

**Branch:** `feat/reliability-telemetry-ios-webkit`

**Goal:** Instrument hydration watchdog, splash failures, manifest scope violations, and same-document redirect loops.

### Task D1: Confirm `hydration_watchdog_fired` is already wired

**Files:**
- No code change; the bootstrap (Task A3) already forwards the perf mark.

- [ ] **Step 1: Verify by re-reading `components/system/ReliabilityBootstrap.tsx`**

The mark-forward block for `ae:watchdog-fired` is present. Confirm and move on.

### Task D2: Wire `splash_fail`

**Files:**
- Modify: the component or layout that renders the cold-smoke overlay / splash image. Find with: `grep -rn "splash\|cold-smoke\|coldSmoke" components/ app/ --include="*.tsx" | grep -v node_modules | head -10`

- [ ] **Step 1: Locate the splash image element**

Run the grep above. The splash image is referenced in the cold-smoke overlay component.

- [ ] **Step 2: Add an `onError` handler**

Example pattern (adapt to actual JSX shape in the file):

```tsx
import { trackReliability } from "@/lib/telemetry/reliability";

// ... in JSX:
<img
  src="/icons/splash-logo.svg"
  alt=""
  onError={() => {
    trackReliability({
      bucket:  "ios_webkit",
      subtype: "splash_fail",
      cause:   "img_onerror",
    });
  }}
/>
```

If the splash is rendered via CSS `background-image` only (no `<img>` tag), this subtype is not instrumentable through onError. In that case: skip wiring and remove `splash_fail` from the union in `lib/telemetry/reliability.ts`. Document in the PR description.

### Task D3: Wire `scope_violation` in the bootstrap

**Files:**
- Modify: `components/system/ReliabilityBootstrap.tsx` — add a scope-check effect

- [ ] **Step 1: Add a scope check inside the existing `useEffect`**

Append to the `useEffect` body (before the cleanup return):

```typescript
/* Manifest scope check: fires once per session if the current host
   doesn't match the manifest's `scope` host. Detects PWAs bouncing
   into an in-app browser at the wrong scope. */
const SCOPE_KEY = "ae-scope-checked";
if (!sessionStorage.getItem(SCOPE_KEY)) {
  sessionStorage.setItem(SCOPE_KEY, "1");
  void (async () => {
    try {
      const res = await fetch("/manifest.webmanifest", { cache: "no-cache" });
      if (!res.ok) return;
      const m = (await res.json()) as { scope?: string };
      if (!m.scope) return;
      const scopeUrl = new URL(m.scope, location.origin);
      if (scopeUrl.host !== location.host) {
        trackReliability({
          bucket:  "ios_webkit",
          subtype: "scope_violation",
          cause:   "host_mismatch",
          detail:  `current=${location.host} scope=${scopeUrl.host}`,
        });
      }
    } catch {
      /* manifest fetch can fail offline — non-fatal */
    }
  })();
}
```

### Task D4: Wire `redirect_loop` detection

**Files:**
- Modify: `components/system/ReliabilityBootstrap.tsx` — count rapid same-document redirects

**Approach:** Track `performance.getEntriesByType("navigation")[0].redirectCount` on mount. If `redirectCount >= 3`, fire telemetry. This is the cleanest signal available in the browser; no SW changes required.

- [ ] **Step 1: Add the check to the bootstrap effect**

Append:

```typescript
/* Redirect loop detection: navigation timing reports redirectCount.
   3+ redirects on a single navigation strongly suggests a loop. */
if (typeof performance !== "undefined" && typeof performance.getEntriesByType === "function") {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (nav && nav.redirectCount >= 3) {
    trackReliability({
      bucket:  "ios_webkit",
      subtype: "redirect_loop",
      cause:   "navigation_timing",
      extra:   { redirect_count: nav.redirectCount },
    });
  }
}
```

- [ ] **Step 2: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add components/system/ReliabilityBootstrap.tsx <splash-component-file-if-modified>
git commit -m "feat(telemetry): ios_webkit bucket — splash_fail, scope_violation, redirect_loop"
```

### Task D5: Open PR D and validate

- [ ] **Step 1: Push and open PR**

```bash
git push -u origin feat/reliability-telemetry-ios-webkit
gh pr create --title "feat(telemetry): ios_webkit bucket" --body "$(cat <<'EOF'
**Root cause:** N/A — instrumentation only.
**Evidence:** PRs #289 (hydration watchdog), #468 (splash), #483 (redirect-loop bare-host fix) shipped without telemetry.
**Why this addresses X:** Adds splash onError, manifest scope-host check, and a 3+ redirect-count detection. The hydration_watchdog_fired subtype was already wired in PR A's bootstrap.
**Validation:** See trigger steps.
**Revert:** Single squash-revert.

## Trigger steps on preview deploy

- `scope_violation`: temporarily set manifest `scope` to a different host on preview; load PWA; confirm event.
- `redirect_loop`: configure a 3-hop redirect chain on a test route on preview; navigate; confirm event.
- `splash_fail`: rename the splash image in `public/` on preview; reload PWA; confirm event.
- `hydration_watchdog_fired`: already wired via PR A's bootstrap; trigger by adding a 20s blocker on a throwaway commit (DO NOT MERGE the blocker).
EOF
)"
```

- [ ] **Step 2: Validate + merge**

---

## PR E — state_persistence bucket

**Branch:** `feat/reliability-telemetry-state-persistence`

**Goal:** Instrument draft save failures, optimistic-update rollbacks, and "save returned OK but data didn't change" edit-dropped cases.

### Task E1: Wire `draft_save_fail` in `lib/burn-report-draft.ts`

**Files:**
- Modify: `lib/burn-report-draft.ts` — line ~92 (the `catch` in `saveBurnReportDraft`)

- [ ] **Step 1: Add the import**

```typescript
import { trackReliability } from "@/lib/telemetry/reliability";
```

- [ ] **Step 2: Replace the silent catch**

Replace:

```typescript
} catch {
  // localStorage full / blocked / disabled — fail silently.
  // Persistence is best-effort; the in-memory state is still valid.
}
```

with:

```typescript
} catch (err) {
  // localStorage full / blocked / disabled — fail silently for the user,
  // but record a telemetry event so the rate is visible.
  trackReliability({
    bucket:  "state_persistence",
    subtype: "draft_save_fail",
    cause:   err instanceof Error ? err.name : "unknown",
    detail:  err instanceof Error ? err.message : String(err),
  });
}
```

### Task E2: Wire `optimistic_rollback` in SWR mutation wrappers

**Files:**
- Find with: `grep -rn "onError\|optimisticData\|rollbackOnError" components/ lib/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -20`

- [ ] **Step 1: For each SWR `useSWRMutation` / `mutate` call with optimistic UI, add telemetry in the onError branch**

Example pattern:

```typescript
import { trackReliability } from "@/lib/telemetry/reliability";

const { trigger } = useSWRMutation(key, async (k, { arg }) => { /* ... */ }, {
  onError: (err) => {
    trackReliability({
      bucket:  "state_persistence",
      subtype: "optimistic_rollback",
      cause:   err instanceof Error ? err.name : "unknown",
      detail:  `key=${String(key)}`,
    });
    /* ... existing error handling ... */
  },
});
```

If grep returns more than ~6 sites, stop and consult Dave — splitting into a follow-up PR may be warranted.

### Task E3: Wire `edit_dropped` in the burn-report PATCH success path

**Files:**
- Modify: `components/humidor/BurnReport.tsx` — the `handleSaveEdit` success branch

**Definition:** the PATCH route returned 2xx, but the local re-fetch shows the data did not change. This is the bug class PR #481 fixed. The instrumentation guards against a future regression of the same class.

- [ ] **Step 1: Locate `handleSaveEdit`**

Run: `grep -n "handleSaveEdit\|PATCH" components/humidor/BurnReport.tsx | head -10`

- [ ] **Step 2: After a successful PATCH, compare the response to the submitted form**

Pattern (adapt to the actual response shape):

```typescript
import { trackReliability } from "@/lib/telemetry/reliability";

// ... inside handleSaveEdit, after PATCH success:
const submittedThirdsLen = form.thirds?.length ?? 0;
const returnedThirdsLen  = updatedReport.thirds?.length ?? 0;
if (submittedThirdsLen !== returnedThirdsLen) {
  trackReliability({
    bucket:  "state_persistence",
    subtype: "edit_dropped",
    cause:   "thirds_count_mismatch",
    extra:   { submitted: submittedThirdsLen, returned: returnedThirdsLen },
  });
}
```

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add lib/burn-report-draft.ts components/humidor/BurnReport.tsx <optimistic-rollback-sites>
git commit -m "feat(telemetry): state_persistence bucket — draft_save_fail, optimistic_rollback, edit_dropped"
```

### Task E4: Open PR E and validate

- [ ] **Step 1: Push and open PR**

```bash
git push -u origin feat/reliability-telemetry-state-persistence
gh pr create --title "feat(telemetry): state_persistence bucket" --body "$(cat <<'EOF'
**Root cause:** N/A — instrumentation only.
**Evidence:** PR #481 fixed an edit-dropped bug class with no telemetry on the broken path.
**Why this addresses X:** Adds telemetry on draft save failures, SWR optimistic rollbacks, and post-PATCH data-mismatch detection.
**Validation:** See trigger steps.
**Revert:** Single squash-revert.

## Trigger steps on preview deploy

- `draft_save_fail`: open burn report in incognito with localStorage disabled; edit; confirm event.
- `optimistic_rollback`: disconnect network mid-mutation; confirm event.
- `edit_dropped`: not directly triggerable on production code path; floor is code review.
EOF
)"
```

- [ ] **Step 2: Validate + merge**

---

## Sentry saved-search creation (manual, between PR E and PR F)

After PR E has shipped and at least 24h of real event data has accumulated, log into Sentry and create six saved searches.

### Task S1: Create six saved searches in Sentry UI

- [ ] **Step 1: Confirm reliability events are flowing**

In Sentry's Issue Search, query `tags[type]:reliability`. You should see grouped events from all five buckets.

- [ ] **Step 2: Create one saved search per row**

| Saved search name | Query |
|---|---|
| Reliability — overview | `tags[type]:reliability` |
| Reliability — SW | `tags[type]:reliability tags[bucket]:sw_lifecycle` |
| Reliability — Auth | `tags[type]:reliability tags[bucket]:auth_session` |
| Reliability — Network | `tags[type]:reliability tags[bucket]:network_resilience` |
| Reliability — iOS WebKit | `tags[type]:reliability tags[bucket]:ios_webkit` |
| Reliability — State | `tags[type]:reliability tags[bucket]:state_persistence` |

For each: enter the query, click "Save", apply the name from the table.

- [ ] **Step 3: Copy each saved-search URL**

You will paste these URLs into PR F.

---

## PR F — Dashboard doc

**Branch:** `docs/reliability-dashboard`

### Task F1: Write the dashboard doc

**Files:**
- Create: `docs/reliability/dashboard.md`

- [ ] **Step 1: Write the file**

```markdown
# Reliability Dashboard

The single page checked when triaging a user-reported reliability issue or when validating that a reliability fix moved the needle. Pairs with the [Reliability Working Agreement](../superpowers/specs/2026-06-03-reliability-working-agreement.md) and the [Instrumentation Pass spec](../superpowers/specs/2026-06-03-reliability-instrumentation-pass-design.md).

## Saved searches in Sentry

| View | Sentry URL |
|---|---|
| Overview | <PASTE URL FROM TASK S1> |
| SW | <PASTE URL> |
| Auth | <PASTE URL> |
| Network | <PASTE URL> |
| iOS WebKit | <PASTE URL> |
| State | <PASTE URL> |

## Bucket-subtype matrix

| Bucket | Subtypes |
|---|---|
| `sw_lifecycle` | `activate_fail`, `precache_fail`, `nav_cache_stale`, `update_banner_cycle` |
| `auth_session` | `jwt_verify_fail`, `proxy_auth_timeout`, `cookie_domain_mismatch` (deferred), `oauth_host_drift` |
| `network_resilience` | `body_too_large`, `outbox_replay_fail`, `fetch_timeout` (deferred), `chunk_load_error` |
| `ios_webkit` | `splash_fail`, `scope_violation`, `redirect_loop`, `hydration_watchdog_fired` |
| `state_persistence` | `draft_save_fail`, `optimistic_rollback`, `edit_dropped` |

## What a spike here usually means

(Fill in after the first week of real data. Replace each placeholder with a paragraph describing the typical shape of a spike in that bucket: what it looks like, what the most common root cause has been historically, which file to check first.)

- **`sw_lifecycle` spike:** <fill in>
- **`auth_session` spike:** <fill in>
- **`network_resilience` spike:** <fill in>
- **`ios_webkit` spike:** <fill in>
- **`state_persistence` spike:** <fill in>
```

Replace the `<PASTE URL>` placeholders with the actual Sentry URLs from Task S1. Leave the `<fill in>` placeholders — those get written in a future session after observing real data.

- [ ] **Step 2: Commit**

```bash
git add docs/reliability/dashboard.md
git commit -m "docs(reliability): dashboard doc with Sentry saved-search URLs"
```

### Task F2: Open and merge PR F

- [ ] **Step 1: Push and open PR**

```bash
git push -u origin docs/reliability-dashboard
gh pr create --title "docs(reliability): dashboard doc + saved-search URLs" --body "$(cat <<'EOF'
**Root cause:** N/A — documentation.
**Evidence:** Step 1 of the reliability working agreement is complete; this is the in-repo dashboard entry point.
**Why this addresses X:** Anchors the Sentry saved-search URLs in version control so they survive org renames, and documents the bucket-subtype matrix.
**Validation:** Each URL in the doc resolves to the correct Sentry view.
**Revert:** Trivial.
EOF
)"
```

- [ ] **Step 2: Merge**

After PR F merges, Step 1 of the reliability working agreement is complete. Subsequent reliability work follows the agreement's Step 4 cycle: dashboard review → pick bucket → diagnose → fix → validate.

---

## Self-review notes

Items resolved during plan-writing (acknowledged here so future readers see they were considered):

- **`cookie_domain_mismatch` scope:** dropped from PR B; the proxy uses `request.cookies.get(...)` which doesn't expose the cookie's `domain` attribute. Adding raw header parsing is non-trivial. Subtype stays in the union; sites can be added later.
- **`fetch_timeout` scope:** dropped from PR C; the only Promise.race timeout that existed was in the proxy at PR #290, which was refactored out by PR #444. Subtype stays in the union; sites can be added later.
- **SW context bridging:** spec didn't call out the postMessage bridge required to get SW events into Sentry. Plan handles this in PR A's Tasks A3 + A5 (`ReliabilityBootstrap` + `postReliability`).
- **Inline-head-script bridging:** same — perf-mark scan in the bootstrap (Task A3) handles `ae:watchdog-fired` and `ae:chunk-load-error`.
- **Splash CSS-only edge case:** Task D2 includes the contingency for when splash is rendered as a CSS background, with explicit fallback instructions (remove subtype from union, document in PR).
- **Behavior change in PR B:** the 3s timeout on the expired-token fallback is a small behavior change, not pure instrumentation. Called out in the PR description block.
```
