# iOS PWA Freeze Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace automatic `window.location.reload()` calls on iOS PWA standalone with safe soft-recovery, and show a user-triggered "Refresh" overlay when the hydration watchdog fires.

**Architecture:** Two files change. `ResumeHandler.tsx` replaces both automatic reload paths with `supabase.auth.refreshSession()` + `router.refresh()` — soft recovery that works without triggering a WKWebView navigation freeze. `hydration-watchdog.ts` adds iOS PWA detection to the inline head script; on iOS it injects a DOM overlay with a user-triggered "Refresh" button instead of auto-reloading.

**Tech Stack:** Next.js App Router, TypeScript, Supabase client, vanilla DOM APIs (for inline script), Serwist SW

---

## File Map

| File | Change |
|------|--------|
| `components/system/ResumeHandler.tsx` | Replace 2× `window.location.reload()` with soft recovery |
| `components/system/hydration-watchdog.ts` | Add iOS guard + DOM overlay in inline script string |

No new files. No schema changes. No dependency changes.

---

## Task 1: Create feature branch

**Files:** none

- [ ] **Sync main and cut branch**

```bash
git fetch origin main
git checkout main
git merge --ff-only origin/main
git checkout -b fix/ios-pwa-freeze
```

- [ ] **Verify clean start**

```bash
git log --oneline main..origin/main
# Should print nothing — local main is current
```

---

## Task 2: Fix ResumeHandler — stale heartbeat path

**Files:**
- Modify: `components/system/ResumeHandler.tsx` (stale heartbeat block, currently lines 93–108)

