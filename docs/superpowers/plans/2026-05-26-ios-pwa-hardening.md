# iOS PWA Hardening — Implementation Plan (Phases 1 & 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the black → white → cold-smoke startup sequence on iOS, and ship the existing freeze fix as a clean PR.

**Architecture:** Phase 2 (freeze fix) is already implemented on `fix/ios-pwa-freeze` — it only needs a PR. Phase 1 (startup sequence) is a new branch off main after Phase 2 merges; it touches the splash generation script, `app/layout.tsx` inline style block, and `app/layout.tsx` script order.

**Tech Stack:** Next.js App Router (TypeScript), Python 3 + Pillow (splash generation), Serwist service worker.

**Spec:** `docs/superpowers/specs/2026-05-26-ios-pwa-hardening-design.md`

---

## Phase 2 — Ship freeze fix PR

> This branch (`fix/ios-pwa-freeze`) is complete. This task creates and merges the PR.

### Task 1: Open PR for fix/ios-pwa-freeze

**Files:** None (git/GitHub only)

- [ ] **Step 1: Verify the branch is clean and ahead of main**

  ```bash
  git log --oneline main..fix/ios-pwa-freeze
  ```

  Expected: 3 commits (docs spec, watchdog overlay, ResumeHandler soft recovery).

- [ ] **Step 2: Push branch**

  ```bash
  git push -u origin fix/ios-pwa-freeze
  ```

- [ ] **Step 3: Open PR**

  ```bash
  gh pr create \
    --title "fix(pwa): iOS freeze fix — soft recovery + watchdog overlay (#450)" \
    --body "$(cat <<'EOF'
  ## Summary

  - **ResumeHandler** — 2× `location.reload()` calls replaced with soft recovery (`supabase.auth.refreshSession()` + `router.refresh()`). Programmatic reload in WKWebView standalone mode freezes the WebKit process; soft recovery achieves the same goal (fresh auth token, fresh data) without triggering a WebView navigation.
  - **Hydration watchdog** — iOS PWA now receives a branded overlay with a user-initiated \"Refresh\" button instead of a programmatic reload. User-initiated navigation goes through the standard WKWebView pipeline reliably.

  ## Root cause

  `window.location.reload()` called without user interaction in iOS WKWebView standalone mode triggers a navigation the WebView cannot route cleanly through the service worker. JavaScript stops executing. Screen freezes.

  ## Test plan

  - [ ] Install PWA on iPhone. Background for 6+ min. Return. Confirm app refreshes without freezing (soft recovery path).
  - [ ] Simulate stale heartbeat: clear sessionStorage, reload. Confirm no freeze.
  - [ ] Throttle to offline in DevTools on iOS Safari PWA, wait 15 s. Confirm overlay appears with \"Refresh\" button. Tap — confirm reload completes.
  - [ ] Regression: confirm existing watchdog reload behavior unchanged on desktop Chrome/Safari.

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )"
  ```

- [ ] **Step 4: Confirm PR is open**

  ```bash
  gh pr view --web
  ```

---

## Phase 1 — Startup sequence fix

> Create this branch AFTER Phase 2 merges to main.

### Setup

- [ ] **Sync main and create branch**

  ```bash
  git fetch origin main && git checkout main && git merge --ff-only origin/main
  git checkout -b fix/pwa-ios-startup-sequence
  ```

---

### Task 2: Add iPhone 16 Pro / 16 Pro Max splash images

**Files:**
- Modify: `scripts/generate-ios-splash.py` (SIZES list, ~line 54)
- Create: `public/appstore-images/ios-splash/1206x2622.png`
- Create: `public/appstore-images/ios-splash/1320x2868.png`

- [ ] **Step 1: Add missing sizes to the generator**

  Open `scripts/generate-ios-splash.py`. Find the `SIZES` list (starts around line 43). Add two entries at the top of the list:

  ```python
  SIZES = [
      # iPhone 16 Pro Max
      (1320, 2868),
      # iPhone 16 Pro
      (1206, 2622),
      # iPhone 15 Pro Max, 14 Pro Max   ← existing entries follow
      (1290, 2796),
      # ... rest unchanged
  ]
  ```

- [ ] **Step 2: Confirm Pillow is installed**

  ```bash
  python3 -c "from PIL import Image; print('ok')"
  ```

  If it prints `ok`, continue. If not:
  ```bash
  pip3 install Pillow
  ```

- [ ] **Step 3: Run the generator**

  ```bash
  python3 scripts/generate-ios-splash.py
  ```

  Expected output ends with lines like:
  ```
  Generated public/appstore-images/ios-splash/1206x2622.png
  Generated public/appstore-images/ios-splash/1320x2868.png
  ```

