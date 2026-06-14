# PWA Foundation Slice — Humidor Canary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the `/humidor` list route to a user-agnostic static shell whose per-user data loads via client SWR, behind a reusable client session context — proving the authed-zone client-shell pattern with the proxy left intact as the data guard.

**Architecture:** A non-blocking `AppSessionProvider` (mounted in the `(app)` layout) resolves the Supabase session client-side and exposes it via context; it does NOT redirect app-wide (the proxy still guards every server-rendered route). The `/humidor` page becomes a static client shell: a `HumidorRoute` wrapper reads the session context, applies the shared `resolveSessionGate` redirect logic, and renders `HumidorClient` (which already fetches via SWR). No service-worker change is needed — navigation HTML is already `StaleWhileRevalidate`-cached.

**Tech Stack:** Next.js 16 App Router (client components), Supabase browser client (`@supabase/ssr`), SWR, Vitest (node env).

---

## Honest scope note

This slice is for **nav/data cleanliness and a user-agnostic shell**, not for fixing the ~10s
resume. Navigation HTML already paints from the SW cache (`app/sw.ts` `StaleWhileRevalidate`,
the #470 fix), so the resume stall is almost certainly post-paint and out of scope here. The
resume is **measured** (Task 6) and any post-paint cause is filed separately. See
`docs/superpowers/specs/2026-06-14-pwa-foundation-humidor-canary-design.md`.

**Design refinement vs spec:** the spec described `AppSessionProvider` as a blocking guard.
This plan makes it a **non-blocking context** and puts the redirect-gate in the per-route
wrapper (`HumidorRoute`). Reason: a blocking provider would add a session-check delay and
briefly unmount the layout's system components (`ResumeHandler`, `OutboxManager`) on every
authed route — the opposite of a responsiveness goal. Same user-facing behavior (no
authed-data flash), smaller blast radius.

---

## File structure

- **Create** `lib/auth/session-gate.ts` — pure `resolveSessionGate()` (redirect decision). Testable.
- **Create** `lib/auth/__tests__/session-gate.test.ts` — unit tests.
- **Create** `components/system/app-session.tsx` — `AppSessionProvider` + `useAppSession()` context.
- **Modify** `app/(app)/layout.tsx` — wrap the returned tree in `AppSessionProvider`.
- **Create** `app/(app)/humidor/HumidorRoute.tsx` — client wrapper: gate + render `HumidorClient`.
- **Modify** `app/(app)/humidor/page.tsx` — static shell that renders `HumidorRoute` (no `getServerUser`, no server island).
- **Modify** `components/humidor/HumidorClient.tsx` — make initial-data props optional; fetch on mount when unseeded; safe empty-array defaults.

`app/(app)/humidor/_islands.tsx` (the server `HumidorDataIsland`) is left in the tree but no
longer imported by `/humidor` — do NOT delete it (other reasoning may reference the pattern;
removal is a separate cleanup).

---

## Task 1: Pure session-gate resolver (TDD)

**Files:**
- Create: `lib/auth/session-gate.ts`
- Test: `lib/auth/__tests__/session-gate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { resolveSessionGate } from "@/lib/auth/session-gate";

describe("resolveSessionGate", () => {
  it("sends an unauthenticated user to login", () => {
    expect(resolveSessionGate({ hasSession: false, onboardingCompleted: false, pathname: "/humidor" }))
      .toBe("login");
    expect(resolveSessionGate({ hasSession: false, onboardingCompleted: true, pathname: "/humidor" }))
      .toBe("login");
  });

  it("sends an onboarding-incomplete user to onboarding from a normal route", () => {
    expect(resolveSessionGate({ hasSession: true, onboardingCompleted: false, pathname: "/humidor" }))
      .toBe("onboarding");
  });

  it("allows an onboarding-incomplete user to stay on the onboarding route", () => {
    expect(resolveSessionGate({ hasSession: true, onboardingCompleted: false, pathname: "/onboarding" }))
      .toBe("allow");
    expect(resolveSessionGate({ hasSession: true, onboardingCompleted: false, pathname: "/onboarding/step-2" }))
      .toBe("allow");
  });

  it("allows a fully authenticated user", () => {
    expect(resolveSessionGate({ hasSession: true, onboardingCompleted: true, pathname: "/humidor" }))
      .toBe("allow");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- session-gate`
Expected: FAIL — cannot resolve `@/lib/auth/session-gate`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Pure redirect decision for the authed zone, mirroring proxy.ts gating.
 *
 * Used by per-route client guards (e.g. HumidorRoute) so the
 * static-shell routes enforce the same rules the proxy enforces
 * server-side. Pure + synchronous so it is unit-testable.
 */

export type SessionGate = "login" | "onboarding" | "allow";

export function resolveSessionGate(input: {
  hasSession: boolean;
  onboardingCompleted: boolean;
  pathname: string;
}): SessionGate {
  const { hasSession, onboardingCompleted, pathname } = input;
  if (!hasSession) return "login";
  if (!onboardingCompleted && !pathname.startsWith("/onboarding")) return "onboarding";
  return "allow";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- session-gate`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth/session-gate.ts lib/auth/__tests__/session-gate.test.ts
git commit -m "feat(auth): pure resolveSessionGate for client-side route gating"
```

---

## Task 2: `AppSessionProvider` + `useAppSession`

**Files:**
- Create: `components/system/app-session.tsx`

No automated test (React context with a Supabase side-effect; the repo has no RTL/jsdom). The
gating logic it relies on is already tested in Task 1. Gate is `npx tsc --noEmit`.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export interface AppSession {
  userId:              string;
  email:               string | null;
  onboardingCompleted: boolean;
}

interface AppSessionValue {
  /** true once the initial getSession() has resolved */
  ready:   boolean;
  /** the authenticated session, or null if signed out */
  session: AppSession | null;
}

const AppSessionContext = createContext<AppSessionValue>({ ready: false, session: null });

export function useAppSession(): AppSessionValue {
  return useContext(AppSessionContext);
}

type SupabaseUser = {
  id:             string;
  email?:         string;
  user_metadata?: Record<string, unknown>;
};

function toAppSession(user: SupabaseUser | null | undefined): AppSession | null {
  if (!user) return null;
  return {
    userId:              user.id,
    email:               user.email ?? null,
    onboardingCompleted: Boolean(user.user_metadata?.onboarding_completed),
  };
}

/**
 * Non-blocking session context for the authed zone. Resolves the
 * Supabase session client-side (getSession reads local storage, no
 * network) and keeps it current via onAuthStateChange. It does NOT
 * redirect — the proxy still guards server-rendered routes; per-route
 * client guards (e.g. HumidorRoute) apply resolveSessionGate where a
 * route is served as a static shell.
 */
export function AppSessionProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<AppSessionValue>({ ready: false, session: null });

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) setValue({ ready: true, session: toAppSession(data.session?.user) });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (active) setValue({ ready: true, session: toAppSession(s?.user) });
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <AppSessionContext.Provider value={value}>{children}</AppSessionContext.Provider>;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/system/app-session.tsx
git commit -m "feat(system): non-blocking AppSessionProvider client session context"
```

---

## Task 3: Mount the provider in the `(app)` layout

**Files:**
- Modify: `app/(app)/layout.tsx`

- [ ] **Step 1: Add the import**

Add to the existing import block near the other `@/components/system/*` imports:

```tsx
import { AppSessionProvider } from "@/components/system/app-session";
```

- [ ] **Step 2: Wrap the returned tree**

In `export default function AppLayout(...)`, the return currently is `return ( <> ... </> );`.
Replace the opening `<>` with `<AppSessionProvider>` and the closing `</>` with
`</AppSessionProvider>`. The full return becomes:

```tsx
  return (
    <AppSessionProvider>
      <ScrollReset />
      <ResumeHandler />
      <OfflineBanner />
      <PushSubscriptionHealthCheck />
      <OutboxManager />
      <PersistentStorageRequest />
      <ServiceWorkerUpdateNotice />
      <StaleBuildNotice />
      <main
        id="main-content"
        className={
          hideNav
            ? "flex-1 app-container"
            : "flex-1 app-container pb-[calc(88px+env(safe-area-inset-bottom))] lg:pb-0"
        }
        style={{
          touchAction: "pan-y",
          marginLeft: hideNav ? 0 : "var(--app-content-left)",
        }}
      >
        {children}
      </main>
      {!hideNav && <A2HSBanner />}
      {!hideNav && <BottomNav />}
      {!hideNav && <SideRailNav />}
    </AppSessionProvider>
  );
```

(The provider is non-blocking, so `ResumeHandler`/`OutboxManager`/etc. render exactly as
before. Only consumers of `useAppSession` change behavior.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/layout.tsx"
git commit -m "feat(app): mount AppSessionProvider in the (app) layout"
```

---

## Task 4: `HumidorClient` — optional initial data, client fetch on mount

**Files:**
- Modify: `components/humidor/HumidorClient.tsx`

Today the component requires `initialItems`/`initialHasWishlist` (server-seeded) and uses
`revalidateOnMount: false`. Make the initial props optional so the component fetches purely
client-side when unseeded, with safe array/boolean defaults so the existing memos never see
`undefined`.

- [ ] **Step 1: Add a stable empty-list constant**

In the `Constants` section (near `SORT_LABELS`, around line 71), add:

```tsx
/* Stable reference so SWR's `data = initialItems ?? EMPTY_ITEMS`
   default doesn't create a new array each render (which would break
   downstream useMemo deps). */
const EMPTY_ITEMS: HumidorItem[] = [];
```

- [ ] **Step 2: Make the props optional**

Replace the `HumidorClientProps` interface (around line 424) with:

```tsx
interface HumidorClientProps {
  /** Server-seeded data. Omitted on the client-shell route — the
      component then fetches on mount. */
  initialItems?:       HumidorItem[];
  initialHasWishlist?: boolean;
  userId:              string;
}
```

- [ ] **Step 3: Update the items SWR call**

Replace the items `useSWR` block (around lines 444–456) with:

```tsx
  const {
    data:       items     = initialItems ?? EMPTY_ITEMS,
    isLoading,
    isValidating: loading,
    error:      itemsError,
    mutate:     mutateItems,
  } = useSWR(
    keyFor.humidorItems(userId),
    () => fetchHumidorItems(userId),
    {
      fallbackData:      initialItems,
      /* When unseeded (client-shell route) fetch on mount; when the
         server seeded us (legacy path) skip the redundant round-trip. */
      revalidateOnMount: initialItems === undefined,
    },
  );
```

- [ ] **Step 4: Update the hasWishlist SWR call**

Replace the hasWishlist `useSWR` block (around lines 464–474) with:

```tsx
  const {
    data:   hasWishlist = initialHasWishlist ?? false,
    mutate: mutateHasWishlist,
  } = useSWR(
    keyFor.hasWishlist(userId),
    () => fetchHasWishlistItems(userId),
    {
      fallbackData:      initialHasWishlist,
      revalidateOnMount: initialHasWishlist === undefined,
    },
  );
```

- [ ] **Step 5: Show the skeleton during the first client load**

In the content block (around line 685) the skeleton currently renders on `loading` only:
`{loading ? ( ...skeletons... ) : error ? ...`. Change that opening condition to also cover
the initial client load:

```tsx
        {(isLoading || loading) ? (
```

(Leave the rest of the chain — `error ? ... : items.length === 0 ? <EmptyState .../> : ...` —
unchanged. `items` is always an array via the Step 3 default, so `items.length` is safe.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (`isLoading` is a valid field on SWR's return; `loading` is still
`isValidating`.)

- [ ] **Step 7: Commit**

```bash
git add components/humidor/HumidorClient.tsx
git commit -m "feat(humidor): HumidorClient fetches client-side when unseeded"
```

---

## Task 5: `/humidor` becomes a static client shell

**Files:**
- Create: `app/(app)/humidor/HumidorRoute.tsx`
- Modify: `app/(app)/humidor/page.tsx`

- [ ] **Step 1: Create the route wrapper**

Create `app/(app)/humidor/HumidorRoute.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppSession } from "@/components/system/app-session";
import { resolveSessionGate } from "@/lib/auth/session-gate";
import { HumidorClient } from "@/components/humidor/HumidorClient";
import { HumidorShellSkeleton } from "./_skeletons";

/**
 * Client entry for the static /humidor shell. Reads the session from
 * AppSessionProvider, applies the same gate the proxy applies, and
 * renders HumidorClient (which fetches its own data via SWR). While the
 * session is resolving or a redirect is pending, it shows the neutral
 * shell skeleton — never authed data.
 */
export function HumidorRoute() {
  const { ready, session } = useAppSession();
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;
    const gate = resolveSessionGate({
      hasSession:          session !== null,
      onboardingCompleted: session?.onboardingCompleted ?? false,
      pathname,
    });
    if (gate === "login") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (gate === "onboarding") {
      router.replace("/onboarding");
    }
  }, [ready, session, pathname, router]);

  if (!ready || !session) return <HumidorShellSkeleton />;
  return <HumidorClient userId={session.userId} />;
}
```

- [ ] **Step 2: Replace the page with the static shell**

Replace the entire contents of `app/(app)/humidor/page.tsx` with:

```tsx
import { HumidorRoute } from "./HumidorRoute";

/*
 * Humidor — static client shell. No server data fetch and no
 * getServerUser() here, so the route renders user-agnostic HTML that
 * the service worker can serve to anyone (it carries no PII; per-user
 * data arrives client-side in HumidorClient). Auth gating happens
 * client-side in HumidorRoute; the proxy still 401s the data queries.
 */
export default function HumidorPage() {
  return <HumidorRoute />;
}
```

(Removing `getServerUser()` — which calls `headers()` — is what makes the route static.
The old `Suspense`/`HumidorDataIsland`/`getServerUser`/`redirect` imports are gone.)

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm run build`
Expected: build succeeds. Confirm `/humidor` is reported as a static/prerendered route (no
longer dynamic) in the build output route table.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/humidor/HumidorRoute.tsx" "app/(app)/humidor/page.tsx"
git commit -m "feat(humidor): /humidor renders as a static client shell"
```

---

## Task 6: Verification + measurement

**Files:** none (verification only)

- [ ] **Step 1: Unit + types + lint**

Run: `npm run test:unit`
Expected: PASS, including `session-gate`.

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm run lint`
Expected: no new errors in the touched files.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds; `/humidor` is static.

- [ ] **Step 3: On-device verification (Dave's iPhone, after deploy/preview)**

Confirm, signed in:
1. Cold launch → `/humidor` paints the shell, then the cigar list fills via SWR.
2. Tab to/from Humidor → no full reload; client navigation.
3. Add a cigar → list updates (SWR cache coherence from #503 intact).
4. Pull/refresh button still works.

Confirm gating:
5. Sign out, navigate to `/humidor` → redirected to `/login` with no flash of cigar data.
6. A fresh account mid-onboarding → `/humidor` redirects to `/onboarding`.

- [ ] **Step 4: Measurement (resume characterization, no new code)**

`measureInteractivity()` already runs globally via `HydrationMark` (root `app/layout.tsx`)
and reports to the `perf_interactivity` / `slow_hydration` bucket. After the canary is live,
read the Speed Insights / reliability telemetry for `/humidor` resume-to-interactive and
compare against the pre-canary baseline. Record the finding:
- If resume improved → note it.
- If resume is still ~10s → confirms the post-paint hypothesis; file a separate
  diagnosis task (ResumeHandler / hydration / longtasks). Do NOT claim the canary fixed it.

- [ ] **Step 5: Push + open PR**

```bash
git push -u origin feat/pwa-foundation-humidor-canary
gh pr create --base main --title "PWA foundation: /humidor static shell + client session context" --body "Implements docs/superpowers/plans/2026-06-14-pwa-foundation-humidor-canary.md. First slice of the hybrid-architecture migration. Proxy untouched (still guards data). Not expected to fix the 10s resume (measured, filed separately if post-paint)."
```

---

## Self-review notes

- **Spec coverage:** AppSessionProvider (T2/T3) ✓; static shell `/humidor` (T5) ✓; client SWR
  data (T4, reusing existing fetchers/keys) ✓; client gate parity via `resolveSessionGate`
  (T1, used in T5) ✓; measurement (T6) ✓; SW change — correctly omitted per the spec finding
  that nav HTML is already `StaleWhileRevalidate`-cached ✓.
- **Deviation logged:** non-blocking provider + per-route gate (vs spec's blocking provider) —
  rationale in the scope note; preserves no-flash behavior, avoids latency regression.
- **Placeholder scan:** none.
- **Type consistency:** `AppSession` (`userId`/`email`/`onboardingCompleted`), `useAppSession`
  returning `{ ready, session }`, and `resolveSessionGate({ hasSession, onboardingCompleted,
  pathname })` are used identically across T1, T2, T5. `HumidorClient` props now
  `initialItems?`/`initialHasWishlist?`/`userId`; T5 calls it with only `userId`.
```