**Context:** When iOS evicts the JS heap and the user returns, React mounts fresh. The heartbeat timestamp in `sessionStorage` is stale (JS wasn't running). This block detects that and currently calls `window.location.reload()` — which freezes the iOS PWA WebView. By the time this code runs, the JS heap is already alive (React is mounted), so soft recovery achieves the same goal.

- [ ] **Locate the stale heartbeat block**

In `components/system/ResumeHandler.tsx`, find this block inside the `useEffect`:

```ts
if (iosStandalone) {
  try {
    const last = parseInt(sessionStorage.getItem(HEARTBEAT_KEY) ?? "0", 10);
    if (last > 0 && Date.now() - last > HEARTBEAT_STALE_MS) {
      safeMark(MARK_STALE_REVIVE);
      /* Update the heartbeat BEFORE reloading so the post-reload
         mount sees a fresh value and doesn't loop. */
      sessionStorage.setItem(HEARTBEAT_KEY, Date.now().toString());
      window.location.reload();
      return;
    }
  } catch {
    /* sessionStorage can throw in some privacy modes; treat as
       "no signal" and fall through to normal resume handling. */
  }
}
```

- [ ] **Replace with soft recovery**

Replace the entire block above with:

```ts
if (iosStandalone) {
  try {
    const last = parseInt(sessionStorage.getItem(HEARTBEAT_KEY) ?? "0", 10);
    if (last > 0 && Date.now() - last > HEARTBEAT_STALE_MS) {
      safeMark(MARK_STALE_REVIVE);
      sessionStorage.setItem(HEARTBEAT_KEY, Date.now().toString());
      supabase.auth.refreshSession().catch(() => {});
      router.refresh();
      /* No return — let the heartbeat timer and event listeners
         set up normally below. */
    }
  } catch {
    /* sessionStorage can throw in some privacy modes; treat as
       "no signal" and fall through to normal resume handling. */
  }
}
```

- [ ] **Verify TypeScript compiles**

```bash
npx tsc --noEmit
# Expected: no errors
```

---

## Task 3: Fix ResumeHandler — long background path

**Files:**
- Modify: `components/system/ResumeHandler.tsx` (long background block, currently lines 147–155 inside `onResume`)

**Context:** When the user returns after >5 min with JS alive (app backgrounded but not heap-evicted), this block detects the gap and auto-reloads. Same freeze issue. `router.refresh()` re-fetches server component data; `supabase.auth.refreshSession()` renews the token — same outcomes as reload, no navigation.

- [ ] **Locate the long background block**

Inside the `onResume` function, find:

```ts
if (
  iosStandalone &&
  hiddenAt !== null &&
  now - hiddenAt > IOS_RELOAD_THRESHOLD_MS
) {
  safeMark(MARK_IOS_RELOAD);
  window.location.reload();
  return;
}
```

- [ ] **Replace with soft recovery**

```ts
if (
  iosStandalone &&
  hiddenAt !== null &&
  now - hiddenAt > IOS_RELOAD_THRESHOLD_MS
) {
  safeMark(MARK_IOS_RELOAD);
  supabase.auth.refreshSession().catch(() => {});
  router.refresh();
  return;
  /* return kept: prevents double-call with the refreshSession +
     router.refresh() in the block below this one. */
}
```

- [ ] **Verify TypeScript compiles**

```bash
npx tsc --noEmit
# Expected: no errors
```

- [ ] **Confirm no other `window.location.reload()` calls remain in this file**

```bash
grep -n "location.reload" components/system/ResumeHandler.tsx
# Expected: no output
```

- [ ] **Commit**

```bash
git add components/system/ResumeHandler.tsx
git commit -m "fix(pwa): replace auto reload() in ResumeHandler with soft recovery on iOS"
```

---

## Task 4: Fix hydration-watchdog — iOS overlay

**Files:**
- Modify: `components/system/hydration-watchdog.ts`

**Context:** The watchdog is an inline `<script>` injected into `<head>`. It fires after 15s if `window.__AE_HYDRATED` hasn't been set. Currently it calls `location.reload()` unconditionally. On iOS PWA, this freezes the WebView. The fix: detect iOS PWA standalone inside the script, and on iOS inject a DOM overlay with a user-triggered "Refresh" button instead. User-initiated taps go through the standard WKWebView navigation pipeline and don't freeze.

- [ ] **Replace the entire file with the updated version**

```ts
/* ------------------------------------------------------------------
   Hydration watchdog script

   Inline <script> in <head>: starts a 15-second timer at parse time.
   If `window.__AE_HYDRATED` isn't set to true by then (a flag the
   <HydrationMark /> client component sets in a root useEffect on
   successful hydration), the watchdog fires.

   Non-iOS: forces a single reload (existing behaviour).

   iOS PWA standalone: location.reload() triggered programmatically
   freezes WKWebView. Instead, inject a full-screen overlay with a
   user-triggered "Refresh" button. User-initiated navigation goes
   through the standard WKWebView pipeline and completes reliably.

   Rate-limited to ONE action per session via sessionStorage. Tries
   are incremented before injecting the overlay so that if the reload
   fails and the user is sent back here again, we don't loop on the
   overlay.

   Performance mark: `ae:watchdog-fired` lands on the User Timing
   track when this path triggers — diagnostic signal for debugging.
   ------------------------------------------------------------------ */

export const HYDRATION_BUDGET_MS = 15000;

export const HYDRATION_WATCHDOG_SCRIPT = `(function(){try{
var KEY='ae-hydrate-watchdog-tries';
var BUDGET=${HYDRATION_BUDGET_MS};
var tries=parseInt(sessionStorage.getItem(KEY)||'0',10);
if(tries>=1)return;

var isIOSPWA=/iPad|iPhone|iPod/.test(navigator.userAgent)&&
  (window.matchMedia('(display-mode: standalone)').matches||
   !!navigator.standalone);

window.__AE_WATCHDOG_TIMER=setTimeout(function(){
  if(window.__AE_HYDRATED===true)return;
  sessionStorage.setItem(KEY,String(tries+1));
  if(window.performance&&performance.mark){
    try{performance.mark('ae:watchdog-fired');}catch(_){}
  }
  if(isIOSPWA){
    var overlay=document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;background:#1A1210;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;';
    var msg=document.createElement('p');
    msg.style.cssText='color:#A69080;margin:0 0 24px;font-size:15px;font-family:Inter,sans-serif;text-align:center;padding:0 24px;';
    msg.textContent='A new version is available. Refresh to update.';
    var btn=document.createElement('button');
    btn.style.cssText='background:#C17817;color:#F5E6D3;border:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;';
    btn.textContent='Refresh';
    btn.onclick=function(){window.location.reload();};
    overlay.appendChild(msg);
    overlay.appendChild(btn);
    document.body.appendChild(overlay);
  }else{
    location.reload();
  }
},BUDGET);
}catch(_){}})();`;
```

- [ ] **Verify TypeScript compiles**

```bash
npx tsc --noEmit
# Expected: no errors
```

- [ ] **Verify the old unconditional reload is gone**

```bash
grep -n "location.reload" components/system/hydration-watchdog.ts
# Expected: one match — inside the btn.onclick handler only
```

- [ ] **Commit**

```bash
git add components/system/hydration-watchdog.ts
git commit -m "fix(pwa): show Refresh overlay instead of auto-reload on iOS PWA watchdog"
```

---

## Task 5: Build verification

**Files:** none (read-only)

- [ ] **Run production build**

```bash
npm run build
# Expected: exits 0, no type errors, no webpack errors
```

- [ ] **Verify sw.js is regenerated (Serwist post-build step)**

```bash
ls -la public/sw.js
# Expected: file exists and timestamp is recent
```

---

## Task 6: Manual verification

> These steps require a physical iOS device with the PWA installed from `www.ashember.vip`.

**Setup:** Install (or confirm already installed) the PWA by visiting `www.ashember.vip` in Safari and adding to Home Screen.

### 6a — Long background resume (ResumeHandler path B)

- [ ] Open the PWA, navigate to any page, then background it
- [ ] Wait 6+ minutes (exceeds the 5-min `IOS_RELOAD_THRESHOLD_MS`)
- [ ] Return to the PWA
- [ ] **Expected:** App refreshes content without freezing. Screen stays interactive. No force-close required.
- [ ] Open Safari Web Inspector (Mac: Develop → [device] → [page]) and check the Performance tab for `ae:ios-resume-reload` mark. Confirms the path fired.

### 6b — Extended background (ResumeHandler heartbeat path)

- [ ] Open the PWA, background it
- [ ] Leave it for 20+ minutes (iOS may evict the JS heap in this window)
- [ ] Return to the PWA
- [ ] **Expected:** App resumes and shows current content without freezing. No force-close required.

### 6c — Watchdog overlay (hydration-watchdog path)

> This path is hard to trigger naturally. Use DevTools to simulate it.

- [ ] Connect device to Mac via USB, open Safari → Develop → [device] → [page]
- [ ] In the Web Inspector console, run:
  ```js
  sessionStorage.removeItem('ae-hydrate-watchdog-tries');
  window.__AE_HYDRATED = false;
  ```
- [ ] Wait 15 seconds
- [ ] **Expected:** Dark overlay appears over the full screen with message "A new version is available. Refresh to update." and a gold "Refresh" button.
- [ ] Tap "Refresh"
- [ ] **Expected:** App reloads and hydrates normally. No freeze.

### 6d — Non-iOS regression (watchdog)

- [ ] Open the app in desktop Chrome, open DevTools console, run:
  ```js
  sessionStorage.removeItem('ae-hydrate-watchdog-tries');
  window.__AE_HYDRATED = false;
  ```
- [ ] Wait 15 seconds
- [ ] **Expected:** Page reloads (existing behavior). No overlay on desktop.

---

## Task 7: PR

- [ ] **Push branch**

```bash
git push -u origin fix/ios-pwa-freeze
```

- [ ] **Open PR**

```bash
gh pr create \
  --title "fix(pwa): replace auto-reload with soft recovery and iOS overlay" \
  --base main \
  --body "$(cat <<'EOF'
## Summary

- Replaces both automatic `window.location.reload()` calls in `ResumeHandler.tsx` with `supabase.auth.refreshSession()` + `router.refresh()`. Eliminates iOS WKWebView freeze on long background resume.
- Adds iOS PWA detection to the hydration watchdog inline script. On iOS standalone, injects a full-screen overlay with a user-triggered "Refresh" button instead of auto-reloading.

## Root cause

`window.location.reload()` called programmatically in iOS PWA standalone mode triggers a WKWebView navigation the WebView cannot route cleanly. JavaScript stops executing. Screen freezes at whatever was in the viewport. Requires force-close to recover.

User-initiated navigations (tap on button) go through the standard WKWebView pipeline and complete reliably — so the Refresh button inside the overlay is safe.

## Test plan

- [ ] Long background (6+ min): PWA resumes without freeze
- [ ] Extended background (20+ min, heap eviction): PWA resumes without freeze
- [ ] Watchdog overlay: appears after 15s on iOS when hydration hangs, Refresh button works
- [ ] Desktop regression: watchdog still reloads (not overlay) on non-iOS

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