- [ ] **Step 4: Verify the new files exist**

  ```bash
  ls -lh public/appstore-images/ios-splash/1206x2622.png public/appstore-images/ios-splash/1320x2868.png
  ```

  Expected: both files exist, each > 0 bytes.

- [ ] **Step 5: Commit**

  ```bash
  git add scripts/generate-ios-splash.py \
          public/appstore-images/ios-splash/1206x2622.png \
          public/appstore-images/ios-splash/1320x2868.png
  git commit -m "fix(pwa): add iPhone 16 Pro/Pro Max splash images

  iOS falls back to black when no splash image matches the device
  resolution. 16 Pro (402x874@3x = 1206x2622) and 16 Pro Max
  (440x956@3x = 1320x2868) were not in the SIZES list."
  ```

---

### Task 3: Register new splash sizes in layout.tsx

**Files:**
- Modify: `app/layout.tsx` (startupImage array, lines 100–120)

- [ ] **Step 1: Add the two new entries at the top of the iPhone portrait list**

  In `app/layout.tsx`, find the `startupImage` array (around line 100). Add two entries immediately before the existing `iosSplash(430, 932, 3)` line:

  ```ts
  startupImage: [
    /* iPhones — portrait. Listed largest to smallest. */
    iosSplash(440, 956, 3),  // 16 Pro Max
    iosSplash(402, 874, 3),  // 16 Pro
    iosSplash(430, 932, 3),  // 15 Pro Max, 14 Pro Max  ← existing
    iosSplash(428, 926, 3),  // 14 Plus
    // ... rest unchanged
  ```

- [ ] **Step 2: Build to verify no TypeScript errors**

  ```bash
  npm run build 2>&1 | tail -10
  ```

  Expected: exits 0, no type errors.

- [ ] **Step 3: Verify the generated HTML contains the new media queries**

  ```bash
  curl -s http://localhost:3000 2>/dev/null | grep "1206x2622\|1320x2868" | head -4
  ```

  If dev server isn't running, check the build output:
  ```bash
  grep -r "1206x2622\|1320x2868" .next/server/ 2>/dev/null | head -4
  ```

  Expected: 2 matches — one for each new size.

- [ ] **Step 4: Commit**

  ```bash
  git add app/layout.tsx
  git commit -m "fix(pwa): register 16 Pro/Pro Max splash sizes in layout.tsx

  iOS evaluates apple-touch-startup-image media queries top-down;
  new entries added at the top of the portrait list (largest first)."
  ```

---

### Task 4: Add color-scheme CSS rule + reorder head scripts

**Files:**
- Modify: `app/layout.tsx` (inline `<style>` block, ~line 169; script order, ~lines 196–206)

- [ ] **Step 1: Add `:root{color-scheme:dark}` to the inline style array**

  In `app/layout.tsx`, find the `<style dangerouslySetInnerHTML=...>` block. The `__html` array currently has 4 strings. Insert `:root{color-scheme:dark}` as the second entry:

  ```tsx
  <style
    dangerouslySetInnerHTML={{
      __html: [
        "html,body{background-color:#15110b}",
        ":root{color-scheme:dark}",
        ".cold-smoke-overlay{display:none}",
        "html.cold-smoke-active .cold-smoke-overlay{display:block;position:fixed;inset:0;z-index:99999;background-color:#15110b}",
        "html.cold-smoke-active.cold-smoke-fading .cold-smoke-overlay{opacity:0;transition:opacity 1s linear}",
      ].join(""),
    }}
  />
  ```

- [ ] **Step 2: Move COLD_SMOKE_INIT_SCRIPT to first script position**

  In `app/layout.tsx`, find the three `<script>` tags in `<head>`. Reorder them so cold-smoke fires before the stale-chunk-recovery error listener is registered:

  ```tsx
  {/* Cold-smoke init — runs synchronously at parse time so the
      overlay is visible from the very first frame on cold PWA launch.
      Placed first so cold-smoke-active is on <html> before any other
      script runs. */}
  <script dangerouslySetInnerHTML={{ __html: COLD_SMOKE_INIT_SCRIPT }} />
  {/* Stale-chunk recovery — captures `error` events from the
      very first <script>/<link> tags Next emits, so a stale
      SW cache pointing at deleted /_next/static/ chunks after
      a deploy auto-recovers (cache nuke + SW unregister +
      reload) instead of hanging forever. Rate-limited to two
      cache-bust attempts per session. See file for details. */}
  <script dangerouslySetInnerHTML={{ __html: STALE_CHUNK_RECOVERY_SCRIPT }} />
  {/* Hydration watchdog — starts a 15s timer at parse time;
      forces ONE reload if `window.__AE_HYDRATED` isn't set
      by then. Catches silent hydration crashes / hangs that
      don't surface as a chunk-load 404. <HydrationMark/> in
      <body> sets the flag in a useEffect. */}
  <script dangerouslySetInnerHTML={{ __html: HYDRATION_WATCHDOG_SCRIPT }} />
  ```

