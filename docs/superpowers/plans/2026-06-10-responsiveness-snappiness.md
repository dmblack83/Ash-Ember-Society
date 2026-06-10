# App Responsiveness / Snappiness Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement Parts A and B task-by-task. Steps use checkbox (`- [ ]`) syntax. Part C is a roadmap — each phase gets its own detailed plan when picked up.

**Goal:** Make the app feel snappy (closer to a native/SPA feel) by removing per-navigation overhead, in three sequenced steps.

**Architecture:** The app feels sluggish because Next.js App Router couples navigation to server work — each tab tap fetches an uncacheable per-user RSC payload through the auth proxy, and a View Transition animation runs on every swap. Part A removes the animation (instant swaps). Part B fixes notification taps to route in place instead of reloading. Part C (the real lever) migrates the main tabs to client-rendered + SWR-cached data so navigation shows cached state instantly and revalidates in the background — the SPA snappiness, without leaving Next.js.

**Tech Stack:** Next.js App Router, React 19 (`ViewTransition`), service worker (`app/sw.ts`), SWR (`lib/data/keys.ts`, `components/SWRProvider.tsx`).

**Sequencing:** Do **A** first (smallest, immediate feel win), then **B** (small, fixes a real iOS reload), then **C** phase by phase (largest, the actual fix for everyday sluggishness). A and B are independent and each ships as its own PR. C ships one feature per PR.

