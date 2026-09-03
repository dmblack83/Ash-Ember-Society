# Landing Revisions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Dave's approved post-launch landing revisions (spec `docs/superpowers/specs/2026-09-03-landing-revisions-design.md`) from the mockup into the production landing.

**Architecture:** Same as #603 — static section components under `components/landing/`, scoped `landing.css`, all choreography in dynamically-imported `motion.ts`. New Chapter Four uses real app screenshots (WebP in `public/landing/`) inside CSS device shells.

**Tech Stack:** Existing gsap/lenis stack; sharp (already a dependency) for WebP conversion.

**Authoritative sources:** `mockups/landing-comps/hybrid/{index.html,styles.css,script.js}` in their current (2026-09-03) state — every change is already staged and browser-verified there. `.ae-landing` scoping and port rules follow the #603 plan (`class`→`className`, keep `data-*` attrs, no `.sec-tag`/`.tex-switch`, prefix every new CSS selector with `.ae-landing `).

## Global Constraints

- No em dashes in user-facing strings; copy transcribed exactly from the mockup.
- Branch: `feat/landing-revisions` (already carries the cherry-picked #604 Lenis fix — do not touch that hunk).
- `app/(marketing)/page.tsx` untouched (redirect, runtime, metadata all stay).
- gsap/lenis stay exclusively inside motion.ts (dynamic import); images lazy-load with explicit dimensions.
- Device captures in `public/landing/` are committed artifacts produced by `scripts/capture-landing-devices.mjs` (already run by the controller; files exist). The lounge shot uses the My Posts filter — fixture-only content (spec privacy rule).

---

### Task 1: Static ports — copy, footer, finale note, CH1 opacity, Chapter Four section

**Files:**
- Modify: `components/landing/Hero.tsx` (headline lines)
- Modify: `components/landing/ChapterCompany.tsx` (deck + lounge cards 1 and 3)
- Modify: `components/landing/Finale.tsx` (add pwa-note)
- Modify: `components/landing/LandingFooter.tsx` (remove links nav)
- Create: `components/landing/ChapterDevices.tsx`
- Modify: `components/landing/LandingPage.tsx` (mount ChapterDevices between ChapterCompany and Finale)
- Modify: `components/landing/landing.css`

**Interfaces:**
- Produces: `data-device-row` on the trio wrapper; figures `.dev-iphone` / `.dev-laptop` / `.dev-android` inside it (Task 2's `initDeviceScene` selects exactly these). Chapter Four's `.ch-head` keeps `data-story-section`/`data-reveal-item` (generic reveals). The three figures carry NO `data-reveal-item`.

- [ ] **Step 1: Copy edits.** Hero lines from mockup `index.html` hero h1: `The slow art` / `of honoring` / `the ritual of the leaf.` (classes l1/l2/l3 unchanged). ChapterCompany: deck sentence "...discuss your favorite wrappers..."; card 1 text `"8 months of aging on the '64 and I finally lit it up. Worth every min of the wait!"`; card 3 ends `You guys were right."`. Diff each string against the mockup after editing.

- [ ] **Step 2: Finale + footer.** Finale: after the `.cta-row` div add `<div className="pwa-note" data-reveal-item>A progressive web app. Works on any device: laptop, iOS, and Android.</div>`. LandingFooter: delete the entire `<nav className="foot-links" ...>` element (wordmark + foot-note + legal row remain).

- [ ] **Step 3: `ChapterDevices.tsx`.** Port the mockup's `#ch4` section (minus `.sec-tag`) as a plain function component, matching the established section style. Structure: `<section className="chapter" id="ch4">` → `.ch-head` with `data-story-section` + three `data-reveal-item` children (kicker "Chapter Four · Every Device", h2 "One society, every screen.", deck per spec §7) → `<div className="device-row" data-device-row>` containing the three figures exactly as the mockup has them (if-shell/mb-shell/an-shell, dev-screen imgs, captions with `<b>` device names `iOS`/`LAPTOP`/`ANDROID` and `<span>` sub-lines). Image tags: `<img src="/landing/device-iphone.webp" alt="" width={780} height={1688} loading="lazy" decoding="async" />` (android 824x1830, laptop 3024x1890 — confirm against actual files with `sips -g pixelWidth -g pixelHeight public/landing/*.webp` and use the real numbers). Drop the mockup's `onerror` handlers (assets are committed; no missing-state needed) and do NOT port the `.dev-screen.missing` CSS.

- [ ] **Step 4: `landing.css` additions.** From mockup `styles.css`, port with `.ae-landing ` prefix: (a) `.sat .gcard-in { background:#16100b; }` + its comment, placed after the `.sat` rule; (b) `.finale .pwa-note` rule; (c) the whole "CH.04 every device" block (device-row, device, figcaption + b/span, dev-screen + img + inset rules, if-shell/::before/::after, if-island, an-shell + punch, mb-shell/screen/notch/base, z-index rules) EXCEPT `.dev-screen.missing` rules; (d) the two `@media (max-width:900px)` additions (device-row column stack, laptop width overrides, `.dev-laptop { order:-1; }`). Remove the now-dead `.foot-links` rules.

- [ ] **Step 5: Mount + verify.** LandingPage `<main>` order: ... ChapterCompany → ChapterDevices → Finale. Run `npx tsc --noEmit && npm run build 2>&1 | tail -3`; grep `components/landing/*.tsx` for `—` (expect none) and for `foot-links` (expect none).

- [ ] **Step 6: Commit** `feat: landing revisions — copy, footer, finale note, Chapter Four section (static)`.

---

### Task 2: motion.ts — hero prepare, manifesto fade, device scene

**Files:**
- Modify: `components/landing/motion.ts`

**Interfaces:**
- Consumes: `data-device-row`, `.dev-iphone/.dev-laptop/.dev-android` (Task 1); existing hero/manifesto hooks.

- [ ] **Step 1: heroPrepare.** Inside `initLandingMotion`, immediately AFTER the `reduceMotion` const is computed (before Lenis creation), add and invoke:

```ts
  // Hero start states are applied before the preloader plays, so its
  // slide-up never reveals a fully-rendered hero that then re-animates.
  const heroPrepare = () => {
    const headline = scope.querySelector<HTMLElement>("[data-hero-headline]");
    if (reduceMotion || !headline) return;
    headline.querySelectorAll<HTMLElement>(".line").forEach(splitWords);
    ctx.add(() => {
      gsap.set("[data-hero-kicker]", { autoAlpha: 0, y: 16 });
      gsap.set(headline.querySelectorAll(".split-word"), { yPercent: 135, filter: "blur(6px)" });
      gsap.set("[data-hero-deck]", { autoAlpha: 0, y: 22 });
      gsap.set("[data-hero-ctas]", { autoAlpha: 0, y: 22 });
      gsap.set("[data-hero-cue]", { autoAlpha: 0 });
    });
  };
  heroPrepare();
```

Note: this requires moving the `const ctx = gsap.context(() => {}, scope);` line ABOVE the Lenis block (it currently sits after the preloader helper; moving it earlier is safe — it has no dependencies). In `boot()`, the hero entrance timeline changes every `.fromTo(target, fromVars, toVars)` to `.to(target, toVars)` with identical durations/positions (the `splitWords` call in boot stays — it's a no-op via `data-split-ready`, kept for the reduced-motion-off/headline-present guard shape).

- [ ] **Step 2: Manifesto.** Replace the whole "manifesto: pinned word scrub" block in `boot()` with (splitWords no longer runs on the paragraphs):

```ts
    // -- manifesto: shaded at rest, whole text fades in on scroll (no pin) --
    if (!reduceMotion) {
      gsap.fromTo("[data-scrub-words]", { opacity: 0.13 }, {
        opacity: 1, ease: "none",
        scrollTrigger: {
          trigger: "[data-manifesto]", start: "top 75%", end: "top 30%",
          scrub: 0.8,
        },
      });
    }
```

- [ ] **Step 3: Device scene.** Add to `boot()` after the CH2 block, values verbatim from mockup `script.js` `initDeviceScene`:

```ts
    // -- CH4: laptop lands first, phones slide out from behind it --
    const deviceRow = scope.querySelector<HTMLElement>("[data-device-row]");
    if (deviceRow) {
      const laptop = deviceRow.querySelector<HTMLElement>(".dev-laptop");
      const phones = [
        deviceRow.querySelector<HTMLElement>(".dev-iphone"),
        deviceRow.querySelector<HTMLElement>(".dev-android"),
      ].filter((p): p is HTMLElement => p !== null);
      if (reduceMotion || innerWidth < 900 || !laptop) {
        gsap.set([laptop, ...phones].filter(Boolean), { autoAlpha: 1 });
      } else {
        const center = (el: HTMLElement) => {
          const r = el.getBoundingClientRect();
          return r.left + r.width / 2;
        };
        const lc = center(laptop);
        const offsets = phones.map((p) => lc - center(p));
        gsap.set(laptop, { autoAlpha: 0, y: 70 });
        phones.forEach((p, i) => gsap.set(p, { autoAlpha: 0, x: offsets[i], scale: 0.9 }));
        gsap.timeline({
          scrollTrigger: { trigger: deviceRow, start: "top 80%", end: "top 18%", scrub: 1 },
        })
          .to(laptop, { autoAlpha: 1, y: 0, ease: "none", duration: 0.3 })
          .to(phones, { autoAlpha: 1, ease: "none", duration: 0.1 }, 0.3)
          .to(phones, { x: 0, scale: 1, ease: "none", duration: 0.55 }, 0.34);
      }
    }
```

- [ ] **Step 4: Verify.** `npx tsc --noEmit && npm run build 2>&1 | tail -3` clean; confirm the `lenis?.resize()` hunk from the cherry-picked fix is untouched (`git diff HEAD -- components/landing/motion.ts | grep -c "lenis?.resize"` returns 0).

- [ ] **Step 5: Commit** `feat: landing revisions — motion (hero prepare, manifesto fade, device scene)`.

---

### Task 3: Verification sweep + PR

- [ ] **Step 1: Gates.** `npx tsc --noEmit`, `npm run test:unit`, `npm run build`, `npm run check:shells`, `npm run analyze && npm run check:bundle`. The `/lounge*` baseline failures are known pre-existing; any NEW route failure must be investigated. Record the `/` route analyze delta (images are in public/, so JS delta should be small; motion.ts grows slightly).

- [ ] **Step 2: Runtime sweep** (Playwright against `npx next start -p 3100`, prod build, signed out). All at deviceScaleFactor 2 (spec acceptance / observation #29):
  1. Full wheel-scroll-through reaches document bottom (no stall).
  2. Canvas assert: `document.getElementById("atmo").getBoundingClientRect().width === innerWidth`.
  3. Screenshots: hero (new headline, 3 lines), manifesto mid-fade, CH1 with opaque sat cards, CH4 mid-slide and at rest (real captures render, captions "iOS/LAPTOP/ANDROID"), finale with pwa-note, footer without links.
  4. Breakpoints 320/375/768/1024/1440/1920: no horizontal overflow; <900px CH4 stacks laptop-first.
  5. Reduced-motion run: everything visible incl. CH4 trio, manifesto full opacity. No-JS run: full page readable, all images present.
  6. Console: no errors beyond the known local Speed Insights 401.
- [ ] **Step 3: em-dash grep** over rendered HTML (expect only the known pre-existing inline-script comment matches).
- [ ] **Step 4: Push + PR.** Pre-push gate (`gh pr list --head feat/landing-revisions --state all`). PR body: summary per spec item, gate results, screenshots note, "includes #604's commit — merge #604 first or close it into this", test plan with Dave's device pass checkbox.

## Self-review notes

- Premises checked this session: mockup state = approved state (browser-verified after every amendment); `/landing` assets exist before Task 1 (controller captures them); branch carries #604 fix; motion.ts on this branch = #603+#604 state.
- Lifecycle: heroPrepare's sets live inside `ctx` → reverted on unmount like everything else. Device scene measures centers BEFORE applying transforms (offsets from natural layout). Manifesto block change removes the only remaining pin consumer of `[data-manifesto-scene]`; the wrapper div stays (layout only).
- Not included per spec: CH2 ghosting change, `.dev-screen.missing` fallback, footer PWA strip.
