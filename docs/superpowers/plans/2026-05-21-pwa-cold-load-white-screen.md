# PWA Cold Load White Screen — Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four verified gaps that let a white screen show during PWA cold launch.

**Architecture:** Three independent changes across the cold-launch overlay system, the service worker, and the throttle constant. Each fix is self-contained; they compose without coupling.

**Tech Stack:** Next.js App Router, Serwist v9 (SW), TypeScript, Tailwind CSS / custom globals.css

---

## Background — what was found

Parallel investigation traced the cold-load white screen to four confirmed gaps:

| # | Gap | File | Effect |
|---|-----|------|--------|
| 1 | Overlay CSS in external globals.css, not inlined | `app/layout.tsx`, `app/globals.css` | `cold-smoke-active` class set before CSS loads → overlay stays `display:none` |
| 2 | `NetworkFirst` has no timeout | `app/sw.ts:345` | On slow networks SW waits forever → white page until server responds |
| 3 | `/offline` not precached despite fallback referencing it | `app/sw.ts:362`, `serwist.config.mjs` | Fallback fails silently; user hits chrome error page on network failure |
| 4 | 30-min throttle suppresses overlay on iOS process-kill relaunches | `components/cold-open-smoke/cold-smoke-init.ts:13` | iOS kills PWA process in ~5 min under memory pressure; throttle prevents overlay on the next cold launch |

---

## File Structure

| File | Change |
|------|--------|
| `app/layout.tsx` | Expand inline `<style>` from 1 rule to 3 critical overlay rules |
| `app/sw.ts` | Add `networkTimeoutSeconds: 3` to `NetworkFirst`; add `/offline` to `precacheEntries`; fix stale comment |
| `components/cold-open-smoke/cold-smoke-init.ts` | Change `COLD_SMOKE_THROTTLE_MS` from 30 min to 5 min |

No new files. No dependency changes.

---

## Setup — Create feature branch

- [ ] **Create branch off main**

  ```bash
  git checkout main && git fetch origin main && git merge --ff-only origin/main
  git checkout -b fix/pwa-cold-load-white-screen
  ```

---

## Task 1 — Inline critical cold-smoke CSS in `<head>`

**Why:** The init script adds `cold-smoke-active` to `<html>` synchronously at parse time, but the rule that responds to it (`html.cold-smoke-active .cold-smoke-overlay { display: block }`) lives in the external `globals.css`. If globals.css hasn't arrived yet, the class is set but the overlay stays invisible. Inlining the 3 essential rules closes this race permanently.

**Files:**
- Modify: `app/layout.tsx` (inline `<style>` block, line ~163)

- [ ] **Step 1: Open the file and locate the inline style block**

  File: `app/layout.tsx` around line 163.

  Current:
  ```tsx
  <style
    dangerouslySetInnerHTML={{
      __html: "html,body{background-color:#15110b;}",
    }}
  />
  ```

- [ ] **Step 2: Replace the inline style content with the expanded version**

  Replace that `<style>` block with:
  ```tsx
  <style
    dangerouslySetInnerHTML={{
      __html: [
        /* Brand background — bridges the gap before globals.css loads.
           Must use a literal hex; var(--background) is undefined until
           the external sheet arrives. */
        "html,body{background-color:#15110b}",
        /* Cold-smoke overlay critical rules — inlined so the overlay
           is visible from the very first paint even if globals.css is
           still in flight. The overlay div is server-rendered; the
           init script above adds `cold-smoke-active` to <html>
           synchronously; these rules make it visible immediately.
           The full set of rules (view-transition-name, iOS splash
           background-images, animation keyframes) stays in globals.css
           — only display/position/z-index are critical-path. */
        ".cold-smoke-overlay{display:none}",
        "html.cold-smoke-active .cold-smoke-overlay{display:block;position:fixed;inset:0;z-index:99999;background-color:#15110b}",
        "html.cold-smoke-active.cold-smoke-fading .cold-smoke-overlay{opacity:0;transition:opacity 1s linear}",
      ].join(""),
    }}
  />
  ```

- [ ] **Step 3: Verify the build passes**

  ```bash
  npm run build 2>&1 | tail -20
  ```

  Expected: build exits 0, no TypeScript errors. `sw.js` gets regenerated.

- [ ] **Step 4: Verify the inline style is in the HTML output**

  ```bash
  grep -r "cold-smoke-overlay" .next/server/ 2>/dev/null | grep "display:none" | head -3
  ```

  If that returns nothing (Next caches differ), start dev and check:
  ```bash
  curl -s http://localhost:3000/home | grep -o "cold-smoke-overlay{display:none}" | head -1
  ```

  Expected: `cold-smoke-overlay{display:none}` appears inside a `<style>` tag.

- [ ] **Step 5: Commit**

  ```bash
  git add app/layout.tsx
  git commit -m "fix(pwa): inline critical cold-smoke overlay CSS in <head>

  The cold-smoke overlay CSS (display/position/z-index) was only in
  globals.css. The init script sets cold-smoke-active on <html>
  synchronously at parse time, but the rule responding to it arrived
  later with the external sheet — leaving the overlay invisible during
  the gap. Inlining the 3 critical rules closes the race.

  view-transition-name, iOS splash background-images, and animation
  keyframes stay in globals.css (non-critical-path)."
  ```

