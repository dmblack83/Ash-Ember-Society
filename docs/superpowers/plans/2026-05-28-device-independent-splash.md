# Device-Independent Launch Splash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a branded launch splash (centered logo on the dark background) on every device, iOS version, and Display-Zoom level by rendering one device-independent logo in the existing cold-smoke overlay, instead of relying on per-device `apple-touch-startup-image` / per-device `background-image` matching.

**Architecture:** Add a single centered logo element to the server-rendered `.cold-smoke-overlay` (which already paints dark on the first frame via inlined critical CSS and has a 3s + 1s-fade lifecycle). Delete the fragile per-device `background-image` `@media` block in globals.css. Un-gate reduced-motion so those users get a static (no-wisps) logo splash instead of nothing.

**Tech Stack:** Next.js 16 App Router, React 19, CSS in `app/globals.css` + inlined critical CSS in `app/layout.tsx`, Pillow (Python) for one-off image generation.

**Spec:** `docs/superpowers/specs/2026-05-28-device-independent-splash-design.md`

---

## Testing approach (read first)

This repo has **no unit-test runner** (no vitest/jest); the CI gate is `tsc --noEmit`, lint is author-responsibility, and the only E2E is Playwright (which cannot drive an iOS standalone PWA launch). **Do not add a test framework.** Per-task verification is `npx tsc --noEmit` + `npx eslint <file>` + `npm run build` where noted, and the decisive check is the **manual iOS 16 Pro test in Task 6**. The iOS splash cannot be unit-tested.

## File structure

| File | Action | Responsibility |
|---|---|---|
| `public/cold-smoke-logo.webp` | Create | Small (~256px, transparent) optimized medallion, derived from `public/Circle Logo.png`. |
| `components/cold-open-smoke/ColdOpenSmoke.tsx` | Modify | Render the centered `<img class="cold-smoke-logo">` inside the overlay. |
| `app/globals.css` | Modify | Delete the per-device `background-image` `@media` block; add `.cold-smoke-logo` rules + the `cold-smoke-static` no-wisps rule; fix the now-stale overlay comment. |
| `app/layout.tsx` | Modify | Add the `.cold-smoke-logo` positioning to the inlined critical `<head>` CSS so it is centered on the first frame. |
| `components/cold-open-smoke/cold-smoke-init.ts` | Modify | Reduced-motion no longer bails; add `cold-smoke-active` + `cold-smoke-static`. |

Build order: asset → component → CSS (full + critical) → init script → verify.

> **Branching:** all work is on `fix/device-independent-splash` (already created off fresh `origin/main`). Only stage the files named in each task; the working tree has unrelated untracked files — never `git add -A`.

---

### Task 1: Generate the optimized logo asset

**Files:**
- Create: `public/cold-smoke-logo.webp`

- [ ] **Step 1: Generate the WebP from Circle Logo.png with Pillow**

`generate-ios-splash.py` already uses Pillow, so it is available. Run from the repo root:

```bash
python3 -c "
from PIL import Image
src = Image.open('public/Circle Logo.png').convert('RGBA')
w = 256
h = round(src.height * w / src.width)
src.resize((w, h), Image.LANCZOS).save('public/cold-smoke-logo.webp', 'WEBP', quality=82, method=6)
print('wrote public/cold-smoke-logo.webp', w, 'x', h)
"
```

Expected: prints `wrote public/cold-smoke-logo.webp 256 x <height>`.

- [ ] **Step 2: Verify the asset is small and valid**

Run:
```bash
ls -l "public/cold-smoke-logo.webp" && file "public/cold-smoke-logo.webp"
```
Expected: size under ~40 KB and `file` reports a WebP image with alpha. If it exceeds 40 KB, re-run Step 1 with `quality=78`.

- [ ] **Step 3: Commit**

```bash
git add "public/cold-smoke-logo.webp"
git commit -m "feat(pwa): optimized device-independent cold-smoke logo asset"
```

---

### Task 2: Render the centered logo in the overlay

**Files:**
- Modify: `components/cold-open-smoke/ColdOpenSmoke.tsx`

- [ ] **Step 1: Add the logo `<img>` inside the overlay**

In `components/cold-open-smoke/ColdOpenSmoke.tsx`, the `ColdOpenSmoke()` return currently is:

```tsx
  return (
    <>
      <div className="cold-smoke-overlay" aria-hidden="true">
        <div className="cold-smoke-column">
          {WISPS.map((w, i) => (
```

Add the logo as the first child of `.cold-smoke-overlay`, immediately before `<div className="cold-smoke-column">`:

```tsx
  return (
    <>
      <div className="cold-smoke-overlay" aria-hidden="true">
        <img
          className="cold-smoke-logo"
          src="/cold-smoke-logo.webp"
          alt=""
          width={220}
          height={220}
        />
        <div className="cold-smoke-column">
          {WISPS.map((w, i) => (
```

