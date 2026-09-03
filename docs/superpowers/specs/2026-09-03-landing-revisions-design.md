# Landing Revisions — Dave's post-launch review round

**Date:** 2026-09-03
**Status:** Approved (mockup review cycle, this session)
**Authoritative visual reference:** `mockups/landing-comps/hybrid/` in its 2026-09-03 state (untracked, on disk). The mockup carries every approved change and was browser-verified; where this doc and the mockup disagree, the mockup wins. All copy is final. No em dashes in user-facing strings.

Base spec: `2026-08-29-landing-redesign-design.md` (shipped as #603). This doc covers only the deltas.

## Approved changes

1. **Hero headline:** "The slow art / *of honoring* / the ritual of the leaf." (same three stepped lines; line 2 gold italic; fits one line each at 1440).
2. **Chapter One visual cards opaque:** `.sat .gcard-in { background:#16100b; }` — sensor + aging cards get the burn-card solid fill; no bleed-through.
3. **Manifesto simplified (less scrolling):** remove the pin and per-word scrub entirely. Whole passage sits at opacity .13 and fades to 1 as one block, scrubbed: trigger `[data-manifesto]`, start "top 75%", end "top 30%", scrub .8. No splitWords needed for the manifesto. Reduced motion: full opacity, no tween. (Page loses the old pin's +160% scroll length; Lenis re-measure from the #604 fix already handles height changes.)
4. **Copy edits:** CH3 deck → "One feed, every member. Trade burn reports, discuss your favorite wrappers, and welcome the new Society members." Lounge card 1 → "8 months of aging on the '64 and I finally lit it up. Worth every min of the wait!" Lounge card 3 → "...You guys were right."
5. **Footer:** the links nav (The Society / Membership / Journal / Sign In) is REMOVED. Footer = wordmark | "Smoke slowly. MMXXVI." + unchanged legal row. No PWA strip in the footer.
6. **Finale PWA note:** under the CTA row: `<div class="pwa-note" data-reveal-item>A progressive web app. Works on any device: laptop, iOS, and Android.</div>` (mono caps style per mockup).
7. **Chapter Four · Every Device (new section, between The Company and the finale):**
   - Header: kicker "Chapter Four · Every Device", H2 "One society, every screen.", deck "Ash & Ember is a progressive web app. Open it in your browser or add it to your home screen, and it runs like a native app on laptop, iPhone, and Android. No app store needed."
   - Device trio showing REAL app screenshots inside CSS device shells (iPhone: titanium edge/dynamic island/side buttons; MacBook: slim bezel/notch/aluminum base with thumb notch; Android: uniform bezel/punch hole/squarer corners). Port shells + status-bar-inset rules from mockup styles.css.
   - Captions, two rows each: device name literal-case ("iOS", "LAPTOP", "ANDROID"; `text-transform:none` on the name so iOS renders correctly) over "Shared to Home Screen" / "In the Browser" / "Shared to Home Screen".
   - Choreography (desktop ≥900px, scrubbed, no pin): trigger the device row, start "top 80%", end "top 18%", scrub 1. Laptop fades/rises in first (y 70→0 over first 30%), then both phones fade in and slide out from BEHIND the laptop (x from laptop-center offset →0, scale .9→1). Laptop z-index above phones. Mobile <900px: static stack, laptop first. Reduced motion: everything visible, no tweens.
   - Finale keeps id="join"; mockup sec-tags are chrome, not ported.
8. **Hero flash fix:** hero start states (kicker/deck/ctas/cue hidden, split words offset+blurred) are applied by a `heroPrepare()` that runs IMMEDIATELY after the motion libraries import, before the preloader plays — so the preloader slide-up reveals an already-hidden hero. The entrance timeline then uses `.to()` (not fromTo). Reduced motion: prepare is skipped (nothing hidden).

## Chapter Four assets

- Production screenshots are captured from the LIVE app with the fixture account (`scripts` capture flow; viewport 390x844 iPhone `/humidor`, 412x915 Android `/lounge`, 1512x945 laptop `/home`, deviceScaleFactor 2).
- **Privacy rule:** the Android `/lounge` capture must show fixture-only content — capture with the "My Posts" filter chip active so no real member names/posts appear. Never ship real member content in marketing imagery.
- Ship as WebP in `public/landing/` (device-{iphone,android,laptop}.webp), `loading="lazy" decoding="async"` with explicit width/height (below the fold; LCP unaffected). Target ≤150KB each.

## Not included (no verdict / unchanged)

- CH2 burn-deck dim-on-recede ghosting (flagged as optional item 06): unchanged; do not re-propose unprompted.
- Contact mailto, "9K+" copy: unchanged from #603 decisions.

## Acceptance

- Visual parity with the 2026-09-03 mockup at 1440.
- Screenshot verification MUST include a deviceScaleFactor 2 run (observation #29; full-viewport canvas asserts `canvas cssWidth === innerWidth`).
- Full wheel-scroll-through reaches the footer (no Lenis stall; includes the #604 fix, cherry-picked here).
- Gates: tsc, unit, build, check:shells, analyze/check:bundle (landing route within budget; /lounge baseline failures remain pre-existing), breakpoints 320-1920 no overflow, reduced-motion + no-JS render complete, console clean signed-out.
