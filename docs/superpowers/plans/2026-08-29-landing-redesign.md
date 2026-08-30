# Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the framer-motion landing page with the approved "Society Journal" cinematic scroll page (GSAP + ScrollTrigger + Lenis), matching the mockup at `mockups/landing-comps/hybrid/`.

**Architecture:** `app/(marketing)/page.tsx` stays a server component that keeps today's signed-in redirect and renders a new client `LandingPage` orchestrator. Static JSX sections port 1:1 from the mockup HTML; all GSAP/Lenis choreography lives in one dynamically-imported `motion.ts` module so login/signup/app routes pay nothing. Atmosphere canvas and burn rail are self-contained components with their own rAF loops (they work even if GSAP fails to load).

**Tech Stack:** Next.js App Router, gsap + gsap/ScrollTrigger + lenis (npm, dynamic import), plain scoped CSS (`landing.css`), vitest for pure helpers.

**Spec:** `docs/superpowers/specs/2026-08-29-landing-redesign-design.md`. **The mockup wins on visuals/motion:** `mockups/landing-comps/hybrid/index.html` (markup + final copy), `styles.css` (all styling), `script.js` (all choreography values). Read all three before starting any task.

## Global Constraints

- **No em dashes in any user-facing string.** Copy in the mockup/spec is final; do not rewrite it.
- One CTA phrase everywhere: "Join the Society".
- Tokens: lounge palette values only (already in the mockup `:root`). No new font families; the landing loads extra Cormorant Garamond weights/styles route-scoped (Task 2).
- Budgets: landing JS < 150KB gz, CSS < 30KB. GSAP/Lenis must be dynamically imported, never in the initial route chunk, never CDN.
- Routing hard requirement: `app/(marketing)/page.tsx` KEEPS `getServerUser()` + redirect to `/home`/`/onboarding` for signed-in users, and keeps `export const runtime = "edge"`. (Spec §8's "statically prerendered" line is stale; §1's redirect requirement wins. `check:shells` does not gate `/`.)
- Resilience: full readable page with JS disabled; preloader session-gated and never blocks; if motion libs fail to import, remove preloader and leave the static page.
- Branch: work directly on `feat/landing-redesign` (already 0 behind origin/main). Commit per task.
- **Port rules (apply in every JSX task):** `class` → `className`, self-close voids, `<b>`/`<i>`/`<em>` stay as-is, HTML entities stay (`&amp;`, `&ldquo;` etc. can be written as literal characters in JSX strings: `&`, `"`, `"`), keep every `data-*` attribute exactly (motion.ts targets them), DELETE all `.sec-tag` elements and the `.tex-switch` panel (mockup chrome), replace `#` link targets per the link map in Task 3.

---

### Task 1: Pure scroll-math helpers (TDD)

**Files:**
- Create: `lib/landing/scroll-math.ts`
- Test: `lib/landing/scroll-math.test.ts`

**Interfaces:**
- Produces: `pageProgress(scrollY: number, maxScroll: number): number`, `bloomLevel(p: number): number`, `railDisplayPercent(p: number): number`, `shouldWriteProgress(p: number, lastP: number): boolean`. Consumed by `Atmosphere.tsx` and `BurnRail.tsx` (Task 5).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/landing/scroll-math.test.ts
import { describe, it, expect } from "vitest";
import {
  pageProgress,
  bloomLevel,
  railDisplayPercent,
  shouldWriteProgress,
} from "./scroll-math";

describe("pageProgress", () => {
  it("returns 0 at top", () => {
    expect(pageProgress(0, 5000)).toBe(0);
  });
  it("returns 1 at bottom", () => {
    expect(pageProgress(5000, 5000)).toBe(1);
  });
  it("clamps above 1", () => {
    expect(pageProgress(6000, 5000)).toBe(1);
  });
  it("never divides by zero (maxScroll floor of 1)", () => {
    expect(pageProgress(100, 0)).toBe(1);
  });
  it("treats negative scrollY as 0", () => {
    expect(pageProgress(-50, 5000)).toBe(0);
  });
});

describe("bloomLevel", () => {
  // spec §4: full at hero (p<.12), .15 mid-page, returns after p>.82
  it("is 1 at p=0", () => {
    expect(bloomLevel(0)).toBe(1);
  });
  it("fades linearly across the hero band (p=.06 -> .7)", () => {
    expect(bloomLevel(0.06)).toBeCloseTo(0.7);
  });
  it("is .15 mid-page", () => {
    expect(bloomLevel(0.5)).toBe(0.15);
  });
  it("returns toward 1 near the finale (p=.91 -> .5)", () => {
    expect(bloomLevel(0.91)).toBeCloseTo(0.5);
  });
  it("is 1 at p=1", () => {
    expect(bloomLevel(1)).toBeCloseTo(1);
  });
});

describe("railDisplayPercent", () => {
  // spec §6: display progress clamped to p*0.76 so the ember ends AT the band
  it("is 0 at top", () => {
    expect(railDisplayPercent(0)).toBe(0);
  });
  it("scales by 0.76 (p=.5 -> 38)", () => {
    expect(railDisplayPercent(0.5)).toBeCloseTo(38);
  });
  it("ends at 76 at page bottom", () => {
    expect(railDisplayPercent(1)).toBeCloseTo(76);
  });
});