Leave the rest of the file unchanged.

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint components/cold-open-smoke/ColdOpenSmoke.tsx`
Expected: no errors. (`alt=""` + `aria-hidden` on the parent is correct — the logo is decorative; the overlay is already `aria-hidden`.)

- [ ] **Step 3: Commit**

```bash
git add components/cold-open-smoke/ColdOpenSmoke.tsx
git commit -m "feat(pwa): centered logo in cold-smoke overlay"
```

---

### Task 3: globals.css — remove per-device block, add logo + static rules

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Delete the per-device `background-image` `@media` block**

Delete the entire contiguous block that starts with this comment + first media query (currently line 753):

```css
/* iOS splash image as cold-smoke background — selectors below mirror
   the apple-touch-startup-image media queries in app/layout.tsx EXACTLY,
```

…through the **last** device media query, which currently ends just before this rule (currently line 861):

```css
html.cold-smoke-active.cold-smoke-fading .cold-smoke-overlay {
```

Concretely: remove every `@media (device-width: ...) { html.cold-smoke-active .cold-smoke-overlay { background-image: url("/appstore-images/ios-splash/*.png"); } }` block (18 of them) **and** their leading comment. Stop before the `cold-smoke-fading` rule — keep that rule and everything after it (`.cold-smoke-column`, `.cold-smoke-wisp`, the `@keyframes co-smoke-*`).

- [ ] **Step 2: Fix the now-stale comment in the overlay active rule**

In the `html.cold-smoke-active .cold-smoke-overlay { ... }` rule (currently ~line 725), the trailing comment above `background-color` reads:

```css
  /* Solid background as the universal fallback (Android Chrome PWA,
     non-listed iOS device sizes, desktop installed PWA). The iOS
     splash-image overrides below replace this with the device-matched
     PNG so the splash → cold-smoke handoff is visually seamless. */
  background-color: var(--background);
```

Replace that comment (keep the `background-color` line) with:

```css
  /* Solid dark background on every device; the centered .cold-smoke-logo
     below provides the brand mark. No per-device background images —
     branding no longer depends on exact device media-query matching. */
  background-color: var(--background);
```

- [ ] **Step 3: Add the logo + static-variant rules**

Immediately after the `.cold-smoke-wisp { ... }` rule (currently ~line 882, before the `@keyframes co-smoke-l` block), add:

```css
/* Centered brand mark for the cold-smoke / launch splash. Device-
   independent: one element, sized responsively, shown on every device,
   iOS version, and Display-Zoom level. Critical positioning is mirrored
   inline in app/layout.tsx so it is centered on the first frame. z-index
   4 keeps the mark crisp above the rising wisps (column is z-index 3). */
.cold-smoke-logo {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(44vw, 220px);
  height: auto;
  z-index: 4;
}

/* Reduced-motion: the init script adds `cold-smoke-static` instead of
   bailing, so these users still get the branded splash — just without
   the animated smoke. */
html.cold-smoke-static .cold-smoke-wisp {
  display: none;
}
```

- [ ] **Step 4: Verify build compiles the CSS**

Run: `npx tsc --noEmit`
Expected: no errors (CSS isn't typechecked, but this confirms nothing else broke). A full `npm run build` happens in Task 6.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "feat(pwa): device-independent cold-smoke logo CSS; drop per-device splash backgrounds"
```

---

### Task 4: Critical inline CSS — center the logo on the first frame

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Add the logo positioning to the inlined critical `<head>` CSS**

In `app/layout.tsx`, the `<head>` has an inline `<style>` whose `__html` is a joined array of critical rules. It currently ends with the cold-smoke overlay rules:

```tsx
              ".cold-smoke-overlay{display:none}",
              "html.cold-smoke-active .cold-smoke-overlay{display:block;position:fixed;inset:0;z-index:99999;background-color:#15110b}",
              "html.cold-smoke-active.cold-smoke-fading .cold-smoke-overlay{opacity:0;transition:opacity 1s linear}",
            ].join(""),
```

Add the logo critical rule right after the `cold-smoke-active .cold-smoke-overlay` line:

```tsx
              ".cold-smoke-overlay{display:none}",
              "html.cold-smoke-active .cold-smoke-overlay{display:block;position:fixed;inset:0;z-index:99999;background-color:#15110b}",
              "html.cold-smoke-active .cold-smoke-logo{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(44vw,220px);height:auto;z-index:4}",
              "html.cold-smoke-active.cold-smoke-fading .cold-smoke-overlay{opacity:0;transition:opacity 1s linear}",
            ].join(""),
```