**Diagnosis reference:** 2026-06-10 session. The snappy competitor (Cigarro) is an Expo/RN-Web SPA — navigation is pure client-side with no per-tap server round-trip. Their `notificationclick` uses postMessage SPA navigation (the source of Part B's pattern). Their model isn't copyable wholesale (different stack), but Part C brings the same client-navigation feel into this app.

---

# Part A — Remove the route-change View Transition

**Why:** Every tab swap currently runs the React `<ViewTransition>` (a ~220ms crossfade snapshot-and-animate). It's CPU/render work on each navigation (not bandwidth) and adds perceived lag versus an instant swap. Removing it makes navigation instant.

**Files:**
- Modify: `app/(app)/layout.tsx`
- Modify: `app/globals.css`

**Safety note:** The cold-launch splash ("cold-smoke" overlay) fades out via a **plain CSS opacity transition** (`html.cold-smoke-active.cold-smoke-fading .cold-smoke-overlay { opacity: 0; transition: opacity 1s ease-out; }`), NOT via the View Transitions API. So removing route transitions must not break the splash — but it MUST be verified (Step 5). Leave all `ae-cold-smoke` CSS in place.

- [ ] **Step 1: Drop the `ViewTransition` import and wrapper in `app/(app)/layout.tsx`**

Change line 3 from:

```tsx
import { useEffect, ViewTransition } from "react";
```
to:
```tsx
import { useEffect } from "react";
```

Then replace the wrapper block (currently around lines 271-281):

```tsx
        {/* View Transition wrapper — animates the main content swap
            between routes. Bottom nav + side rail sit OUTSIDE this
            wrapper so they don't fade with the content. Browsers
            without View Transitions API support render this as a
            passthrough; no animation, no error. Reduced-motion
            preference disables all animation via the CSS in
            globals.css. See node_modules/next/dist/docs/01-app/
            02-guides/view-transitions.md for the full guide. */}
        <ViewTransition>
          {children}
        </ViewTransition>
```
with just:
```tsx
        {children}
```

- [ ] **Step 2: Remove the now-unused `viewTransitionName` inline styles in `app/(app)/layout.tsx`**

In `BottomNav`, the `<nav>` style object contains:
```tsx
        /* Anchored across view transitions — paired with the
           `::view-transition-group(ae-bottom-nav)` rule in
           globals.css that disables the animation. Without this,
           the API treats the nav as part of the root snapshot and
           cross-fades it with the rest of the document. */
        viewTransitionName: "ae-bottom-nav",
```
Delete those lines (the comment and the `viewTransitionName: "ae-bottom-nav",` property).

In `SideRailNav`, the `<nav>` style contains:
```tsx
        /* Same anchoring as BottomNav — the desktop side rail should
           not fade in/out during route transitions. */
        viewTransitionName: "ae-side-rail",
```
Delete those lines (the comment and the `viewTransitionName: "ae-side-rail",` property).

- [ ] **Step 3: Remove the dead route/nav view-transition CSS in `app/globals.css`**

Delete these two rule blocks (search by selector). First, the root crossfade duration block and its comment:

```css
/* View Transitions — slightly slower than the browser default so the
   crossfade reads as intentional motion rather than a flash. 220ms
   sits in the sweet spot per Material's "complex/expanding" guidance
   (200-300ms): fast enough to feel responsive, slow enough to register
   as a transition. Applied to the default (unnamed) view-transition
   group that wraps <main>'s children in app/(app)/layout.tsx. */
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 220ms;
}
```

Second, the bottom-nav / side-rail anchoring block and its comment:

```css
/* Anchor the bottom nav and desktop side rail across transitions.
   By giving each its own `viewTransitionName` (set inline in
   app/(app)/layout.tsx), they leave the root snapshot and become
   their own animated groups. The rules below collapse those groups
   to a no-op so the navs stay visually fixed while the content
   swaps. `display: none` on the old snapshot prevents the brief
   double-paint flash where both old and new navs would otherwise
   render in the same spot. */
::view-transition-group(ae-bottom-nav),
::view-transition-group(ae-side-rail) {
  animation: none;
  z-index: 100;
}
::view-transition-old(ae-bottom-nav),
::view-transition-old(ae-side-rail) {
  display: none;
}
::view-transition-new(ae-bottom-nav),
::view-transition-new(ae-side-rail) {
  animation: none;
}
```

**Do NOT remove** the `ae-cold-smoke` rules (`::view-transition-group(ae-cold-smoke)` etc.), the `view-transition-name: ae-cold-smoke` on the overlay, or the `@media (prefers-reduced-motion: reduce)` view-transition block — they are tied to the splash overlay and are harmless when no route transitions fire.

- [ ] **Step 4: Type-check + verify no stray references**

Run: `npx tsc --noEmit --pretty false`
Expected: clean (no error about `ViewTransition`).

Run: `grep -rn "ViewTransition\|viewTransitionName" app/\(app\)/layout.tsx`
Expected: no matches.

Run: `grep -rn "view-transition" app/globals.css`
Expected: only `ae-cold-smoke` lines and the `prefers-reduced-motion` block remain (no `root`, `ae-bottom-nav`, or `ae-side-rail`).

- [ ] **Step 5: Build + manual verification**

Run: `npm run build`
Expected: succeeds.

Manual (dev or preview):
- [ ] Tap between bottom-nav tabs — the content swap is **instant**, no crossfade.
- [ ] Cold-launch the app (or hard refresh) — the **splash still fades out normally** (the cold-smoke overlay opacity transition is intact).
- [ ] The home page still renders its Suspense islands (they just appear without a crossfade).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/layout.tsx" app/globals.css
git commit -m "perf(nav): remove route-change View Transition for instant tab swaps"
```

---

# Part B — Notification taps route in place (no reload)

**Why:** `app/sw.ts` `notificationclick` currently calls `client.navigate(targetUrl)`, which forces a full page reload and is unreliable inside installed iOS PWAs. Switching to focus + `postMessage` lets the already-running app do an in-place client-side route change (the Cigarro pattern), which is faster and avoids the reload/relogin.

**Files:**
- Create: `components/system/ServiceWorkerNavigator.tsx`
- Modify: `app/sw.ts` (the `notificationclick` handler)
- Modify: `app/layout.tsx` (mount the new component)

- [ ] **Step 1: Create the client-side listener**

Create `components/system/ServiceWorkerNavigator.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/* Listens for AE_NAVIGATE messages the service worker posts when a push
   notification is tapped, and performs an in-place client-side route change.
   Replaces the SW's previous client.navigate(), which forced a full reload
   and is unreliable inside installed iOS PWAs (WebKit). Renders nothing. */
export function ServiceWorkerNavigator() {
  const router = useRouter();

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const d = event.data as { type?: string; url?: string } | null;
      if (d && d.type === "AE_NAVIGATE" && typeof d.url === "string") {
        router.push(d.url);
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  return null;
}
```

- [ ] **Step 2: Mount it in `app/layout.tsx`**

Add the import alongside the other system components (near the `ReliabilityBootstrap` import):

```tsx
import { ServiceWorkerNavigator } from "@/components/system/ServiceWorkerNavigator";
```

And render it next to `<ReliabilityBootstrap />` in the body:

```tsx
        <ReliabilityBootstrap />
        <ServiceWorkerNavigator />
```

- [ ] **Step 3: Swap `navigate()` for focus + postMessage in `app/sw.ts`**

In the `notificationclick` handler, the current inner loop + fallback reads:

```ts
    for (const client of allClients) {
      if ("focus" in client) {
        try {
          await (client as WindowClient).navigate(targetUrl);
        } catch {
          // navigate() can fail cross-origin or in some PWA modes;
          // we still focus the existing window below.
        }
        return (client as WindowClient).focus();
      }
    }

    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
```

Replace it with:

```ts
    for (const client of allClients) {
      if ("focus" in client) {
        // Bring the running app forward, then hand it the target path so
        // it routes in place. No client.navigate() — that forces a full
        // reload and is unreliable in installed iOS PWAs. The app's
        // ServiceWorkerNavigator listens for AE_NAVIGATE and router.push()es.
        try {
          await (client as WindowClient).focus();
        } catch {
          // Some platforms refuse focus on certain client states; the
          // postMessage below still routes the already-visible app.
        }
        try {
          client.postMessage({ type: "AE_NAVIGATE", url: targetUrl });
          return;
        } catch {
          // Detached client — fall through to the next candidate.
          continue;
        }
      }
    }

    // No live app window — open one at the target route. For an installed
    // PWA this launches the app; in a browser it opens a tab.
    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
```

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit --pretty false`
Expected: clean.

Run: `npm run build`
Expected: succeeds, `public/sw.js` written.

- [ ] **Step 5: Commit**

```bash
git add components/system/ServiceWorkerNavigator.tsx app/layout.tsx app/sw.ts
git commit -m "perf(push): notification tap routes in place via postMessage, no reload"
```

- [ ] **Step 6: Manual verification (on preview, with a real push)**

Requires a deploy so the new SW activates. Then:
- [ ] App open/backgrounded → tap a push notification → the app comes forward and **routes in place** to the target URL (no full reload/flash, session intact).
- [ ] App fully closed → tap a push → it **opens at the target URL**.

**Edge case (acceptable):** if the app window exists but React hasn't mounted the listener yet (very fresh open), the message can be missed and the app stays on its current route. Rare; not worth extra machinery. Note it in the PR.

---

# Part C — SWR migration roadmap (the real snappiness fix)

**This is a roadmap, not a bite-sized task list.** Each phase below is substantial (it touches data loading, mutations, and optimistic updates for a whole feature) and gets its **own** spec + detailed plan when picked up. Do them one feature per PR, in priority order.

**Why this is the actual fix:** today the main tabs are server-rendered, so navigating to them waits on an uncacheable per-user RSC fetch through the auth proxy. Migrating each tab to **client-rendered + SWR-cached** means the second-and-later visits render the cached data **instantly** while revalidating in the background — the SPA snappiness. The foundation already exists: `components/SWRProvider.tsx` (one shared cache) and `lib/data/keys.ts` (`keyFor.*` tuple keys for humidor, wishlist, lounge feed, profile, etc.).

## Migration recipe (apply per feature)

For a given tab/feature currently rendered server-side and hydrated via props:

1. **Confirm/add the key + fetcher.** Reuse the existing `keyFor.*` builder in `lib/data/keys.ts` (add one if the feature has no key yet, following the tuple convention documented at the top of that file). The fetcher is a client function that calls the same Supabase query the server component used.
2. **Seed, don't flash.** In the feature's client component, replace the prop-drilled initial data with `useSWR(keyFor.X(args), fetcher, { fallbackData: initialDataFromProps })`. The server still provides the first-paint data as `fallbackData` (no loading flash on the very first visit), but SWR now **caches** it — so navigating away and back renders instantly from cache.
3. **Mutations update the cache.** Replace direct refetch-after-write with optimistic `mutate(keyFor.X(args), optimisticValue, { revalidate: true })`, rolling back on error (the optimistic-update pattern from `rules/web/patterns.md`).
4. **Trim the server work.** Once the client owns the data, reduce the server component to the minimal shell (or a thin loader that just passes `fallbackData`), so the route's RSC payload shrinks and the navigation round-trip gets cheaper too.
5. **Verify the win:** navigate to the tab, leave, come back — the return is **instant** (cached), with a background revalidation updating any changes. Confirm mutations reflect immediately and reconcile.

## Phases (priority order — most-navigated first)

- [ ] **Phase C1 — Humidor** (`components/humidor/HumidorClient.tsx`, `components/humidor/WishlistClient.tsx`). Primary daily-use tab; biggest perceived win. Keys: `keyFor.humidorItems(userId)`, `keyFor.humidorItem(itemId)`, `keyFor.wishlist(userId)`. Write its own plan first (mutations: add/remove/move-to-wishlist, quantity edits — these need careful optimistic handling).
- [ ] **Phase C2 — Lounge** (`components/lounge/LoungeForumClient.tsx`, `components/lounge/CategoryFeed.tsx`, `components/lounge/FeedbackCard.tsx`). Keys: `keyFor.loungeFeed(categoryId, filter, page, userId)` (note pagination + the all/mine filter partition already designed into the key). Own plan; the paginated feed + per-user liked state make this the trickiest — plan the infinite/paged SWR shape explicitly.
- [ ] **Phase C3 — Discover cigars** (`components/.../DiscoverCigarsClient.tsx`). Catalog browse/search. Mostly read-heavy, so the simplest of the three; good candidate to do last as a clean win. Own plan.

## Notes / guardrails

- One feature per PR. Don't migrate all three at once — each has its own mutation surface and regression risk.
- Respect the reliability working agreement for anything touching auth/proxy paths.
- Keep `fallbackData` from the server on first visit so there's never a worse first-paint than today.
- This pairs with the in-flight cold-load interactivity telemetry (PR #498): once that data lands, confirm whether warm-navigation latency is dominated by the RSC round-trip (which C removes) before investing further.

---

## Self-Review

**Spec coverage:**
- A: remove route ViewTransition (layout + globals) with splash-safety verification → Part A, Steps 1-5. ✓
- B: SW notificationclick → focus + postMessage AE_NAVIGATE + client listener doing router.push → Part B, Steps 1-3. ✓
- C: SWR remaining migrations (Humidor, Lounge, Discover) as a phased roadmap with a recipe, on the existing `keyFor.*` foundation, each phase its own plan → Part C. ✓

**Placeholder scan:** A and B contain full code/edits and exact verify commands. C is intentionally a roadmap (declared as such, with concrete recipe steps + named files/keys) — not falsely detailed, per the decomposition guidance. No TBD/TODO.

**Type consistency:** The SW posts `{ type: "AE_NAVIGATE", url }` (Part B Step 3) and the listener checks `d.type === "AE_NAVIGATE"` and `d.url` (Part B Step 1) — message shape matches. `keyFor.*` names in Part C match the builders documented in `lib/data/keys.ts`.