describe("shouldWriteProgress", () => {
  // spec §6 JS contract: skip when |delta p| < .0005
  it("skips sub-threshold deltas", () => {
    expect(shouldWriteProgress(0.50004, 0.5)).toBe(false);
  });
  it("writes at/above threshold", () => {
    expect(shouldWriteProgress(0.5006, 0.5)).toBe(true);
  });
  it("writes on first frame (lastP = -1)", () => {
    expect(shouldWriteProgress(0, -1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/landing/scroll-math.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// lib/landing/scroll-math.ts
/* Pure scroll math for the landing atmosphere + burn rail.
   Values come from the approved mockup (mockups/landing-comps/hybrid/script.js). */

const HERO_FADE_END = 0.12;
const FINALE_RETURN_START = 0.82;
const MID_PAGE_BLOOM = 0.15;
const RAIL_SCALE = 0.76; // ember finishes at the band, never past it
const WRITE_THRESHOLD = 0.0005;

export function pageProgress(scrollY: number, maxScroll: number): number {
  const max = Math.max(1, maxScroll);
  return Math.min(1, Math.max(0, scrollY) / max);
}

export function bloomLevel(p: number): number {
  if (p < HERO_FADE_END) return 1 - p * 5;
  if (p > FINALE_RETURN_START) {
    return (p - FINALE_RETURN_START) / (1 - FINALE_RETURN_START);
  }
  return MID_PAGE_BLOOM;
}

export function railDisplayPercent(p: number): number {
  return p * RAIL_SCALE * 100;
}

export function shouldWriteProgress(p: number, lastP: number): boolean {
  return Math.abs(p - lastP) >= WRITE_THRESHOLD;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/landing/scroll-math.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add lib/landing/scroll-math.ts lib/landing/scroll-math.test.ts
git commit -m "feat: landing scroll-math helpers (bloom, rail progress, write gate)"
```

---

### Task 2: Dependencies + marketing layout (fonts, hints)

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `app/(marketing)/layout.tsx`

**Interfaces:**
- Produces: CSS variable `--font-cormorant-landing` available to everything under the marketing route. `landing.css` (Task 3) consumes it.

- [ ] **Step 1: Install motion libraries**

Run: `npm install gsap lenis`
Expected: both land in `dependencies` (gsap 3.x, lenis 1.x). Run `npm run typecheck` if it exists, else `npx tsc --noEmit` — no new errors.

- [ ] **Step 2: Rewrite the marketing layout**

The old unsplash/istock preconnects served the deleted framer-motion page's remote images; the new landing has zero remote assets. The landing needs Cormorant 500/600 in normal + italic (app-wide instance only has 600/700 normal — do NOT touch `app/layout.tsx`; this instance is route-scoped so app routes pay nothing).

```tsx
// app/(marketing)/layout.tsx  (full replacement)
import { Cormorant_Garamond } from "next/font/google";

/* Route-scoped Cormorant instance: the landing design uses weight 500/600
   with true italics (gold italic accents in the hero, manifesto, finale).
   The app-wide instance in app/layout.tsx only carries 600/700 normal;
   loading the extra faces here keeps them off every app route. */
const cormorantLanding = Cormorant_Garamond({
  variable: "--font-cormorant-landing",
  weight: ["500", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className={cormorantLanding.variable}>{children}</div>;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: build succeeds. (The page still renders the old LandingPage at this point; that is fine.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json "app/(marketing)/layout.tsx"
git commit -m "feat: landing deps (gsap, lenis) + route-scoped Cormorant italics"
```

---

### Task 3: Static shell — landing.css, orchestrator, Masthead, Hero, Finale, Footer

**Files:**
- Create: `components/landing/landing.css`
- Create: `components/landing/Masthead.tsx`
- Create: `components/landing/Hero.tsx`
- Create: `components/landing/Finale.tsx`
- Create: `components/landing/LandingFooter.tsx`
- Modify (full replacement): `components/landing/LandingPage.tsx`
- Modify: `app/(marketing)/page.tsx` (metadata only)

**Interfaces:**
- Produces: `LandingPage` default-exported client component; `.ae-landing` scoped stylesheet; section components rendering mockup markup with all `data-*` hooks intact. Tasks 4–6 add more sections and the motion boot into `LandingPage.tsx`.

- [ ] **Step 1: Port `landing.css` from the mockup**

Source: `mockups/landing-comps/hybrid/styles.css` (362 lines). Port the WHOLE file with these exact deltas:

1. **Scope every rule** by prefixing each top-level selector with `.ae-landing ` (e.g. `.hero {` → `.ae-landing .hero {`). Exceptions: the `:root` block (delta 2), `@keyframes` (delta 3), and `body`/`html` rules (delta 4).
2. `:root { ... }` token block (lines 1–9) → move onto `.ae-landing { ... }` and change the font vars to bind the route-scoped instance with app fallbacks:
   ```css
   --serif: var(--font-cormorant-landing), var(--font-serif, Georgia), serif;
   --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
   --mono: ui-monospace, "SF Mono", Menlo, monospace;
   ```
   Also add to `.ae-landing` itself: `position: relative; background: var(--bg); color: var(--cream); font-family: var(--sans); overflow-x: clip; min-height: 100svh;`
3. Rename keyframes to avoid app collisions: `@keyframes marq` → `@keyframes ae-marq` (update the `.band-in[data-loop]` reference), `@keyframes wisp` → `@keyframes ae-wisp` (update `.cigar-smoke b`).
4. Drop the `html { scrollbar... }` and `body { ... }` rules (lines 11–12) — covered by delta 2's additions. Drop `* { box-sizing... }` (the app's global reset already applies border-box; if visual inspection in Step 6 shows margin bleed on `h1/h2/p`, add `.ae-landing :is(h1,h2,h3,p) { margin: 0; }`).
5. **Texture:** delete the switcher machinery — lines 14–48 (`--tex-op`, `body::after` variants for linen/grain/none, `.tex-switch` chrome). Replace with a single fixed element rule (rendered as a div in `LandingPage.tsx`), checker recipe at approved max intensity:
   ```css
   .ae-landing .tex-layer { content: none; position: fixed; inset: 0; z-index: 2;
     pointer-events: none; mix-blend-mode: overlay; opacity: .336;
     background-image:
       repeating-conic-gradient(rgba(245,230,211,.6) 0% 25%, transparent 0% 50%),
       url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='90'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='90' height='90' filter='url(%23n)'/%3E%3C/svg%3E");
     background-size: 8px 8px, 60px 60px; }
   ```
6. Delete `.sec-tag` rules (lines 65–66) and the `.hero .sec-tag` line (156).
7. Add designed focus states (house design-quality rule) after the masthead block:
   ```css
   .ae-landing a:focus-visible, .ae-landing .btn-primary:focus-visible {
     outline: 1px solid var(--gold); outline-offset: 3px; border-radius: 2px; }
   ```
8. Add the preloader resilience gates at the end (spec §7; `<noscript>` variant is rendered by the component in Step 3):
   ```css
   @media (prefers-reduced-motion: reduce) { .ae-landing .preloader { display: none; } }
   ```
   (Keep the mockup's existing reduced-motion block lines 359–362 too, scoped.)

- [ ] **Step 2: Port `Masthead.tsx`, `Hero.tsx`, `Finale.tsx`, `LandingFooter.tsx`**

Sources: `index.html` lines 23–32 (masthead), 56–72 (hero), 237–245 (finale), 248–258 (footer). Apply the Global port rules plus this link map:

| Mockup href | Production href |
|---|---|
| masthead wordmark `#` | `#top` |
| Sign In `#` (masthead + footer) | `/login` |
| Join the Society `#join` (masthead) | `/signup` |
| hero + finale `Join the Society` | `/signup` |
| footer The Society `#` | `#top` |
| footer Membership `#` | `/signup` |
| footer Journal `#` | `/discover/cigar-news` |
| footer Privacy Policy `#` | `/privacy` |
| footer Terms of Service `#` | `/terms` |
| footer Contact `#` | `mailto:dmblack83@gmail.com` (flagged for Dave pre-merge) |
| Instagram | `https://www.instagram.com/ash_and_ember_society` with `target="_blank" rel="noopener"` |

Use plain `<a>` tags (marketing surface; no app-shell prefetch wanted). Each file is a plain server-compatible function component with no state, e.g.:

```tsx
// components/landing/Masthead.tsx
export function Masthead() {
  return (
    <header className="masthead" data-masthead>
      <div className="in">
        <a className="wordmark" href="#top">Ash <em>&</em> Ember</a>
        <div className="mast-mid">A Society Journal of Smoke &amp; Patience · Vol. I</div>
        <nav className="mast-actions" aria-label="Account">
          <a className="mast-signin" href="/login">Sign In</a>
          <a className="mast-cta" href="/signup">Join the Society</a>
        </nav>
      </div>
    </header>
  );
}
```

`Hero.tsx`: port lines 56–72 minus the `.sec-tag` div; keep `id="top"` ON the hero section (anchor target), keep all `data-hero-*` attributes and the three `.line` spans exactly. `Finale.tsx`: port 237–245, `id="join"` stays (in-page anchor no longer used by CTAs but harmless; keep for the footer Membership alternative — actually Membership maps to `/signup`, keep id anyway). `LandingFooter.tsx`: port 248–258 with the link map; keep `data-footer-parallax`.

- [ ] **Step 3: Replace `LandingPage.tsx` with the new orchestrator (static-only for now)**

Full replacement of the 1,029-line framer-motion file:

```tsx
// components/landing/LandingPage.tsx
"use client";

import { Masthead } from "./Masthead";
import { Hero } from "./Hero";
import { Finale } from "./Finale";
import { LandingFooter } from "./LandingFooter";
import "./landing.css";

/* Orchestrator for the marketing landing page. Static sections render
   complete and readable with no JS; Task 6 adds the dynamically-imported
   GSAP/Lenis choreography on top as pure enhancement. */
export default function LandingPage() {
  return (
    <div className="ae-landing">
      {/* z0 atmosphere canvas + z1 vignette arrive in Task 5 */}
      <div className="vignette" aria-hidden="true" />
      <div className="tex-layer" aria-hidden="true" />
      <Masthead />
      <main>
        <Hero />
        <Finale />
      </main>
      <LandingFooter />
    </div>
  );
}
```

- [ ] **Step 4: Update page metadata (new approved copy)**

In `app/(marketing)/page.tsx` change ONLY the metadata object (redirect logic and `runtime` are untouchable):

- `title`: `"Ash & Ember Society · A Society Journal of Smoke & Patience"`
- `description` (top-level AND twitter): `"An exclusive digital sanctuary for the modern aficionado. Track your collection, refine your palate, and connect with a society of discerning enthusiasts."`
- `openGraph.title`: `"Ash & Ember Society"` (keep), `openGraph.description`: same new deck copy. Keep all URLs/images exactly as they are (www canonical comment must survive).

- [ ] **Step 5: Build + typecheck**

Run: `npx tsc --noEmit && npm run build 2>&1 | tail -20`
Expected: clean. Old framer sections are gone; confirm `grep -rn "framer-motion" components/landing/` returns nothing.

- [ ] **Step 6: Visual smoke check**

Run: `npm run dev` (background), open `http://localhost:3000/` signed OUT (or `next start` after build). Verify: dark #0e0a06 page, hero headline in Cormorant with gold italic line 2, texture visible, masthead fixed, finale + footer render, no horizontal scrollbar. Stop dev server.

- [ ] **Step 7: Commit**

```bash
git add components/landing/ "app/(marketing)/page.tsx"
git commit -m "feat: landing static shell (masthead, hero, finale, footer) + scoped stylesheet"
```

---

### Task 4: Static sections — brand band, manifesto, three chapters

**Files:**
- Create: `components/landing/BrandBand.tsx`
- Create: `components/landing/Manifesto.tsx`
- Create: `components/landing/ChapterCollection.tsx`
- Create: `components/landing/ChapterRecord.tsx`
- Create: `components/landing/ChapterCompany.tsx`
- Modify: `components/landing/LandingPage.tsx`

**Interfaces:**
- Consumes: `.ae-landing` styles from Task 3.
- Produces: sections with `data-manifesto-scene`, `data-brand-band`, `data-scrub-words`, `data-humidor-scene`, `data-scene-step`, `data-scene-phone`, `data-scene-sat`, `data-burn-scene`, `data-burn-stage`, `data-story-section`, `data-reveal-item` — motion.ts (Task 6) selects on exactly these.

- [ ] **Step 1: Port the five section components**

Apply Global port rules. Sources in `mockups/landing-comps/hybrid/index.html`:

- `BrandBand.tsx`: lines 76–81 (`.band-wrap`). Keep the full 50-brand list verbatim including `<b>◆</b>` separators (spec §3 list is authoritative; the mockup matches it). Label text: "Community grown catalog with 9K+ cigars".
- `Manifesto.tsx`: lines 84–89. Both `data-scrub-words` paragraphs, curly quotes and `<em>"get it".</em>` exactly, signature "Dave · Founder".
- Compose them in `LandingPage.tsx` inside the scene wrapper so the pin has one trigger element:
  ```tsx
  <div data-manifesto-scene>
    <BrandBand />
    <Manifesto />
  </div>
  ```
- `ChapterCollection.tsx`: lines 93–150 minus `.sec-tag`. All three steps, phone card rows (4 cigars with exact names/meta/badges), sensor card (static `PAIRED` text — never a pulsing dot), aging card (`width:96%` inline style → `style={{ width: "96%" }}`).
- `ChapterRecord.tsx`: lines 153–206 minus `.sec-tag`. Three burn cards; inline `style="padding:26px"` → `style={{ padding: 26 }}`; keep №/scores/notes/em italics exactly; footer thirds bars + "FIRST · SECOND · FINAL THIRD".
- `ChapterCompany.tsx`: lines 209–234 minus `.sec-tag`. Three lounge quotes, generic `MEMBER` attribution, avatar gradient spans.

- [ ] **Step 2: Mount in order in `LandingPage.tsx`**

`<main>` order: `Hero` → manifesto scene wrapper (BrandBand + Manifesto) → `ChapterCollection` → `ChapterRecord` → `ChapterCompany` → `Finale`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build 2>&1 | tail -5`
Expected: clean. Then dev-server spot check: full page scrolls top to bottom with every section readable (no motion yet, all content visible at rest), burn cards stacked as a plain list is NOT expected on desktop yet (they're absolutely positioned and will overlap — that is the pre-motion state and is resolved by Task 6's `y: innerHeight` offsets; note it, don't "fix" it). Confirm no em dash characters: `grep -rn "—" components/landing/*.tsx` returns nothing.

- [ ] **Step 4: Commit**

```bash
git add components/landing/
git commit -m "feat: landing chapters, brand band, manifesto (static)"
```

---

### Task 5: Atmosphere canvas, burn rail, preloader

**Files:**
- Create: `components/landing/Atmosphere.tsx`
- Create: `components/landing/BurnRail.tsx`
- Create: `components/landing/Preloader.tsx`
- Modify: `components/landing/LandingPage.tsx`

**Interfaces:**
- Consumes: `lib/landing/scroll-math` (Task 1).
- Produces: self-driving visual layers. `Preloader` exposes `data-preloader` + `data-preloader-bar` for motion.ts (Task 6), which animates and removes it; Preloader itself only handles the "already seen / no JS / reduced motion" gates.

- [ ] **Step 1: Write `Atmosphere.tsx`**

Port of `script.js` `initAtmosphere` (lines 57–163) minus the rail writes (BurnRail owns those) and minus gsap dependency (plain rAF; runs even if GSAP fails):

```tsx
// components/landing/Atmosphere.tsx
"use client";

import { useEffect, useRef } from "react";
import { pageProgress, bloomLevel } from "@/lib/landing/scroll-math";

/* Fixed full-viewport canvas: static warm underglow, six static light
   shafts, ember bloom scaled by scroll progress, and slow smoke wisps —
   the only animated element (spec §4: no drift, no oscillation).
   Reduced motion: paint one static warm frame and stop. */

interface Wisp {
  x: number; y: number; r: number; vy: number;
  sway: number; swayAmp: number; life: number; maxLife: number;
}

const MAX_WISPS = 26;
const SPAWN_P = 0.06;
const WISP_ALPHA = 0.035;

export function Atmosphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;

    let W = 0;
    let H = 0;
    let t = 0;
    let raf = 0;
    const resize = () => {
      W = cv.width = window.innerWidth * devicePixelRatio;
      H = cv.height = window.innerHeight * devicePixelRatio;
    };
    window.addEventListener("resize", resize);
    resize();

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const folds = Array.from({ length: 6 }, (_, i) => ({
      x: 0.12 + 0.15 * i,
      hue: i % 2 ? "212,160,74" : "232,100,44",
    }));
    let bloom = 1;
    const wisps: Wisp[] = [];

    const spawnWisp = () => {
      const s = W / 1600;
      wisps.push({
        x: W * (0.42 + 0.16 * Math.random()),
        y: H * (1 + 0.04 * Math.random()),
        r: (26 + 40 * Math.random()) * s,
        vy: (0.35 + 0.55 * Math.random()) * s * devicePixelRatio,
        sway: Math.random() * Math.PI * 2,
        swayAmp: (14 + 22 * Math.random()) * s,
        life: 0,
        maxLife: 420 + 360 * Math.random(),
      });
    };

    const drawWarmth = () => {
      ctx.globalCompositeOperation = "screen";
      const warm = ctx.createRadialGradient(W * 0.5, H * 0.85, 0, W * 0.5, H * 0.85, Math.max(W, H) * 0.95);
      warm.addColorStop(0, "rgba(122,80,42,.11)");
      warm.addColorStop(0.5, "rgba(84,55,30,.055)");
      warm.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = warm;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
    };

    const drawShaftsAndBloom = () => {
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < folds.length; i++) {
        const f = folds[i];
        const glow = 0.05 * (0.45 + 0.55 * bloom);
        const sx = 0.35 + 0.22 * Math.abs(Math.sin(i * 2.3));
        ctx.save();
        ctx.translate(f.x * W, H * 1.05);
        ctx.scale(sx, 1);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, H * 0.8);
        g.addColorStop(0, `rgba(${f.hue},${glow})`);
        g.addColorStop(0.5, `rgba(${f.hue},${glow * 0.35})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(-W / sx, -H * 1.3, (2 * W) / sx, H * 1.4);
        ctx.restore();
      }
      const bl = ctx.createRadialGradient(W * 0.5, H * 1.05, 0, W * 0.5, H * 1.05, H * 0.8);
      bl.addColorStop(0, `rgba(232,100,44,${0.26 * bloom + 0.03})`);
      bl.addColorStop(0.4, `rgba(193,120,23,${0.1 * bloom})`);
      bl.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bl;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
    };

    const drawSmoke = () => {
      if (bloom > 0.3 && wisps.length < MAX_WISPS && Math.random() < SPAWN_P) spawnWisp();
      ctx.globalCompositeOperation = "screen";
      for (let i = wisps.length - 1; i >= 0; i--) {
        const w = wisps[i];
        w.life++;
        w.y -= w.vy;
        w.r *= 1.0035;
        if (w.life >= w.maxLife || w.y < H * 0.1) {
          wisps.splice(i, 1);
          continue;
        }
        const px = w.x + Math.sin(t * 0.0011 + w.sway) * w.swayAmp * (w.life / w.maxLife + 0.3);
        const fade = Math.sin(Math.PI * Math.min(w.life / w.maxLife, 1));
        const a = WISP_ALPHA * fade * Math.max(bloom, 0.12);
        const g = ctx.createRadialGradient(px, w.y, 0, px, w.y, w.r);
        g.addColorStop(0, `rgba(214,196,178,${a})`);
        g.addColorStop(0.6, `rgba(214,196,178,${a * 0.45})`);
        g.addColorStop(1, "rgba(214,196,178,0)");
        ctx.fillStyle = g;
        ctx.fillRect(px - w.r, w.y - w.r, w.r * 2, w.r * 2);
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const draw = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bloom = bloomLevel(pageProgress(window.scrollY, max));
      ctx.fillStyle = "#0e0a06";
      ctx.fillRect(0, 0, W, H);
      drawWarmth();
      drawShaftsAndBloom();
      drawSmoke();
      t += 16;
      raf = requestAnimationFrame(draw);
    };

    if (reduceMotion) {
      bloom = 0.6;
      ctx.fillStyle = "#0e0a06";
      ctx.fillRect(0, 0, W, H);
      drawWarmth();
      drawShaftsAndBloom();
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas id="atmo" ref={canvasRef} aria-hidden="true" />;
}
```

- [ ] **Step 2: Write `BurnRail.tsx`**

Markup from `index.html` lines 44–52; progress loop per spec §6 JS contract (live scroll bounds each frame, two style writes, delta gate):

```tsx
// components/landing/BurnRail.tsx
"use client";

import { useEffect, useRef } from "react";
import { pageProgress, railDisplayPercent, shouldWriteProgress } from "@/lib/landing/scroll-math";

/* Desktop-only cigar that burns down with reading progress. Progress is
   computed per frame from live scroll bounds (pinned scenes change page
   height, so a cached range would go stale). Hidden <900px and under
   reduced motion via landing.css. */
export function BurnRail() {
  const ashRef = useRef<HTMLElement>(null);
  const emberRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    let raf = 0;
    let lastP = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = pageProgress(window.scrollY, max);
      if (!shouldWriteProgress(p, lastP)) return;
      lastP = p;
      const d = railDisplayPercent(p).toFixed(2) + "%";
      if (ashRef.current) ashRef.current.style.height = d;
      if (emberRef.current) emberRef.current.style.top = d;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="burn-rail" aria-hidden="true">
      <div className="cigar">
        <span className="cigar-smoke"><b /><b /><b /><b /><b /></span>
        <i className="cigar-ash" ref={ashRef} />
        <span className="cigar-ember" ref={emberRef} />
        <span className="cigar-band">A<i>&</i>E</span>
      </div>
      <span className="rail-word">Scroll</span>
    </div>
  );
}
```

- [ ] **Step 3: Write `Preloader.tsx`**

Markup from `index.html` lines 14–18. Three gates render-side (spec §7): inline script hides it pre-hydration for repeat visitors (sessionStorage), `<noscript>` hides it with JS off, CSS hides it for reduced motion (Task 3 delta 8). motion.ts (Task 6) animates + removes it and sets the seen flag.

```tsx
// components/landing/Preloader.tsx
/* Session-gated preloader. The inline script runs at parse time (before
   hydration) so repeat visitors never see a flash; motion.ts owns the
   animated run and removal on first visit. */
const HIDE_IF_SEEN = `try{if(sessionStorage.getItem("ae-preloader-seen")==="1"){var p=document.getElementById("ae-preloader");if(p)p.style.display="none"}}catch(e){}`;

export function Preloader() {
  return (
    <>
      <div className="preloader" id="ae-preloader" data-preloader aria-hidden="true">
        <div className="mark">Ash <em>&</em> Ember</div>
        <div className="rule"><i data-preloader-bar /></div>
        <div className="tag">A Society Journal of Smoke &amp; Patience</div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: HIDE_IF_SEEN }} />
      <noscript>
        <style>{`[data-preloader]{display:none}`}</style>
      </noscript>
    </>
  );
}
```

(The inline script is static trusted content, not user input; app CSP is report-only so this is safe.)

- [ ] **Step 4: Mount all three in `LandingPage.tsx`**

Order inside `.ae-landing`: `<Preloader />` first, then `<Atmosphere />`, `.vignette`, `.tex-layer`, `<Masthead />`, `<BurnRail />`, `<main>...`, `<LandingFooter />`.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npx vitest run lib/landing/ && npm run build 2>&1 | tail -5`
Expected: all green. Dev check: canvas glow visible behind content, burn rail on the right ≥900px with smoke wisps, preloader shows on first load (static, unanimated — motion arrives in Task 6), hidden on reload (sessionStorage). Clear `sessionStorage` key `ae-preloader-seen` between checks.

- [ ] **Step 6: Commit**

```bash
git add components/landing/
git commit -m "feat: landing atmosphere canvas, burn rail, session-gated preloader"
```

---

### Task 6: Motion module — GSAP/Lenis choreography + boot

**Files:**
- Create: `components/landing/motion.ts`
- Modify: `components/landing/LandingPage.tsx`

**Interfaces:**
- Consumes: every `data-*` attribute from Tasks 3–5 plus `.split-word` spans it creates itself.
- Produces: `initLandingMotion(scope: HTMLElement): Promise<() => void>` — resolves to a cleanup function. Dynamically imported by `LandingPage.tsx` so gsap/lenis stay out of the route's initial chunk.

- [ ] **Step 1: Write `motion.ts`**

Direct port of `mockups/landing-comps/hybrid/script.js` lines 31–338 (skip the texture switcher, lines 5–29, and the atmosphere/rail, owned by Task 5 components). Every numeric value (durations, staggers, positions, `start`/`end` strings, scrub values) must match the mockup exactly. Structure:

```ts
// components/landing/motion.ts
/* All landing choreography. Loaded via dynamic import from LandingPage so
   gsap + ScrollTrigger + lenis (~35KB gz) never touch other routes.
   Values are a 1:1 port of mockups/landing-comps/hybrid/script.js —
   the mockup is the authoritative motion reference. */

type Cleanup = () => void;

const PRELOADER_SEEN_KEY = "ae-preloader-seen";

function splitWords(el: HTMLElement) {
  if (el.dataset.splitReady) return;
  const walk = (node: Node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        (child.textContent ?? "").split(/(\s+)/).forEach((part) => {
          if (!part.trim()) {
            frag.appendChild(document.createTextNode(part));
            return;
          }
          const mask = document.createElement("span");
          mask.className = "split-word-mask";
          const w = document.createElement("span");
          w.className = "split-word";
          w.textContent = part;
          mask.appendChild(w);
          frag.appendChild(mask);
        });
        node.replaceChild(frag, child);
      } else if (child.nodeType === 1) {
        walk(child as HTMLElement);
      }
    });
  };
  walk(el);
  el.dataset.splitReady = "true";
}

export async function initLandingMotion(scope: HTMLElement): Promise<Cleanup> {
  const removePreloader = () => scope.querySelector("[data-preloader]")?.remove();

  let gsap: typeof import("gsap").gsap;
  let ScrollTrigger: typeof import("gsap/ScrollTrigger").ScrollTrigger;
  let LenisCtor: typeof import("lenis").default;
  try {
    [{ gsap }, { ScrollTrigger }, { default: LenisCtor }] = await Promise.all([
      import("gsap"),
      import("gsap/ScrollTrigger"),
      import("lenis"),
    ]);
  } catch {
    // Library-failure guard (spec §7): static page stands on its own.
    removePreloader();
    return () => {};
  }

  gsap.registerPlugin(ScrollTrigger);

  const prevScrollRestoration = history.scrollRestoration;
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- Lenis ----
  let lenis: InstanceType<typeof LenisCtor> | null = null;
  let lenisTick: ((t: number) => void) | null = null;
  if (!reduceMotion) {
    lenis = new LenisCtor({ lerp: 0.08, smoothWheel: true, wheelMultiplier: 0.9 });
    lenis.on("scroll", ScrollTrigger.update);
    lenisTick = (t: number) => lenis?.raf(t * 1000);
    gsap.ticker.add(lenisTick);
    gsap.ticker.lagSmoothing(0);
  }

  // ---- masthead scrolled state ----
  const masthead = scope.querySelector("[data-masthead]");
  const onScroll = () => masthead?.classList.toggle("scrolled", window.scrollY > 60);
  addEventListener("scroll", onScroll, { passive: true });

  // ---- preloader (once per session) ----
  const playPreloader = (): Promise<void> => {
    const loader = scope.querySelector("[data-preloader]");
    const bar = scope.querySelector("[data-preloader-bar]");
    if (!loader) return Promise.resolve();
    let seen = false;
    try { seen = sessionStorage.getItem(PRELOADER_SEEN_KEY) === "1"; } catch {}
    if (reduceMotion || seen) { loader.remove(); return Promise.resolve(); }
    try { sessionStorage.setItem(PRELOADER_SEEN_KEY, "1"); } catch {}
    return new Promise((resolve) => {
      gsap.timeline({ defaults: { ease: "power3.out" }, onComplete: () => { loader.remove(); resolve(); } })
        .to(bar, { scaleX: 1, duration: 1.0 })
        .to(loader, { yPercent: -100, duration: 0.8, ease: "power4.inOut" }, "+=0.1");
    });
  };

  const ctx = gsap.context(() => {}, scope);

  const boot = () => ctx.add(() => {
    // -- hero entrance + parallax out --
    const headline = scope.querySelector<HTMLElement>("[data-hero-headline]");
    if (!reduceMotion && headline) {
      headline.querySelectorAll<HTMLElement>(".line").forEach(splitWords);
      gsap.timeline({ defaults: { ease: "power4.out" } })
        .fromTo("[data-hero-kicker]", { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.8 })
        .fromTo(headline.querySelectorAll(".split-word"),
          { yPercent: 135, filter: "blur(6px)" },
          { yPercent: 0, filter: "blur(0px)", duration: 1.1, stagger: 0.07 }, "-=0.5")
        .fromTo("[data-hero-deck]", { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.9 }, "-=0.6")
        .fromTo("[data-hero-ctas]", { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.9 }, "-=0.7")
        .fromTo("[data-hero-cue]", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8 }, "-=0.4");
      gsap.to(".hero > *", {
        y: -60, autoAlpha: 0.25, ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 1 },
      });
    }

    // -- brand band seamless loop --
    const band = scope.querySelector("[data-brand-band]");
    if (band && !reduceMotion) {
      band.innerHTML += band.innerHTML;
      band.setAttribute("data-loop", "");
    }

    // -- manifesto: pinned word scrub --
    const paras = gsap.utils.toArray<HTMLElement>("[data-scrub-words]");
    paras.forEach(splitWords);
    if (!reduceMotion) {
      const words: Element[] = [];
      paras.forEach((p) => words.push(...p.querySelectorAll(".split-word")));
      gsap.fromTo(words, { opacity: 0.13 }, {
        opacity: 1, stagger: 0.6, ease: "none",
        scrollTrigger: {
          trigger: "[data-manifesto-scene]", start: "top 56px", end: "+=160%",
          scrub: 0.8, pin: true, anticipatePin: 1,
        },
      });
    }

    // -- generic once-only section reveals --
    if (reduceMotion) {
      gsap.set("[data-reveal-item]", { autoAlpha: 1 });
    } else {
      gsap.utils.toArray<HTMLElement>("[data-story-section]").forEach((section) => {
        const items = section.querySelectorAll("[data-reveal-item]");
        gsap.fromTo(items.length ? items : section.children,
          { y: 36, autoAlpha: 0, filter: "blur(8px)" },
          { y: 0, autoAlpha: 1, filter: "blur(0px)", duration: 1, ease: "power4.out", stagger: 0.09,
            scrollTrigger: { trigger: section, start: "top 80%", once: true } });
      });
    }

    // -- CH1: pinned humidor scene, step + visual pairs --
    const humidorScene = scope.querySelector("[data-humidor-scene]");
    if (reduceMotion || innerWidth < 900) {
      gsap.set("[data-scene-phone], [data-scene-sat], [data-scene-step]", { autoAlpha: 1 });
    } else if (humidorScene) {
      const steps = gsap.utils.toArray<HTMLElement>("[data-scene-step]");
      gsap.timeline({
        scrollTrigger: { trigger: humidorScene, start: "top top", end: "+=200%", scrub: 1.1, pin: true, anticipatePin: 1 },
      })
        .fromTo(steps[0], { autoAlpha: 0, x: -30 }, { autoAlpha: 1, x: 0, ease: "none", duration: 0.22 }, 0)
        .fromTo("[data-scene-phone]", { y: 90, autoAlpha: 0, rotate: -3 },
          { y: 0, autoAlpha: 1, rotate: 0, ease: "none", duration: 0.26 }, 0)
        .fromTo(steps[1], { autoAlpha: 0, x: -30 }, { autoAlpha: 1, x: 0, ease: "none", duration: 0.22 }, 0.37)
        .fromTo(".sat-env", { autoAlpha: 0, y: 40, scale: 0.94 },
          { autoAlpha: 1, y: 0, scale: 1, ease: "none", duration: 0.26 }, 0.37)
        .fromTo(steps[2], { autoAlpha: 0, x: -30 }, { autoAlpha: 1, x: 0, ease: "none", duration: 0.22 }, 0.72)
        .fromTo(".sat-age", { autoAlpha: 0, y: 40, scale: 0.94 },
          { autoAlpha: 1, y: 0, scale: 1, ease: "none", duration: 0.26 }, 0.72);
    }

    // -- CH2: pinned burn deck --
    const burnScene = scope.querySelector("[data-burn-scene]");
    const cards = gsap.utils.toArray<HTMLElement>("[data-burn-stage] .burn-card");
    if (reduceMotion || innerWidth < 900) {
      gsap.set(cards, { clearProps: "all", autoAlpha: 1 });
    } else if (burnScene && cards.length === 3) {
      gsap.set(cards, { y: () => innerHeight });
      gsap.timeline({
        scrollTrigger: { trigger: burnScene, start: "top top", end: "+=200%", scrub: 1.1, pin: true, anticipatePin: 1,
          invalidateOnRefresh: true },
      })
        .to(cards[0], { y: 0, ease: "none", duration: 0.2 }, 0.03)
        .to(cards[0], { scale: 0.97, y: -46, autoAlpha: 0.8, ease: "none", duration: 0.22 }, 0.38)
        .to(cards[1], { y: 0, ease: "none", duration: 0.24 }, 0.38)
        .to(cards[0], { scale: 0.94, y: -84, autoAlpha: 0.5, ease: "none", duration: 0.22 }, 0.72)
        .to(cards[1], { scale: 0.97, y: -46, autoAlpha: 0.8, ease: "none", duration: 0.22 }, 0.72)
        .to(cards[2], { y: 0, ease: "none", duration: 0.24 }, 0.72);
    }

    // -- footer reveal --
    if (!reduceMotion) {
      gsap.fromTo("[data-footer-parallax]", { yPercent: -10, autoAlpha: 0.85 }, {
        yPercent: 0, autoAlpha: 1, ease: "none",
        scrollTrigger: { trigger: "[data-footer-parallax]", start: "top bottom", end: "top 60%", scrub: 1 },
      });
    }

    ScrollTrigger.refresh();
  });

  /* Boot order (spec §5 hard requirement): preloader AND fonts.ready
     resolve BEFORE any ScrollTrigger exists, so pin positions are
     measured against final glyph metrics. */
  await Promise.all([playPreloader(), document.fonts.ready]);
  boot();
  const onLoad = () => ScrollTrigger.refresh();
  addEventListener("load", onLoad);

  return () => {
    removeEventListener("load", onLoad);
    removeEventListener("scroll", onScroll);
    ctx.revert();
    ScrollTrigger.getAll().forEach((st) => st.kill());
    if (lenisTick) gsap.ticker.remove(lenisTick);
    lenis?.destroy();
    history.scrollRestoration = prevScrollRestoration;
  };
}
```

Note the one intentional divergence from the mockup: the hero parallax selector is `.hero > *` (mockup excluded `.sec-tag`, which no longer exists).

- [ ] **Step 2: Wire the boot into `LandingPage.tsx`**

Add to the orchestrator (keep everything else):

```tsx
"use client";

import { useEffect, useRef } from "react";
// ...existing section imports...

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scope = rootRef.current;
    if (!scope) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    import("./motion")
      .then(({ initLandingMotion }) => initLandingMotion(scope))
      .then((fn) => {
        if (cancelled) fn();
        else cleanup = fn;
      })
      .catch(() => {
        // chunk load failure: static page stands on its own
        scope.querySelector("[data-preloader]")?.remove();
      });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <div className="ae-landing" ref={rootRef}>
      {/* ...unchanged children... */}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build 2>&1 | tail -8`
Expected: clean. In the build output confirm `/` first-load JS did NOT jump by ~35KB (gsap must be in an async chunk; if it is in the page chunk, the dynamic import got hoisted — fix before proceeding).

- [ ] **Step 4: Full choreography check in the browser (1440 desktop)**

Dev server, signed out, fresh session (clear `ae-preloader-seen`). Verify against the mockup opened side-by-side (`open mockups/landing-comps/hybrid/index.html`):
1. Preloader gold rule fills, panel slides up, hero entrance (kicker → masked word cascade with blur → deck/CTA/cue).
2. Band + manifesto pin at 56px; words light up 0.13 → 1 across both paragraphs; releases after.
3. CH1 header pins; three step+visual pairs arrive together on scrub.
4. CH2 cards slide up and stack; receding cards scale/lift/dim exposing label tabs; whole section departs together.
5. Lounge cards reveal staggered; finale bloom returns; footer parallax.
6. Burn rail ash grows, ember descends, ends at the band at page bottom.
7. Reload → no preloader. OS reduced-motion on → fully static readable page, no pins, rail hidden.
8. Console: zero errors/warnings.

- [ ] **Step 5: Commit**

```bash
git add components/landing/
git commit -m "feat: landing motion system (GSAP scroll choreography + Lenis, dynamic import)"
```

---

### Task 7: Verification sweep + budgets

**Files:**
- None created; fixes only if gates fail.

- [ ] **Step 1: Gates**

Run each; all must pass:
```bash
npx tsc --noEmit
npm run test:unit
npm run build
npm run check:shells
npm run analyze && npm run check:bundle
```
Expected: green. `check:bundle` compares against `scripts/bundle-baseline.json`; the `/` route is new code so justify any delta in the PR body (budget: landing route < 150KB gz total JS).

- [ ] **Step 2: Static resilience checks**

- JS disabled (DevTools → Command Menu → "Disable JavaScript"), signed out, load `/`: full readable page, no preloader, no hidden content, single static brand-band run.
- `curl -s localhost:3000/ | grep -c "—"` on the rendered HTML → expect 0 em dashes in the page body (typographic quotes are fine).

- [ ] **Step 3: Breakpoint pass (spec §9)**

Use the `verify-in-app` project skill's screenshot tooling in signed-OUT mode (landing is a signed-out surface; skip the login step) at widths 320 / 375 / 768 / 1024 / 1440 / 1920. Verify: no horizontal overflow, masthead fits at 320 (compressed variant), buttons never wrap, <900px has no pins and no burn rail, chapters render as static stacks on mobile, burn cards render as a plain list <900px.

- [ ] **Step 4: Routing behavior**

- Signed out: `/` renders the landing.
- Signed in (test account): `/` redirects to `/home`. (`getServerUser` path untouched, but verify anyway.)
- `/login`, `/signup` reachable from masthead/CTAs.

- [ ] **Step 5: Commit any fixes; push and open PR**

```bash
git push -u origin feat/landing-redesign
gh pr create --title "feat: landing page redesign (Society Journal scroll experience)" --body "..."
```
PR body: summary, spec + mockup references, gate results, test plan with the real-device iOS pass as an unchecked TODO for Dave (spec §9 requires it before merge). Reminder: pre-push PR-state check (`gh pr list --head feat/landing-redesign --state all`) — must be no closed/merged PR on this branch.

---

## Self-review notes (done at planning time)

- **Premise checks:** `/privacy` + `/terms` routes exist (footer links resolve there, no new legal routes needed). Marketing route is dynamic today (server redirect) — spec §1 hard requirement wins over §8's stale "statically prerendered" line; `check:shells` gates only bottom-nav routes. Cormorant app instance lacks 500/italic → route-scoped instance in Task 2. gsap/lenis not installed → Task 2. Old `LandingPage.tsx` referenced only by the marketing page → safe full replacement. Branch is 0 behind origin/main.
- **Spec coverage:** §3 sections → Tasks 3–5; §4 visual system → Task 3 (texture, layering, glass, focus floor via ported CSS); §5 motion → Task 6 (boot order, pins, reveals, mobile/reduced-motion branches); §6 burn rail → Tasks 1+5; §7 resilience → Tasks 5 (preloader gates) + 6 (library guard, static-at-rest); §8 implementation notes → Tasks 2, 3 (metadata), 6 (dynamic import), 7 (budgets); §9 acceptance → Tasks 6–7 (real-device pass stays with Dave); §10 open items → link map in Task 3.
- **Lifecycle walk (LandingPage):** mount → dynamic import → motion boot; unmount (client nav) → cleanup reverts gsap context, kills ScrollTriggers, destroys Lenis, removes ticker/listeners, restores scrollRestoration. Dev StrictMode double-mount: first mount may consume the preloader session flag → second mount skips preloader and still boots (acceptable dev-only quirk). `cancelled` flag prevents a late-resolving init from leaking after unmount. splitWords is idempotent via `data-split-ready`.
- **Route-weight:** `/` stays exactly as heavy server-side (unchanged page.tsx logic); client JS budget enforced in Task 7. No app route touched.
- **Decisions made for unspecified spec points (surface to Dave):** footer "The Society" → `#top`, "Membership" → `/signup`, "Contact" → `mailto:dmblack83@gmail.com` (his email is already public as git author; swap before merge if he wants a dedicated address).