This guarantees the logo is centered from the first paint, before `globals.css` loads (matching how the overlay's own critical rules work). The `<img>` only fetches when the overlay is displayed; the SW `static-images` cache serves it instantly on repeat launches.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(pwa): first-frame critical CSS to center the cold-smoke logo"
```

---

### Task 5: Reduced-motion → static splash (init script)

**Files:**
- Modify: `components/cold-open-smoke/cold-smoke-init.ts`

- [ ] **Step 1: Change the reduced-motion gate**

In `components/cold-open-smoke/cold-smoke-init.ts`, the script is currently:

```ts
export const COLD_SMOKE_INIT_SCRIPT = `(function(){try{
var d=document,t=Date.now();
var pwa=navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
var mob=matchMedia('(max-width: 768px)').matches;
if(!pwa||!mob)return;
if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
var last=parseInt(localStorage.getItem('coldSmokeLastShown')||'0',10);
if(t-last<${COLD_SMOKE_THROTTLE_MS})return;
localStorage.setItem('coldSmokeLastShown',t.toString());
d.documentElement.classList.add('cold-smoke-active');
}catch(e){}})();`;
```

Replace it with (removes the early `return` on reduced-motion; instead adds `cold-smoke-static` after activating):

```ts
export const COLD_SMOKE_INIT_SCRIPT = `(function(){try{
var d=document,t=Date.now();
var pwa=navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
var mob=matchMedia('(max-width: 768px)').matches;
if(!pwa||!mob)return;
var last=parseInt(localStorage.getItem('coldSmokeLastShown')||'0',10);
if(t-last<${COLD_SMOKE_THROTTLE_MS})return;
localStorage.setItem('coldSmokeLastShown',t.toString());
var root=d.documentElement;
root.classList.add('cold-smoke-active');
if(matchMedia('(prefers-reduced-motion: reduce)').matches)root.classList.add('cold-smoke-static');
}catch(e){}})();`;
```

The PWA + mobile + 5-minute-throttle gates are unchanged; only the reduced-motion behavior changes (static logo instead of nothing). `next.config.ts` imports this string and recomputes its CSP hash at build, so no manual hash step; CSP is Report-Only so there is no enforcement risk either way.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/cold-open-smoke/cold-smoke-init.ts
git commit -m "feat(pwa): static logo splash for reduced-motion cold launches"
```

---

### Task 6: Build verification + manual device test

No code changes. Verifies the build (SW + CSP hash regenerate) and the actual behavior on the reported device.

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: build succeeds (this runs `next build && serwist build`, regenerating the SW and the CSP hash for the changed init script). If env vars block a local build, rely on the Vercel preview build on the PR instead.

- [ ] **Step 2: Browser standalone emulation**

In Chrome DevTools device mode, load the app installed/standalone (or simulate `display-mode: standalone`) at widths 320 / 390 / 402 / 430. Trigger a cold launch (clear `coldSmokeLastShown` in localStorage, reload). Expect: dark fills immediately, the medallion is centered and correctly sized (no overflow, not clipped), smoke wisps rise, fades after ~4s.

- [ ] **Step 3: Reduced-motion check**

With the OS/DevTools "prefers-reduced-motion: reduce" emulation on, repeat Step 2. Expect: centered logo on dark, **no** smoke wisps, then it clears.

- [ ] **Step 4: Manual iOS 16 Pro test (decisive, required)**

On an iPhone 16 Pro / iOS 18 with the PWA installed from www.ashember.vip (the reported device): force-quit and cold-launch. Expect: the centered medallion appears immediately on the dark background (NOT black), smoke rises, then the app. Toggle Settings → Accessibility → Reduce Motion ON and cold-launch again: expect the centered logo with no smoke. This is the check that proves the regression is fixed; it cannot be automated.

---

## Self-review notes (completed by plan author)

- **Spec coverage:** centered logo in overlay (Task 2 + 3 + 4), delete per-device `@media` block (Task 3 Step 1), reduced-motion static splash (Task 5 + the `cold-smoke-static` CSS in Task 3 Step 3), new optimized asset (Task 1), keep native `apple-touch-startup-image` tags (untouched — no task modifies `layout.tsx`'s `startupImage`), first-frame paint via critical CSS (Task 4), manual iOS verification (Task 6 Step 4). All spec sections map to a task.
- **Deviation from spec (flagged):** the spec mentioned a `<link rel="preload">` for the logo. Omitted deliberately — a global preload fetches the asset on every page (including desktop / non-PWA / marketing), which wastes bandwidth for an asset only used on mobile-PWA cold launch and works against the project's PWA performance budget. The dark background is already first-frame; the small WebP is fetched when the overlay shows and cached by the SW `static-images` rule for instant repeat launches. If first-ever-launch first-frame logo becomes a requirement, inline it as a data URI instead (the spec's stated fallback).
- **Class-name consistency:** `cold-smoke-logo` (Tasks 2, 3, 4) and `cold-smoke-static` (Tasks 3, 5) are spelled identically across all tasks and match the existing `cold-smoke-active` / `cold-smoke-fading` convention.
- **No placeholders:** every code step shows the exact before/after.
