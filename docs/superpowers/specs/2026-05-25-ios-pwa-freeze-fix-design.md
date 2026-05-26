# iOS PWA Freeze Fix — Design Spec

**Date:** 2026-05-25
**Status:** Approved

---

## Problem

iOS PWA users experience a frozen screen after leaving the app for extended periods and returning. The screen shows whatever was in the viewport; scrolling produces no content below the fold; taps do nothing. Recovery requires force-closing the app multiple times.

**Root cause:** `window.location.reload()` called automatically (without user interaction) in iOS WKWebView standalone mode triggers a navigation the WebView cannot route cleanly through the service worker. JavaScript stops executing. The screen freezes.

Two automatic call sites:

| File | Line | Trigger |
|------|------|---------|
| `ResumeHandler.tsx` | 101 | JS heartbeat stale on mount (heap was evicted) |
| `ResumeHandler.tsx` | 153 | App backgrounded >5 min on iOS standalone |
| `hydration-watchdog.ts` | 40 | Hydration not complete after 15s |

---

## Scope

Three files. No schema changes. No new dependencies.

**Out of scope:**
- Black/white screen on initial cold load (separate investigation)
- `StaleBuildNotice.tsx` and `ServiceWorkerUpdateNotice.tsx` reload calls (user-triggered taps, not automatic — low risk)
- `stale-chunk-recovery.ts` reload call (fires only after chunk 404s which require an online fetch — iOS freeze is an offline-only issue)

---

## Design

### 1. `components/system/ResumeHandler.tsx`

Replace both automatic `window.location.reload()` calls with soft recovery: token refresh + router refresh. By the time either path runs, React is mounted and the JS heap is alive. A soft refresh achieves the same goal (fresh auth token, fresh server data) without triggering a WebView navigation.

**Path A — stale heartbeat (currently line 101):**

Before:
```ts
sessionStorage.setItem(HEARTBEAT_KEY, Date.now().toString());
window.location.reload();
return;
```

After:
```ts
sessionStorage.setItem(HEARTBEAT_KEY, Date.now().toString());
supabase.auth.refreshSession().catch(() => {});
router.refresh();
// no return — let heartbeat timer and event listeners set up normally
```

**Path B — long background resume (currently line 153):**

Before:
```ts
safeMark(MARK_IOS_RELOAD);
window.location.reload();
return;
```

After:
```ts
safeMark(MARK_IOS_RELOAD);
supabase.auth.refreshSession().catch(() => {});
router.refresh();
return; // keep: prevents double-call with the refresh block below
```

Both `supabase` and `router` are already in scope at both call sites.

---

### 2. `components/system/hydration-watchdog.ts`

Add iOS PWA detection to the inline `<script>`. When the 15s timer fires on iOS standalone, inject a DOM overlay instead of calling `location.reload()`. The overlay button is user-initiated, so `window.location.reload()` inside the click handler is reliable (user-triggered navigations go through the standard WKWebView pipeline, unlike programmatic ones).

Non-iOS behavior is unchanged.

**iOS standalone detection (vanilla JS, no imports):**
```js
var isIOSPWA = /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  (window.matchMedia('(display-mode: standalone)').matches ||
   !!navigator.standalone);
```

**Overlay spec:**
- Position: `fixed`, `inset: 0`, `z-index: 9999`
- Background: `#1A1210` (matches app background token)
- Layout: flexbox, column, centered
- Message text: `"A new version is available. Refresh to update."`
- Message color: `#A69080` (muted foreground token)
- Message font-size: `15px`
- Message font-family: `Inter, sans-serif`
- Button label: `"Refresh"`
- Button background: `#C17817` (primary amber token)
- Button text color: `#F5E6D3` (foreground token)
- Button padding: `14px 32px`, `border-radius: 8px`, `font-size: 16px`, `font-weight: 600`
- Button `onclick`: `window.location.reload()`

All colors are inlined (no CSS class access in inline head script).

**Rate-limit counter on iOS path:** Increment `sessionStorage` tries before injecting the overlay (same as the non-iOS path). If the reload succeeds, `__AE_HYDRATED` is set quickly on the next load and the timer cancels cleanly. If it fails again, tries >= 1 prevents a second overlay injection — the user sees whatever partial UI exists instead of another overlay loop.

**Updated watchdog flow on iOS PWA:**
```
timer fires + __AE_HYDRATED !== true + isIOSPWA
  → performance.mark('ae:watchdog-fired')
  → increment sessionStorage tries
  → inject overlay
  → user taps "Refresh"
  → window.location.reload() [user-initiated, reliable]
```

**Updated watchdog flow on non-iOS:**
```
timer fires + __AE_HYDRATED !== true
  → performance.mark('ae:watchdog-fired')
  → sessionStorage rate-limit check
  → location.reload() [existing behavior, unchanged]
```

---

## Files Changed

| File | Change |
|------|--------|
| `components/system/ResumeHandler.tsx` | Replace 2× `window.location.reload()` with soft recovery |
| `components/system/hydration-watchdog.ts` | Add iOS guard + DOM overlay injection |

---

## Testing

- **Manual (iOS PWA):** Install PWA from `www.ashember.vip`. Background for 6+ min. Return. Confirm app refreshes without freezing.
- **Manual (iOS PWA, heartbeat path):** Background for extended period until iOS evicts heap. Return. Confirm app recovers.
- **Manual (watchdog path):** Throttle network to offline in DevTools, wait 15s on a page. Confirm overlay appears with "Refresh" button. Tap — confirm reload completes.
- **Regression (non-iOS):** Confirm existing watchdog reload behavior unchanged on desktop Chrome/Safari.
- **Performance marks:** Verify `ae:watchdog-fired`, `ae:ios-resume-reload`, `ae:stale-revive-reload` still land on User Timing when their paths trigger.
