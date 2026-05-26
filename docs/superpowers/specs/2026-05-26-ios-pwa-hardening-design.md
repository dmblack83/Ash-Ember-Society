# iOS PWA Hardening — Design Spec

**Date:** 2026-05-26
**Status:** Approved
**Branch strategy:** One PR per phase

---

## Problem

iOS PWA users experience three compounding issues on every cold launch:

1. **Black screen** — WKWebView shows black while bootstrapping because no splash image matches the device (iPhone 16 Pro / 16 Pro Max sizes missing)
2. **White flash** — brief white frame before the dark background CSS applies; `color-scheme: dark` meta tag is not reliably honored by WKWebView before first paint
3. **Cold-smoke overlay appears last** — overlay is the third thing the user sees instead of the first branded frame

Additional active issue (current branch `fix/ios-pwa-freeze`, pending merge):
- **Freeze after background** — `location.reload()` called programmatically in WKWebView standalone mode freezes the WebKit process

Compounding risks identified from iOS PWA constraint audit:
- **7-day cache eviction** — iOS wipes all cache stores after 7 days of inactivity; post-eviction fallout is handled reactively but the TTL boundaries are not defensively set
- **No Add to Home Screen guidance** — iOS has no automatic install prompt; Safari users have no nudge to install the PWA

---

## Scope

Four phases, four PRs. No database changes. No new dependencies.

| Phase | PR | Focus |
|-------|----|-------|
| 1 | `fix/pwa-ios-startup-sequence` | Splash images, white flash, script order |
| 2 | `fix/ios-pwa-freeze` (current branch) | Freeze on resume — merge as-is |
| 3 | `fix/sw-ios-cache-ttl` | Defensive TTL reduction, storage diagnostic |
| 4 | `feat/a2hs-banner` | Add to Home Screen guidance |

---

## Phase 1 — Startup Sequence Fix

**Goal:** Replace black → white → cold-smoke with splash-image → cold-smoke → content.

### 1.1 Generate missing splash images

Two iPhone models released after the current splash image set was generated:

| Model | Points | DPR | Pixel size |
|-------|--------|-----|-----------|
| iPhone 16 Pro | 402 × 874 | 3× | 1206 × 2622 |
| iPhone 16 Pro Max | 440 × 956 | 3× | 1320 × 2868 |

Run the existing generation script:
```bash
python3 scripts/generate-ios-splash.py
```

Add two entries to `layout.tsx` `startupImage` array:
```ts
iosSplash(440, 956, 3),  // 16 Pro Max
iosSplash(402, 874, 3),  // 16 Pro
```

Insert at the top of the iPhone portrait list (largest first — iOS evaluates top-down).

### 1.2 Add `color-scheme: dark` CSS rule

The `<meta name="color-scheme" content="dark">` tag in `other` metadata is not reliably honored by WKWebView before first paint. A CSS rule on `:root` is processed at parse time alongside the rest of the inline `<style>` block and is more authoritative.

In `app/layout.tsx`, extend the existing inline `<style>` block:

```tsx
<style
  dangerouslySetInnerHTML={{
    __html: [
      "html,body{background-color:#15110b}",
      ":root{color-scheme:dark}",       // ← add this
      ".cold-smoke-overlay{display:none}",
      "html.cold-smoke-active .cold-smoke-overlay{display:block;position:fixed;inset:0;z-index:99999;background-color:#15110b}",
      "html.cold-smoke-active.cold-smoke-fading .cold-smoke-overlay{opacity:0;transition:opacity 1s linear}",
    ].join(""),
  }}
/>
```

### 1.3 Move cold-smoke-init to first script position

Current `<head>` script order:
1. `STALE_CHUNK_RECOVERY_SCRIPT`
2. `COLD_SMOKE_INIT_SCRIPT`
3. `HYDRATION_WATCHDOG_SCRIPT`

New order:
1. `COLD_SMOKE_INIT_SCRIPT` ← moves up
2. `STALE_CHUNK_RECOVERY_SCRIPT`
3. `HYDRATION_WATCHDOG_SCRIPT`

