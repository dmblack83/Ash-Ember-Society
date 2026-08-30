# Landing Page Redesign — "A Society Journal of Smoke & Patience"

**Date:** 2026-08-29
**Status:** Approved direction; validated via interactive mockup
**Authoritative visual reference:** `mockups/landing-comps/hybrid/` (index.html, styles.css, script.js — untracked, on disk). The mockup IS the design; where this document and the mockup disagree on visuals or motion, the mockup wins. Copy in this spec is final and approved.

---

## 1. Goal and scope

Replace the current landing page (`app/(marketing)/page.tsx` + `components/landing/LandingPage.tsx`, ~1,030 lines of framer-motion sections) with a cinematic scroll-storytelling page: editorial "society journal" voice, dark-glass product depictions, animated atmosphere, and scroll-choreographed chapters that expose the app.

Out of scope: any change to app-shell routes, auth, nav prefetch behavior of the app, or the Membership/pricing model. Landing is a marketing surface only.

### Routing behavior (hard requirement)
- Signed-OUT visitors to the root URL (www.ashember.vip / `/`) see the landing page.
- Signed-IN users hitting the root URL go to the app view (`/home`), exactly as today. Do not change the existing authenticated redirect.
- The PWA is unaffected: its start_url remains `/home`.
- Signup and login flows remain exactly as they are today (including any post-login redirect they already do).

## 2. Direction (chosen and rejected)

Chosen: **hybrid of "Editorial Ritual" (journal masthead, chapter structure, oversized Cormorant, plate captions) and "Dark Glass Gallery" (frosted product cards, 1px gradient edges, mono micro-labels)**, over a warm animated atmosphere.

Rejected siblings (do not re-propose): pure Cinematic Ember (comp 01), pure Editorial (comp 03), the July 2026 landing redesign (deleted), phrase-marquee band, per-heading italic accents (reserved for hero + finale + manifesto close only), kickers that restate their heading, fake member activity (names/counts/timestamps), pulsing "LIVE" indicators.

## 3. Page structure and final copy

Sections in order. All copy below is FINAL (approved 2026-08-29). No em dashes in any user-facing string.

### 00 Preloader (session-gated)
Wordmark "Ash & Ember" + rule that fills gold + tagline "A Society Journal of Smoke & Patience". Plays once per session (sessionStorage flag), skipped for reduced-motion; page never depends on it (see §7).

### 00 Masthead (fixed)
Wordmark | "A Society Journal of Smoke & Patience · Vol. I" (hidden <900px) | "Sign In" (→ /login) + "Join the Society" (→ /signup). Transparent at top; blurred dark bar with hairline after 60px scroll. Compresses below 560px.

### 00 Burn rail (desktop only; see §6)

### 01 Hero
- Kicker: "Est. MMXXVI · For the Patient"
- Headline (3 stepped lines, line 2 gold italic): "The slow art / *of keeping* / good company."
- Deck: "An exclusive digital sanctuary for the modern aficionado. Track your collection, refine your palate, and connect with a society of discerning enthusiasts."
- CTA: button "Join the Society" + note "Free to join"
- Scroll cue: "The ritual begins" with fading rule
- Entrance: kicker rises, headline reveals word-by-word from masks (blur 6px→0, yPercent 135→0, stagger .07), then deck/CTA/cue. Hero drifts up and dims on scroll-out.

### 01a Brand band
- Label: "Community grown catalog with 9K+ cigars"
- Marquee of 50 brand wordmarks in gold serif, ◆ separators, edge-fade mask, ~150s loop, duplicated for seamless wrap (JS adds the loop; static single run without JS).
- Brands (exact list): Padrón, Arturo Fuente, Davidoff, Cohiba, Montecristo, Romeo y Julieta, H. Upmann, Partagás, Hoyo de Monterrey, Punch, Bolívar, Trinidad, Oliva, My Father, Drew Estate, Liga Privada, Undercrown, Ashton, Perdomo, Rocky Patel, Alec Bradley, La Flor Dominicana, E.P. Carrillo, Plasencia, Foundation, Tatuaje, Crowned Heads, Aganorsa Leaf, Illusione, Joya de Nicaragua, Camacho, CAO, Macanudo, La Gloria Cubana, Diamond Crown, La Aroma de Cuba, San Cristóbal, Southern Draw, Dunbarton, Warped, RoMa Craft, Caldwell, Espinosa, HVC, Fratello, Micallef, Kristoff, Villiger, Cavalier Genève, Padilla
- Text wordmarks ONLY. Real logo images require licensed assets and trademark review; do not add them without both.