---

## Task 2 — Fix service worker: add NetworkFirst timeout + precache /offline

**Why two changes in one task:** They are tightly coupled. A network timeout without a cached fallback leaves the user on the chrome error page. A precached `/offline` without a timeout means the user still waits forever before the fallback kicks in. They only function as a fix together.

**Context — stale comment:** `app/sw.ts` line ~362 says "The /offline page itself is precached because it's prerendered at build time (see `precachePrerendered: true` in serwist.config.mjs)." This is wrong — `serwist.config.mjs` has `precachePrerendered: false`. The `/offline` fallback has never worked for true cold loads with no cache. This PR fixes both.

**Files:**
- Modify: `app/sw.ts`

- [ ] **Step 1: Add `/offline` to `precacheEntries`**

  In `app/sw.ts`, find the `new Serwist({` initialiser (around line 185). Change:

  ```ts
  const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
  ```

  to:

  ```ts
  const serwist = new Serwist({
    precacheEntries: [
      ...self.__SW_MANIFEST,
      /* /offline is NOT included in the build manifest because
         `serwist.config.mjs` sets `precachePrerendered: false` (required
         to prevent auth-gated routes from breaking SW install). Add it
         explicitly so the NetworkFirst fallback has something to serve
         when the network is unreachable on cold load. revision:null
         treats the URL as already-versioned; the offline page rarely
         changes and the SW fully re-installs on every deploy anyway. */
      { url: "/offline", revision: null },
    ],
  ```

- [ ] **Step 2: Add `networkTimeoutSeconds` to the NetworkFirst navigation handler**

  In `app/sw.ts`, find the navigation `NetworkFirst` handler (around line 345):

  ```ts
  handler: new NetworkFirst({
    cacheName: "navigations",
    plugins: [
  ```

  Add `networkTimeoutSeconds` as the first property:

  ```ts
  handler: new NetworkFirst({
    /* After 3 s without a network response, fall back to the
       navigations cache (or /offline if no cache entry). Prevents
       indefinite white-page hangs on slow networks. 3 s matches
       the proxy's Supabase auth timeout so the two failure modes
       align — both resolve within the same budget. */
    networkTimeoutSeconds: 3,
    cacheName: "navigations",
    plugins: [
  ```

- [ ] **Step 3: Fix the stale comment in the fallbacks block**

  Find the comment around line 362 that reads:

  ```ts
  /*
   * Offline fallback for navigation requests that can't be served
   * from network OR cache. The /offline page itself is precached
   * because it's prerendered at build time (see
   * `precachePrerendered: true` in serwist.config.mjs).
   */
  ```

  Replace with:

  ```ts
  /*
   * Offline fallback for navigation requests that can't be served
   * from network OR cache. /offline is added to precacheEntries
   * explicitly above (not via precachePrerendered, which is disabled
   * to prevent auth-gated routes from crashing SW install).
   */
  ```

- [ ] **Step 4: Verify the build passes**

  ```bash
  npm run build 2>&1 | tail -20
  ```

  Expected: exits 0. `public/sw.js` is regenerated.

- [ ] **Step 5: Spot-check the generated sw.js for the timeout and offline entry**

  ```bash
  grep -c 'networkTimeoutSeconds' public/sw.js && echo "timeout present"
  grep -c '/offline' public/sw.js && echo "offline present"
  ```

  Expected: both lines print a count > 0 followed by the label.

- [ ] **Step 6: Commit**

  ```bash
  git add app/sw.ts
  git commit -m "fix(sw): add NetworkFirst timeout + precache /offline fallback

  Two companion fixes:
  1. networkTimeoutSeconds: 3 on the navigation NetworkFirst handler.
     Without this, slow networks caused an indefinite white-page wait
     before the SW could serve the fallback. 3 s matches the proxy's
     Supabase auth timeout so both failure modes resolve in the same
     budget.
  2. /offline added to precacheEntries explicitly. serwist.config.mjs
     has precachePrerendered:false (required to avoid auth-gated routes
     crashing SW install), so /offline was never in the precache despite
     the fallback config referencing it. Fallback now has a page to serve.
  Also corrects the stale comment that claimed precachePrerendered:true."
  ```

---

## Task 3 — Reduce cold-smoke throttle from 30 min to 5 min

**Why:** iOS kills PWA processes under memory pressure in ~5 minutes. When the process is killed and the user taps the home-screen icon, the page fully reloads — which is a cold launch. The 30-minute throttle was intended to prevent the overlay from replaying on quick external-link round-trips, but it also suppresses the overlay on genuine cold launches that happen within 30 minutes. Reducing to 5 minutes covers the quick-link case (< 1-2 min) while letting the overlay show on process-kill relaunches.

**Files:**
- Modify: `components/cold-open-smoke/cold-smoke-init.ts`