`cold-smoke-active` is added to `<html>` before the stale-chunk-recovery error listener is registered, reducing the window between first CSS parse and overlay activation.

### Files changed

| File | Change |
|------|--------|
| `scripts/generate-ios-splash.py` | Run to produce 2 new PNGs |
| `public/appstore-images/ios-splash/1206x2622.png` | New |
| `public/appstore-images/ios-splash/1320x2868.png` | New |
| `app/layout.tsx` | Add 2 splash entries; add `:root{color-scheme:dark}`; reorder scripts |

### Testing

- Install PWA fresh on iPhone 16 Pro or 16 Pro Max. Cold launch. Confirm branded splash image shows before overlay.
- Cold launch on any iPhone. Confirm no white frame between black and cold-smoke.
- Regression: cold launch on iPhone 14/13/12. Confirm splash still shows for those sizes.
- Confirm build passes (`npm run build`).

---

## Phase 2 — Freeze Fix (current branch)

Merge `fix/ios-pwa-freeze` as-is. Design spec already written at `docs/superpowers/specs/2026-05-25-ios-pwa-freeze-fix-design.md`.

Changes in that branch:
- `ResumeHandler.tsx` — 2× `location.reload()` replaced with soft recovery (token refresh + `router.refresh()`)
- `hydration-watchdog.ts` — iOS PWA gets an overlay with user-initiated "Refresh" button instead of programmatic reload

No changes needed before merge.

---

## Phase 3 — Service Worker: Defensive TTL + Storage Diagnostic

**Goal:** Eliminate edge cases around iOS's 7-day hard cache eviction.

### Background

iOS evicts entire cache stores (not individual entries) after 7 days of app inactivity. Current TTLs:
- `navigations`: 7 days (`maxAgeSeconds: 60 * 60 * 24 * 7`)
- `supabase-public-storage`: 7 days

Entries written near the 7-day boundary may fall on either side of iOS's eviction window depending on exact timing. Setting TTL to 6 days ensures all entries expire before iOS's deadline — preventing a state where some entries survive eviction and others don't, which could produce inconsistent page renders.

`/_next/static/` (CacheFirst, 365 days) and other caches are unaffected: iOS evicts the entire store regardless of per-entry TTL, and after eviction those assets re-fetch from Vercel's CDN with fresh hashes from the current HTML.

### 3.1 Reduce navigation cache TTL

In `app/sw.ts`, change the `navigations` cache expiration:

```ts
// Before
maxAgeSeconds: 60 * 60 * 24 * 7,   // 7 days

// After
maxAgeSeconds: 60 * 60 * 24 * 6,   // 6 days — expires before iOS eviction window
```

### 3.2 Reduce Supabase storage cache TTL

Same change in the `supabase-public-storage` cache:

```ts
// Before
maxAgeSeconds: 60 * 60 * 24 * 7,   // 7 days

// After
maxAgeSeconds: 60 * 60 * 24 * 6,   // 6 days
```

### 3.3 Storage quota diagnostic on install

Add a passive `navigator.storage.estimate()` call in the SW `install` event. Logs available and used quota to the console. No behavioral change — diagnostic signal only. Useful for identifying if real-world devices approach iOS's 50MB cap.

```ts
self.addEventListener("install", () => {
  void (async () => {
    try {
      const est = await navigator.storage.estimate();
      const used = Math.round((est.usage ?? 0) / 1024 / 1024 * 10) / 10;
      const quota = Math.round((est.quota ?? 0) / 1024 / 1024);
      console.log(`[sw] storage: ${used}MB used / ${quota}MB quota`);
    } catch { /* estimate() may be unavailable in some contexts; non-fatal */ }
  })();
});
```

### Navigation preload — no change

`navigationPreload: true` is correct. Serwist's `StaleWhileRevalidate` handler uses `event.preloadResponse` when available: on a cache hit it donates the preload response to the background cache update; on a cache miss it uses it as the main response. No doubled network requests. iOS 16.x had a WebKit double-navigation bug but iOS 17+ is clean and is the current support floor.

### Files changed

| File | Change |
|------|--------|
| `app/sw.ts` | 2 TTL reductions; 1 install-event storage log |

### Testing