- [ ] **Step 3: Build**

  ```bash
  npm run build 2>&1 | tail -10
  ```

  Expected: exits 0.

- [ ] **Step 4: Verify color-scheme rule appears in built HTML**

  ```bash
  grep -r "color-scheme:dark" .next/server/ 2>/dev/null | head -3
  ```

  Expected: at least one match inside a `<style>` tag.

- [ ] **Step 5: Commit**

  ```bash
  git add app/layout.tsx
  git commit -m "fix(pwa): add color-scheme:dark CSS rule and move cold-smoke-init first

  Two startup sequence fixes:
  1. :root{color-scheme:dark} as a CSS rule in the inline <style> block.
     The <meta name=color-scheme> tag is not reliably honored by WKWebView
     before first paint; a CSS rule is more authoritative and eliminates
     the white flash between splash image and cold-smoke overlay.
  2. COLD_SMOKE_INIT_SCRIPT moved before STALE_CHUNK_RECOVERY_SCRIPT so
     cold-smoke-active is on <html> from the earliest possible parse tick."
  ```

---

### Task 5: Open PR for startup sequence fix

**Files:** None (git/GitHub only)

- [ ] **Step 1: Verify three commits on branch**

  ```bash
  git log --oneline main..HEAD
  ```

  Expected: 3 commits (Tasks 2, 3, 4).

- [ ] **Step 2: Push and open PR**

  ```bash
  git push -u origin fix/pwa-ios-startup-sequence
  gh pr create \
    --title "fix(pwa): iOS startup sequence — splash images + color-scheme + script order" \
    --body "$(cat <<'EOF'
  ## Summary

  - **iPhone 16 Pro / 16 Pro Max splash images** — both models were missing from the generator SIZES list and the layout.tsx startupImage array. iOS falls back to black when no splash image matches the device. Two new PNGs generated and registered.
  - **`color-scheme: dark` CSS rule** — the meta tag equivalent is not reliably honored by WKWebView before first paint. Adding it as a CSS rule in the inline `<style>` block eliminates the white flash between splash image and cold-smoke overlay.
  - **Script order** — `COLD_SMOKE_INIT_SCRIPT` moved before `STALE_CHUNK_RECOVERY_SCRIPT` so `cold-smoke-active` is on `<html>` from the earliest possible parse tick.

  ## Before / After

  Before: black (no splash match) → white (color-scheme not honored) → cold-smoke overlay
  After: splash image → cold-smoke overlay → content

  ## Test plan

  - [ ] Install PWA fresh on iPhone 16 Pro or 16 Pro Max. Cold launch. Confirm branded splash shows before overlay (no black first).
  - [ ] Cold launch on iPhone 14/13/12. Confirm splash still shows (existing sizes regression check).
  - [ ] On any iPhone: confirm no white frame between splash and cold-smoke overlay.
  - [ ] DevTools → Elements → `<head>`: confirm script order is cold-smoke-init, stale-chunk-recovery, hydration-watchdog.
  - [ ] DevTools → Elements → `<style>`: confirm `:root{color-scheme:dark}` is present.
  - [ ] Vercel build green.

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )"
  ```

- [ ] **Step 3: Confirm PR URL**

  ```bash
  gh pr view --json url -q .url
  ```

---

## Manual Verification Checklist

After both PRs merge and deploy to production:

- [ ] Cold launch from home screen on iPhone 16 Pro or 16 Pro Max — splash image shows instead of black
- [ ] Cold launch on older iPhone (14/13) — splash image still shows
- [ ] No white frame visible between splash and cold-smoke overlay on any device
- [ ] Background app for 6+ min, return — app recovers without freezing
- [ ] Vercel Speed Insights: `ae:watchdog-fired` should not appear on normal loads
- [ ] DevTools Application → Cache Storage: confirm SW still installs and activates cleanly

---

## Phases 3 & 4

Plan separately in the next session:
- **Phase 3** (`fix/sw-ios-cache-ttl`): TTL reductions in `app/sw.ts` + storage diagnostic
- **Phase 4** (`feat/a2hs-banner`): `components/system/A2HSBanner.tsx` + mount in `app/(app)/layout.tsx`