The `COLD_SMOKE_INIT_SCRIPT` uses `${COLD_SMOKE_THROTTLE_MS}` as a template literal, so changing the constant auto-updates the script string — and `next.config.ts` recomputes the CSP hash from the same constant, so no manual hash update is needed.

- [ ] **Step 1: Change the throttle constant**

  In `components/cold-open-smoke/cold-smoke-init.ts`, find:

  ```ts
  /** Minimum gap between cold-smoke shows. iOS aggressively kills PWAs
      when external links are tapped; without this, the loader replays
      every time the user returns from a news/video link. */
  export const COLD_SMOKE_THROTTLE_MS = 30 * 60 * 1000;
  ```

  Replace with:

  ```ts
  /** Minimum gap between cold-smoke shows.
   *
   *  iOS kills the PWA process under memory pressure (~5 min background).
   *  When the process is killed and the user taps the home-screen icon,
   *  the page fully reloads — that IS a cold launch and the overlay
   *  should show.
   *
   *  The throttle prevents the overlay replaying on quick external-link
   *  round-trips (user opens a link, reads it, returns within ~1-2 min
   *  while iOS kills the process anyway). 5 min covers that case without
   *  suppressing genuine cold launches after the process has been killed. */
  export const COLD_SMOKE_THROTTLE_MS = 5 * 60 * 1000;
  ```

- [ ] **Step 2: Verify the CSP hash auto-updates**

  The hash is computed from the script string in `next.config.ts`. Since `COLD_SMOKE_THROTTLE_MS` is inlined via template literal, changing the constant changes the string, which changes the hash. Verify:

  ```bash
  npm run build 2>&1 | grep -i "csp\|hash\|error" | head -10
  ```

  Expected: clean build. No CSP hash errors.

- [ ] **Step 3: Verify the constant is reflected in the built output**

  `300000` is `5 * 60 * 1000`. After build, the inlined script string should contain this value:

  ```bash
  grep -r "last<300000" .next/static/chunks/ 2>/dev/null | head -3
  ```

  If the chunks haven't been rebuilt yet, run `npm run build` first (Step 2 above triggers this). Any match confirms the 5-min throttle is live.

- [ ] **Step 4: Commit**

  ```bash
  git add components/cold-open-smoke/cold-smoke-init.ts
  git commit -m "fix(pwa): reduce cold-smoke throttle from 30 min to 5 min

  iOS kills PWA processes in ~5 min under memory pressure. The 30-min
  throttle was suppressing the cold-smoke overlay on genuine cold
  launches that happened within 30 min of the last show. 5 min covers
  quick external-link round-trips (< 1-2 min) without suppressing
  overlay on process-kill relaunches."
  ```

---

## Task 4 — PR

- [ ] **Step 1: Verify all three commits are on the branch**

  ```bash
  git log --oneline main..HEAD
  ```

  Expected: 3 commits (Tasks 1, 2, 3).

- [ ] **Step 2: Push and open PR**

  ```bash
  git push -u origin fix/pwa-cold-load-white-screen
  gh pr create \
    --title "fix(pwa): close cold-load white-screen gaps" \
    --body "$(cat <<'EOF'
## Summary

- **Inline critical overlay CSS** — cold-smoke `display/position/z-index` rules moved into the `<head>` inline `<style>` block so the overlay shows even when globals.css is still in flight
- **NetworkFirst timeout (3 s)** — SW navigation handler no longer waits indefinitely on slow networks; falls back to cache or /offline after 3 s
- **Precache /offline** — /offline was referenced as the NetworkFirst fallback but never actually precached (stale comment from when `precachePrerendered` was true); now added explicitly so the fallback works
- **Reduce cold-smoke throttle (30 min → 5 min)** — iOS kills PWA processes in ~5 min; 30-min throttle was suppressing the overlay on genuine cold relaunches

## Investigation

Three parallel debug agents traced white-screen paths through (1) overlay activation conditions, (2) SW strategy, and (3) auth proxy + redirect. This PR addresses the top findings from all three.

## Test plan

- [ ] Cold-launch PWA on iPhone — overlay should show (dark background + smoke wisps) from first paint
- [ ] Simulate slow network (DevTools throttle: Slow 3G) — page should show offline screen after ~3 s, not hang white
- [ ] Background PWA for 6+ min, relaunch — overlay should show (not throttled)
- [ ] Quickly open external link and return (< 1 min) — overlay should NOT show (throttle active)
- [ ] Check DevTools → Application → Service Workers → Cache Storage → "navigations" — /offline should appear in precache after install
- [ ] Verify Vercel build is green

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
  ```

---

## Manual Verification Checklist

After PR is merged and deployed to production:

- [ ] Cold launch from home screen (phone was idle 10+ min) → overlay shows
- [ ] Speed Insights in Vercel → check for `ae:chunk-load-error` events (should decrease)
- [ ] DevTools Performance → User Timing → `ae:watchdog-fired` should not appear on normal loads
- [ ] DevTools → Application → Service Workers → Cache Storage: confirm `/offline` is in the precache under the `serwist-precache-*` cache