- Build passes, `public/sw.js` regenerates.
- In DevTools → Application → Service Workers: confirm SW installs and logs storage estimate to console.
- Confirm `navigations` and `supabase-public-storage` cache expiry is 6 days in the generated `sw.js`.

---

## Phase 4 — Add to Home Screen Banner

**Goal:** Guide iOS Safari users to install the PWA. Without this, users on iOS who find the app via Safari have no prompt and no indication that a better installed experience exists.

### Component: `A2HSBanner`

New file: `components/system/A2HSBanner.tsx`

**Detection (client-side only):**
```ts
const isIOSSafari =
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !window.matchMedia("(display-mode: standalone)").matches &&
  !(navigator as Navigator & { standalone?: boolean }).standalone;
```

**Persistence:**
- `localStorage` key: `ae:a2hs-dismissed`
- Value `"permanent"` — never shows again
- Value `"<timestamp>"` — re-shows after 14 days (user tapped "Not now")
- No value — show the banner

**Design:**
- Fixed bottom, above nav bar (`bottom: calc(88px + env(safe-area-inset-bottom))`, `z-index: 40`) — matches app layout's nav clearance (`pb-[calc(88px+env(safe-area-inset-bottom))]`)
- Background: `#3D2E23` (secondary/dark leather token)
- Left: share icon SVG (inline, cream `#F5E6D3`) + text `"Add to Home Screen for the full experience"`
- Text color: `#F5E6D3` (foreground)
- Font: `Inter, sans-serif`, `13px`
- Right side: `"Not now"` text button (muted `#A69080`) + `"×"` dismiss (permanent)
- No animation — appears on mount if conditions met; disappears on dismiss

**Interaction:**
- Tapping the share icon or main text: opens a small tooltip pointing down toward the iOS share bar: `'Tap  ↑  then "Add to Home Screen"'`
- Tapping "Not now": stores timestamp, hides banner (re-shows in 14 days)
- Tapping "×": stores `"permanent"`, hides banner forever

**Mount point:** `app/(app)/layout.tsx` — authenticated app shell only. Users who haven't authenticated yet don't see it.

### EU / non-standalone handling

Apple reversed the EU PWA standalone removal in iOS 17.4 final (March 2024). Standalone mode is currently available in the EU. The A2HS banner covers both the "never installed" and "installed without standalone" cases — if a future iOS version removes standalone mode in some regions, the banner tells users how to install, which is the correct fallback regardless.

No additional EU-specific logic is needed at this time.

### Files changed

| File | Change |
|------|--------|
| `components/system/A2HSBanner.tsx` | New component |
| `app/(app)/layout.tsx` | Mount `<A2HSBanner />` |

### Testing

- Open app in iOS Safari (not installed). Confirm banner appears above nav bar.
- Tap "Not now". Confirm banner hides. Confirm localStorage has timestamp.
- Reload. Confirm banner is hidden (within 14-day window).
- Change localStorage timestamp to >14 days ago. Reload. Confirm banner re-appears.
- Tap "×". Confirm banner hides. Confirm localStorage has `"permanent"`.
- Reload. Confirm banner stays hidden.
- Open app in standalone mode (installed). Confirm banner does not appear.
- Open app on desktop / Android. Confirm banner does not appear.

---

## Rollout Order

| Order | PR | Merge dependency |
|-------|----|-----------------|
| 1 | `fix/ios-pwa-freeze` (Phase 2) | Independent — merge first (already on branch) |
| 2 | `fix/pwa-ios-startup-sequence` (Phase 1) | After freeze fix merges |
| 3 | `fix/sw-ios-cache-ttl` (Phase 3) | After freeze fix merges |
| 4 | `feat/a2hs-banner` (Phase 4) | After freeze fix merges |

Merge order items 2, 3, and 4 are independent of each other and can land in any order. The freeze fix (item 1) should land first because it's already done and the other PRs build off a clean main.

---

## Out of scope

- Push notification permission flow improvements
- Offline data states for Supabase-dependent pages (no network + no cache)
- Periodic background sync (not supported on iOS)
- Landing page A2HS prompt (no public landing page exists yet)
