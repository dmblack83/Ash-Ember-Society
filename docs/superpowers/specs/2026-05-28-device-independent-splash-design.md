# Device-Independent Launch Splash — Design Spec

**Date:** 2026-05-28
**Status:** Approved design, pending implementation plan
**Branch:** `fix/device-independent-splash`

## Problem

On iOS PWA cold launch, users see a black screen until the cold-smoke animation appears, instead of a branded splash. Reported on iPhone 16 Pro / iOS 18; reinstalling did not fix it (rules out stale service-worker cache).

Root cause (from systematic debugging): the branded splash is delivered two ways, **both gated on an exact per-device media-query match**:

1. **Native iOS splash** — `apple-touch-startup-image` `<link>` tags in `app/layout.tsx`, matched by `(device-width) and (device-height) and (-webkit-device-pixel-ratio) and (orientation: portrait)`.
2. **Cold-smoke overlay logo** — `app/globals.css` sets the same per-device splash PNG as the overlay's `background-image`, via `@media` rules that (per the file's own comment) "mirror the apple-touch-startup-image media queries EXACTLY."

When the device's reported window size doesn't match any entry, **neither** shows the logo:
- Native splash → iOS falls back to the dark canvas (black).
- Cold-smoke overlay → falls back to solid `#15110b` with smoke wisps but **no logo**.

Why the 16 Pro fails despite a correct-looking config:
- The `apple-touch-startup-image` mechanism is brittle and has regressed across iOS versions; iOS 18 is not honoring even a correct, matching, 200-serving entry. The match also breaks under Display Zoom (the window's logical size shifts off the standard dimensions).
- Additionally, the globals.css cold-smoke list is **missing 402×874 (16 Pro) and 440×956 (16 Pro Max)** — it starts at 430×932 — so the overlay logo can never match on those devices even if iOS behaved.

This subsystem has had ~7 prior fixes (#360, #422, #425, #448, #450, #451, #452). Patching the device lists again is fix #8 and will break on the next device or zoom setting. The fix is to stop gating the brand logo on per-device matching.

## Goal

Show a branded launch splash (logo on the dark background) on **every** device, iOS version, and Display-Zoom level, by rendering a single device-independent centered logo in the cold-smoke overlay — instead of relying on per-device splash-image matching.

## Non-goals

- **Not** removing the native `apple-touch-startup-image` tags. They stay as a free enhancement for the cases where iOS honors them; we simply no longer depend on them for branding.
- **Not** building a separate, always-on splash layer for desktop / non-PWA / Safari-tab contexts. The complaint is mobile-PWA cold launch, which the existing cold-smoke overlay already targets.
- **Not** adding new per-device assets or media queries.

## Approach (approved: Approach A)

Add a single centered logo to the existing cold-smoke overlay and delete the per-device `background-image` media queries. The overlay already paints dark on the first frame (critical inline CSS in `<head>`) and has a show/fade lifecycle; we give it a logo that renders on all devices. Reduced-motion users, who currently get no overlay at all, get a static (no-wisps) version of the same logo splash.

Rejected alternatives:
- **B — separate always-on splash layer:** duplicates the overlay and adds a second first-frame system; more than the problem needs.
- **C — add the two missing device sizes:** the fix-#8 patch; doesn't fix iOS-18-ignoring-native-splash or Display Zoom, breaks on the next device.

## Changes

| File | Change |
|---|---|
| `components/cold-open-smoke/ColdOpenSmoke.tsx` | Render one centered logo element inside `.cold-smoke-overlay`, layered with the smoke wisps. |
| `components/cold-open-smoke/cold-smoke-init.ts` | Change the reduced-motion gate: instead of returning early, add `cold-smoke-active` **and** a `cold-smoke-static` class so reduce-motion users get the logo without animated wisps. PWA + mobile + 5-min throttle gates unchanged. |
| `app/globals.css` | Delete the per-device `@media (...) { ...background-image: /appstore-images/ios-splash/*.png }` block for `.cold-smoke-overlay`. Add: centered-logo rules, and a `html.cold-smoke-static .cold-smoke-wisp { animation: none; display: none }` rule so the static variant shows no wisps. |
| `app/layout.tsx` | Extend the inlined critical `<head>` CSS so the centered logo participates in the first-frame paint; add a `<link rel="preload">` for the logo asset. Keep the native `apple-touch-startup-image` tags as-is. |
| `public/cold-smoke-logo.webp` (new) | Small (~256px, ~15–25 KB), transparent, optimized medallion derived from `public/Circle Logo.png` (the 308 KB original is too heavy to load at launch). |

### Logo asset

The centered mark is the Circle Logo medallion (transparent brass crest) — the same emblem as the home-screen app icon (`public/icons/icon-512.png`), which gives a natural "icon zooms into splash" continuity. A new optimized `cold-smoke-logo.webp` is generated from `Circle Logo.png` so the launch fetch is small. Referenced (not inlined) and preloaded; the SW `static-images` cache serves it instantly after the first launch.

## Behavior after

- **Cold mobile-PWA launch (motion allowed):** dark fills first frame → centered logo → smoke wisps rise → 3 s at full opacity → 1 s fade → removed. Lifecycle unchanged (`ColdOpenSmokeTimer`: `VISIBLE_MS=3000`, `FADE_MS=1000`).
- **Cold mobile-PWA launch (reduce-motion on):** dark + centered logo, no wisps, then removed. (Previously: no overlay at all → black.)
- **Throttle:** the 5-minute `coldSmokeLastShown` throttle still suppresses replay on quick external-link round-trips.
- **Native splash:** `apple-touch-startup-image` still emitted; when iOS honors it the user sees it first, then the overlay; when iOS ignores it (16 Pro / iOS 18 / zoom) the overlay's centered logo is the branding.
- **Every device / iOS / zoom** gets the logo, because it is one centered element, not a per-device media match.

## Risks & mitigations

- **First-frame logo paint:** the dark background is first-frame regardless (existing inline CSS). The logo is a small, preloaded, SW-cached asset, so it paints within a frame or two and instantly on repeat launches. If first-ever-launch first-frame logo is required, inline it as a data URI (rejected by default to avoid adding ~20 KB to every page's `<head>`).
- **Native→overlay handoff shift:** on the rare device where iOS still honors the native splash, the per-device PNG's logo position may differ slightly from the centered overlay logo. Mitigate by sizing/centering the overlay logo to match the splash composition. Low concern because the native splash is unreliable (the whole problem).
- **CSP:** `cold-smoke-init.ts` exports `COLD_SMOKE_INIT_SCRIPT`, whose hash `next.config.ts` computes at build from the imported string, so the hash auto-updates. CSP is Report-Only, so no manual step and no enforcement risk.
- **View transitions:** the overlay already sets `view-transition-name: ae-cold-smoke` to stay above streaming Suspense islands; the centered logo lives inside it and inherits that behavior.

## Testing

- **Manual (required), iPhone 16 Pro / iOS 18 (the reported device):** cold launch shows the centered logo immediately (not black) → smoke → app. Toggle Settings → Accessibility → Reduce Motion on: cold launch shows the static logo, no smoke.
- **Browser standalone emulation** at 320 / 390 / 402 / 430 widths: logo centered, sized correctly, no overflow.
- **Automated gates:** `tsc --noEmit` and `eslint` clean. (The iOS splash itself cannot be unit-tested; there is no unit-test runner in this repo — only Playwright E2E, which can't exercise iOS standalone launch.)

## Deployment note

No database or env changes. `public/cold-smoke-logo.webp` must be generated and committed (the implementation plan covers this). Production verification is the manual iOS 16 Pro check above on the preview deploy.