### 02 Manifesto (pinned scene)
Band + manifesto pin together when the band reaches 56px from viewport top; words light up (opacity .13→1, scrubbed) across both paragraphs over +=160% scroll, then release.
- P1: "In a world obsessed with speed, the enjoyment of a fine cigar remains one of the few rituals that demands our patience."
- P2: "Ash & Ember was founded on a simple premise: the experience of a great cigar should extend beyond the final draw. We've built a digital haven that honors the analog tradition, a place to document your journey, discover hidden gems, and share a smoke & story with those who *"get it"*." (curly quotes; gold italic on «"get it".»)
- Signature: "Dave · Founder" (mono caps)

### 03 Chapter One · The Collection (pinned scene, +=200%)
Header pins at top: kicker "Chapter One · The Collection", H2 "The humidor, kept like a ledger.", deck "Every stick logged with its wrapper, vitola, and age. Live cabinet sensors watch the humidity while time does its quiet work."
Three step+visual PAIRS arrive together on scrub (steps left, visuals right):
1. "Age with intent" — "Set a resting target per cigar. The shelf tells you what is ready tonight and what deserves another season in the dark." + humidor phone card
2. "Sensors on watch" — "Pair your cabinet sensor and monitor each humidor's temperature and humidity in real time." + cabinet sensor card
3. "Push notifications" — "Get notified when cigars are ready to smoke or when your humidor needs attention, and when other users comment on your Lounge posts." + aging alert card
App-depiction data (drawn UI, not screenshots): Humidor "24 CIGARS · 68% RH" listing Padrón 1964 Anniversary (Maduro · Torpedo · aging 8 mo, READY), Oliva Serie V Melanio (Sumatra · Figurado · 3 mo, RESTING), Arturo Fuente Hemingway (Cameroon · Perfecto · 5 mo, RESTING), Liga Privada No. 9 (Broadleaf · Toro · 11 mo, READY). Sensor: "CABINET SENSOR · PAIRED", Humidity 68% RH, Temperature 67.4°F, Ready tonight 3 cigars (static dot, never pulsing). Aging: "AGING ALERT", Padrón 1964 Anniversary, bar 96%, "8 MO OF 8 MO TARGET · READY NOW".

### 04 Chapter Two · The Record (pinned scene, +=200%)
Header pins: kicker "Chapter Two · The Record", H2 "Every burn, remembered.", deck "Rate every smoke by thirds. Your palate develops a memory, and the Society tracks it for you."
All three burn cards start one viewport below (clipped). Card 1 slides in and locks, then card 2 lands over it, then card 3; receding cards scale (.97/.94), lift (-46/-84px) and dim (.8/.5) so each exposes its full label row as a tab. Cards are FULLY OPAQUE (#16100b fill; no bleed-through). Whole section departs together.
Cards: №214 · Tonight, 92/100, Padrón 1964 Anniversary, "Maduro · Torpedo · paired with rye", "Espresso and dark cocoa out of the gate, cedar on the retrohale. *Razor burn line to the last third.* Worth every week of the wait." / №213 · Last Friday, 88/100, Oliva Serie V Melanio, "Sumatra · Figurado · paired with cold brew", "Baking spice and toast, a touch of white pepper in the final third. Needed one relight in the wind, no fault of its own." / №212 · The Porch, 95/100, Arturo Fuente Hemingway, "Cameroon · Perfecto · paired with nothing at all", "Sweet cedar, cream, and a long quiet finish. *The kind of smoke you want to remember.* Ninety minutes gone in what felt like ten." Footer on each: "FIRST · SECOND · FINAL THIRD" with three thirds bars (gold-deep/amber/ember).

### 05 Chapter Three · The Company (standard reveals)
Kicker "Chapter Three · The Company", H2 "A lounge with no velvet rope.", deck "One feed, every member. Trade burn reports, argue about wrappers, and welcome the new Society members."
Three staggered glass post cards, label "THE LOUNGE", attribution "MEMBER" (generic avatars, no names/times/counts):
1. "Eight months on the '64 and it finally opened up. Worth every week of waiting."
2. "Hot take: Cameroon is the most underrated wrapper in the game and it is not close."
3. "First burn report in the books. Went with a Hemingway Short Story on the advice of this feed. You people were right."

### 06 Finale
Ember bloom returns full strength. H2 "Your seat at the table *awaits.*" Sub "Join free with up to twenty cigars on the house. Members keep an unlimited humidor count." CTA "Join the Society" + "No card required."

### 07 Footer
Wordmark | The Society · Membership · Journal · Sign In | "Smoke slowly. MMXXVI." Legal row: "© MMXXVI The Ash & Ember Society. All rights reserved." + Privacy Policy · Terms of Service · Contact · Instagram.
- Privacy Policy and Terms of Service link to the SAME legal content the app already uses (resolve the exact routes during build; if the content only lives inside the Account page's Legal tab, expose it at standalone routes and point both the app and landing at them).
- Instagram: https://www.instagram.com/ash_and_ember_society (opens in new tab, `rel="noopener"`).

## 4. Visual system

- Tokens: existing lounge palette only (`--background #15110b`, cream, gold `#D4A04A`, gold-deep `#a87c32`, amber `#C17817`, ember `#E8642C`, muted `#A69080`). Cormorant Garamond display (already self-hosted via next/font), system sans body, system mono labels. No new families.
- Page base `#0e0a06`. Layering bottom→top: atmosphere canvas (fixed, z0) → vignette (z1) → **texture layer (z2, BEHIND content)** → content (z10) → masthead/rail (z45–50). Texture never overlays content.
- Texture (approved: "Woven Checker" at max intensity): fixed overlay, `mix-blend-mode: overlay`, opacity .336 (base .14 × 2.4), backgrounds: repeating-conic checker `rgba(245,230,211,.6)` at 8px + fractal-noise SVG tile at 60px. Remove the mockup's texture switcher in production.
- Atmosphere canvas: static warm underglow (radial, rgba(122,80,42,.11) core), six static light shafts rising from the bottom edge (elliptical radial gradients, screen blend, alpha ~.05 scaled by bloom), ember bloom at bottom center. NO intensity oscillation, NO positional drift; the only animated element is smoke: ≤26 wisps, spawn p<.06/frame when bloom>.3, alpha ≤.035, slow rise with sway. Bloom scales with scroll progress: full at hero (p<.12), .15 mid-page, returns after p>.82.
- Glass card language: 1px gradient wrapper (cream/gold), dark translucent fill + backdrop-blur 20px, mono micro-labels ≥10px in `--mute`. Burn cards opaque.
- Functional text floor: 9.5px mono minimum, `--mute` not `--dim`.

## 5. Motion system

- Stack: `gsap` + `gsap/ScrollTrigger` + `lenis` via npm (dynamic import on the landing route only; never CDN).
- Lenis: lerp .08, wheelMultiplier .9; disabled for reduced-motion.
- Reveals: once-only, y 36 + blur 8 → 0, power4.out, stagger .09, trigger "top 80%".
- Pins: manifesto (start "top 56px", +=160%), CH1 (+=200%), CH2 (+=200%); all `scrub` ~1.1, `anticipatePin`, overflow hidden on pinned containers.
- Hero parallax out; footer parallax reveal (scrub).
- Boot order (hard requirement): preloader promise AND `document.fonts.ready` resolve BEFORE any ScrollTrigger is created (prevents pin-position drift from late font metrics). `history.scrollRestoration = "manual"` + scroll to top on load.
- Mobile (<900px): all pins OFF; scenes render as static stacked layouts (steps then visuals; burn cards as a simple list; <640px stage stacks fully). Burn rail hidden.
- Reduced motion: static page, everything visible, no Lenis, no canvas animation loop (one static warm frame), no marquee loop, no smoke.

## 6. Burn rail (signature component)

Fixed right (right 20px, vertical center), desktop ≥900px only, `aria-hidden`. A vertical maduro cigar (27px × 38vh) that burns down as the reader scrolls; reference photo: `cigar example.jpeg` (repo root).
- Wrapper: near-black oily maduro (#150a04→#3a220e sheen), lengthwise vein lines, one winding seam, self-transparent SVG noise mottle. No hash marks.
- Ash: grows from top = scroll progress; crackled (noise + flake banding), 2px wider than the wrapper.
- Ember: 8px molten line at the ash/wrapper seam, radial #ffe4b0→ember, triple glow shadow. THE position indicator and the component's only light source.
- Band: "A&E" black field, double gold frame, embossed gold Cormorant type, bottom 10%.
- Smoke: 5 staggered CSS wisps rising from the TOP of the ash tip (not the ember), blur 5px, drift and dissipate; disabled reduced-motion.
- Progress: computed per frame from live `scrollY / (scrollHeight - innerHeight)` (never a cached trigger range; pins change page height). Display progress clamped to p×0.76 so the ember finishes AT the band. Vertical "Scroll" label beneath.
- JS contract: two style writes (`ash.height = d%`, `ember.top = d%`), skip when |Δp| < .0005.

## 7. Resilience (hard requirements, from anti-slop audit)

1. Full static page with JS disabled: `<noscript>` hides preloader; no content hidden at rest; motion is enhancement only.
2. Library-failure guard: if gsap/ScrollTrigger/Lenis missing, remove preloader and render static.
3. Preloader session-gated; never blocks repeat visits.
4. No invented social proof: generic MEMBER attributions, static sensor dot, no fake counts/timestamps.
5. One CTA phrase everywhere: "Join the Society".

## 8. Implementation notes (Next.js)

- Route: `app/(marketing)/page.tsx` stays a server component shell; new `components/landing/` client components (suggest: `LandingPage.tsx` orchestrator + `Atmosphere.tsx` canvas + `BurnRail.tsx` + per-section components + `landing.css`). Delete the old framer-motion sections; framer-motion is NOT used here (GSAP owns this page).
- Marketing route is outside the app shell; it must remain statically prerendered (`○`). No server data. `npm run check:shells` must stay green.
- Textures/noise as inline SVG data URIs (CSP-safe, zero requests). Fonts: reuse existing self-hosted Cormorant; ensure hero weights preloaded on this route.
- Dynamic-import the GSAP/Lenis bundle so `/login`, `/signup`, and app routes pay nothing.
- Budgets (from house perf rules): landing JS < 150KB gz (GSAP+ScrollTrigger+Lenis ≈ 60KB gz + page code), CSS < 30KB, LCP < 2.5s, CLS < 0.1. `npm run analyze` + `check:bundle` before PR.
- SEO: title/description/OG for the marketing page (new copy), h1 = hero headline. (Full SEO pass is a separate follow-up; do not block on it.)

## 9. Acceptance criteria

- Visual/choreography parity with the mockup at 1440 desktop: preloader (first visit), hero entrance, band+manifesto pin with word lighting, CH1 header pin + 3 pairs, CH2 deck stacking + unified departure, lounge reveals, finale bloom, footer.
- Burn rail tracks full page height correctly (pins included), ember ends at the band, smoke rises from ash tip.
- Breakpoints 320 / 375 / 768 / 1024 / 1440 / 1920: no overflow, no clipped pinned content, buttons never wrap, masthead fits at 320.
- Reduced-motion and JS-disabled render complete readable pages.
- Root URL: signed-out visitors get the landing page; signed-in users land in the app (`/home`); PWA still launches at `/home`.
- `verify-in-app` run on the landing route (console clean, no 5xx); `check:shells`, `check:bundle`, unit tests, type check green.
- Real-device pass on Dave's phone before merge (iOS Safari).

## 10. Open items (decided not blocking)

- Sign In / Join link targets: wire to existing `/login` and `/signup`.
- "Journal" footer link target: points at `/discover/cigar-news` for now.
- Catalog count copy says "9K+" (aspirational; catalog currently 4,221). Dave's call, revisit before launch if needed.
