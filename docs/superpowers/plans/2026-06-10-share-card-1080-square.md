# Burn Report Share Card — Legible Type + 1080×1080 Square — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make burn-report share images readable without zooming, output as fixed 1080×1080 squares optimized for Instagram.

**Architecture:** Centralize font sizes into a ~2x `type` scale in `tokens.ts`; apply it across `page1.tsx`/`page2.tsx`; bound the two overflow risks (page-1 photos to a reserved band, page-2 prose via a new pure `clampText`); extract the SVG→PNG pipeline into `render.ts` which renders the card naturally then squares it to 1080×1080 with Sharp `fit: "contain"` padding (centered; never clips; scales the rare over-tall report down rather than cropping). A dev script renders sample PNGs for visual verification.

**Tech Stack:** Satori (SVG layout), Sharp (rasterize/resize), TypeScript, Vitest (pure-logic unit tests), tsx (dev script runner).

**Branch:** `feat/share-card-1080-square` (already created off synced `main`; the design spec is already committed to it).

**Note on the contain-pad refinement:** The spec said "render fixed height, drop trim." During planning this was refined to "render natural height, trim, then Sharp `fit: contain` to 1080×1080." Same visual result (centered square), but it cannot hard-clip a dense report and degrades gracefully. This is the mechanism used below.

---

## File Structure

- Modify: `lib/share-image/tokens.ts` — add centralized `type` scale, `IMAGE_HEIGHT`, `PHOTO_BAND_H`.
- Modify: `lib/share-image/helpers.ts` — add pure `clampText`.
- Modify: `lib/share-image/__tests__/helpers.test.ts` — add `clampText` tests.
- Create: `lib/share-image/__tests__/tokens.test.ts` — type-scale legibility-floor tests.
- Create: `lib/share-image/render.ts` — `renderSquarePng(svg)`: 2x supersample + flatten + trim + contain-pad to 1080×1080.
- Modify: `lib/share-image/page1.tsx` — consume type scale; photo band; allow brand to wrap.
- Modify: `lib/share-image/page2.tsx` — consume type scale; clamp review + thirds prose.
- Modify: `app/api/burn-report/[id]/share-image/route.ts` — call `renderSquarePng`; drop inline Sharp pipeline.
- Create: `scripts/render-share-sample.ts` — dev tool: render sample cards to `/tmp/*.png`, assert 1080×1080.

Test commands: `npm run test:unit` (= `vitest run lib/`); a single file via `npx vitest run lib/share-image/__tests__/<file>`. Build: `npm run build`. Sample render: `npx tsx scripts/render-share-sample.ts`.

---

## Task 1: `clampText` helper (TDD)

**Files:**
- Modify: `lib/share-image/helpers.ts`
- Test: `lib/share-image/__tests__/helpers.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `lib/share-image/__tests__/helpers.test.ts`. Also add `clampText` to the existing import on line 2 so it reads:
`import { gradeFor, starFillPct, shouldRenderPage2, clampText } from "../helpers";`

Then append:

```ts
describe("clampText", () => {
  it("returns short text trimmed and unchanged", () => {
    expect(clampText("  a short note  ", 100)).toBe("a short note");
  });

  it("returns empty string for null, undefined, or blank", () => {
    expect(clampText(null, 50)).toBe("");
    expect(clampText(undefined, 50)).toBe("");
    expect(clampText("   ", 50)).toBe("");
  });

  it("clamps long text and ends with a single ellipsis", () => {
    const out = clampText("a".repeat(200), 50);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
  });

  it("cuts at a word boundary, not mid-word", () => {
    const text = "the quick brown fox jumps over the lazy dog";
    const out  = clampText(text, 25);
    const visible = out.slice(0, -1); // drop the ellipsis
    expect(out.endsWith("…")).toBe(true);
    expect(text.startsWith(visible)).toBe(true);
    expect(text[visible.length]).toBe(" "); // clean cut at a space
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `npx vitest run lib/share-image/__tests__/helpers.test.ts`
Expected: FAIL — `clampText` is not exported.

- [ ] **Step 3: Implement**

Append to `lib/share-image/helpers.ts`:

```ts
/* Clamp prose so it fits a bounded box on the share card. Cuts at a word
   boundary near maxChars and appends an ellipsis; short text is returned
   trimmed and unchanged. Char-based (not line-based) because Satori gives
   us no font metrics — maxChars is tuned per field to a target line count
   at that field's font size. */
export function clampText(text: string | null | undefined, maxChars: number): string {
  const t = (text ?? "").trim();
  if (t.length <= maxChars) return t;
  const slice     = t.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  const cut       = lastSpace > maxChars * 0.6 ? slice.slice(0, lastSpace) : slice;
  return cut.replace(/[\s.,;:!?]+$/, "") + "…";
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run lib/share-image/__tests__/helpers.test.ts`
Expected: PASS (all helpers tests including the 4 new ones).

- [ ] **Step 5: Commit**

```bash
git add lib/share-image/helpers.ts lib/share-image/__tests__/helpers.test.ts
git commit -m "feat(share-image): clampText helper for bounding card prose"
```

---

## Task 2: Type scale + square tokens (TDD for the floor)

**Files:**
- Modify: `lib/share-image/tokens.ts`
- Test: `lib/share-image/__tests__/tokens.test.ts`

- [ ] **Step 1: Add failing test**

Create `lib/share-image/__tests__/tokens.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { T } from "../tokens";

describe("share-image type scale", () => {
  it("body prose clears the legibility floor (>= 2.7% of width)", () => {
    expect(T.type.prose / T.IMAGE_WIDTH).toBeGreaterThanOrEqual(0.027);
    expect(T.type.body  / T.IMAGE_WIDTH).toBeGreaterThanOrEqual(0.027);
  });

  it("labels clear the small-text floor (>= 1.6% of width)", () => {
    expect(T.type.eyebrow / T.IMAGE_WIDTH).toBeGreaterThanOrEqual(0.016);
    expect(T.type.meta    / T.IMAGE_WIDTH).toBeGreaterThanOrEqual(0.016);
  });

  it("renders a square canvas", () => {
    expect(T.IMAGE_WIDTH).toBe(T.IMAGE_HEIGHT);
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `npx vitest run lib/share-image/__tests__/tokens.test.ts`
Expected: FAIL — `T.type` and `T.IMAGE_HEIGHT` don't exist.

- [ ] **Step 3: Implement**

Replace the entire contents of `lib/share-image/tokens.ts` with:

```ts
export const T = {
  background:     "#15110b",
  card:           "#241C17",
  gold:           "#D4A04A",
  goldDeep:       "#A78843",
  goldFooter:     "rgba(212,160,74,0.45)",
  foreground:     "#F5E6D3",
  paperMute:      "rgba(245,230,211,0.62)",
  paperDim:       "rgba(245,230,211,0.30)",
  line:           "rgba(212,160,74,0.16)",
  lineSoft:       "rgba(245,230,211,0.06)",
  lineStrong:     "rgba(212,160,74,0.30)",
  serif:          "Cormorant Garamond",
  mono:           "JetBrains Mono",
  outerPad:       24 as const,
  cardPad:        24 as const,
  IMAGE_WIDTH:    1080 as const,
  IMAGE_HEIGHT:   1080 as const,   // square output for Instagram
  IMAGE_MAX_HEIGHT: 5000 as const, // tall canvas Satori lays out into before squaring
  CONTENT_WIDTH:  984 as const,
  PHOTO_GAP:      6 as const,
  PHOTO_BAND_H:   360 as const,    // reserved photo height so page 1 fits the square
  /* Centralized type scale (px on the 1080 canvas). Authored ~2x the prior
     inline sizes so the smallest meaningful text clears a legibility floor
     (body >= ~2.7% of width, labels >= ~1.6%) and survives the downscale a
     phone/feed applies to a 1080 image. Visual targets — tune against the
     rendered PNG, but keep them at or above the floor the tokens test guards. */
  type: {
    eyebrow:  18, // mono uppercase micro-labels
    meta:     20, // mono masthead / attribution
    caption:  24, // serif grade / format sub-lines
    chip:     26, // serif flavor chips
    body:     30, // serif review / spec value
    prose:    32, // serif thirds / tasting prose
    identity: 38, // serif brand / series
    score:    72, // serif focal score number
    quote:    72, // serif pull-quote mark
    star:     22, // star glyph dimension (px)
  },
} as const;
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run lib/share-image/__tests__/tokens.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/share-image/tokens.ts lib/share-image/__tests__/tokens.test.ts
git commit -m "feat(share-image): centralized 2x type scale + square tokens"
```

---

## Task 3: Extract `renderSquarePng`

**Files:**
- Create: `lib/share-image/render.ts`

- [ ] **Step 1: Create the render module**

Create `lib/share-image/render.ts`:

```ts
import sharp from "sharp";
import { T } from "./tokens";

/* Rasterize a Satori SVG to a fixed IMAGE_WIDTH×IMAGE_HEIGHT PNG.

   Pipeline (each pass is a fully committed buffer so libvips never starts
   the next op before the previous finishes):
     1. Supersample: double the SVG's declared width/height so libvips
        rasterizes at 2x, then resize back to IMAGE_WIDTH for crisp text.
        (density is unreliable when Sharp gets an SVG with explicit
        dimensions; doubling is deterministic.)
     2. Flatten onto the brand background.
     3. Trim the background the card didn't use → tight card height.
     4. Square it: `fit: "contain"` into IMAGE_WIDTH×IMAGE_HEIGHT, padding
        with the brand background. A card shorter than the square is
        centered with even margins; a card taller than the square is
        scaled down to fit (never cropped). */
export async function renderSquarePng(
  svg: string,
): Promise<{ data: Buffer; width: number; height: number }> {
  const svgTagEnd  = svg.indexOf(">");
  const svgOpenTag = svg.slice(0, svgTagEnd + 1);
  const svgBody    = svg.slice(svgTagEnd + 1);
  const svgFor2x   = svgOpenTag
    .replace(/\bwidth="(\d+)"/,  (_, w) => `width="${parseInt(w, 10) * 2}"`)
    .replace(/\bheight="(\d+)"/, (_, h) => `height="${parseInt(h, 10) * 2}"`)
    + svgBody;

  const rawPng  = await sharp(Buffer.from(svgFor2x))
    .resize({ width: T.IMAGE_WIDTH })
    .png()
    .toBuffer();
  const flatPng = await sharp(rawPng)
    .flatten({ background: T.background })
    .png()
    .toBuffer();
  const trimmed = await sharp(flatPng)
    .trim({ threshold: 10 })
    .png()
    .toBuffer();
  const { data, info } = await sharp(trimmed)
    .resize(T.IMAGE_WIDTH, T.IMAGE_HEIGHT, { fit: "contain", background: T.background })
    .png()
    .toBuffer({ resolveWithObject: true });

  return { data, width: info.width, height: info.height };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit --pretty false`
Expected: no errors referencing `render.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/share-image/render.ts
git commit -m "feat(share-image): extract renderSquarePng (square via contain-pad)"
```

---

## Task 4: Sample render dev script (verification harness)

**Files:**
- Create: `scripts/render-share-sample.ts`

- [ ] **Step 1: Create the script**

Create `scripts/render-share-sample.ts`:

```ts
/* Dev tool: render the burn-report share cards to /tmp PNGs with mock data
   so layout and legibility can be eyeballed without the full app.

   Run: npx tsx scripts/render-share-sample.ts
   Each output MUST be 1080x1080. Open the PNGs to check legibility/fit. */
import fs from "fs";
import type React from "react";
import satori, { type Font } from "satori";
import { loadFonts } from "../lib/share-image/fonts";
import { buildPage1 } from "../lib/share-image/page1";
import { buildPage2 } from "../lib/share-image/page2";
import { renderSquarePng } from "../lib/share-image/render";
import { T } from "../lib/share-image/tokens";
import type { ShareImageProps } from "../lib/share-image/types";

/* 1x1 PNG so the photo band has something to render. */
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const sparse: ShareImageProps = {
  reportNumber: 42, smokedAt: "2026-06-09",
  cigar: { brand: "Padrón", series: "1964 Anniversary", format: "Torpedo" },
  overallRating: 92, drawRating: 4.5, burnRating: 4, constructionRating: 4.5, flavorRating: 4.75,
  reviewText: null, smokeDurationMinutes: 75, pairingDrink: "Bourbon", occasion: "Evening",
  flavorTagNames: [], photoDataUris: [],
  thirdsEnabled: false, thirdBeginning: null, thirdMiddle: null, thirdEnd: null,
  thirdsTaggedRows: [], displayName: "Dave Black", city: "Salt Lake City",
};

const dense: ShareImageProps = {
  ...sparse,
  reviewText:
    "A genuinely outstanding smoke from the first light. Rich, oily wrapper with a flawless burn and a draw that never tightened. ".repeat(3),
  flavorTagNames: ["cocoa", "espresso", "cedar", "black pepper", "leather", "dried fig"],
  thirdsEnabled: true,
  thirdBeginning: "Opens with bold cocoa and black pepper, a touch of cedar underneath. ".repeat(3),
  thirdMiddle: "Settles into espresso and leather, the pepper receding. ".repeat(3),
  thirdEnd: "Finishes long with dried fig and a sweet cedar note. ".repeat(3),
  thirdsTaggedRows: [
    { index: 1, flavor_tag_names: ["cocoa", "pepper"] },
    { index: 2, flavor_tag_names: ["espresso", "leather"] },
    { index: 3, flavor_tag_names: ["fig", "cedar"] },
  ],
};

async function render(name: string, element: React.ReactElement): Promise<void> {
  const svg = await satori(element, {
    width: T.IMAGE_WIDTH, height: T.IMAGE_MAX_HEIGHT, fonts: loadFonts() as unknown as Font[],
  });
  const { data, width, height } = await renderSquarePng(svg);
  const path = `/tmp/${name}.png`;
  fs.writeFileSync(path, data);
  const ok = width === T.IMAGE_WIDTH && height === T.IMAGE_HEIGHT;
  console.log(`${ok ? "OK " : "BAD"} ${path} ${width}x${height}`);
  if (!ok) process.exitCode = 1;
}

async function main(): Promise<void> {
  await render("share-p1-sparse", buildPage1(sparse));
  await render("share-p1-photos", buildPage1({ ...sparse, photoDataUris: [TINY_PNG, TINY_PNG, TINY_PNG] }));
  await render("share-p2-dense",  buildPage2(dense));
}

void main();
```

- [ ] **Step 2: Run it**

Run: `npx tsx scripts/render-share-sample.ts`
Expected: three `OK /tmp/share-*.png 1080x1080` lines, exit 0. (Pages are still the pre-restyle versions here; this proves the harness + `renderSquarePng` produce valid 1080×1080 squares.)

- [ ] **Step 3: Commit**

```bash
git add scripts/render-share-sample.ts
git commit -m "chore(share-image): dev script to render sample cards for visual checks"
```

---

## Task 5: Restyle `page1.tsx` (type scale, photo band, brand wrap)

**Files:**
- Modify: `lib/share-image/page1.tsx`

- [ ] **Step 1: Replace the file**

Replace the entire contents of `lib/share-image/page1.tsx` with:

```tsx
import React from "react";
import { T }            from "./tokens";
import { gradeFor, starFillPct } from "./helpers";
import type { ShareImageProps }  from "./types";

const STAR_PATH = "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";
const STAR_LABELS = ["", "Poor", "Below Average", "Average", "Good", "Outstanding"] as const;

function subRatingGrade(val: number): string {
  const bucket = Math.min(5, Math.floor(val));
  return val >= 1 ? STAR_LABELS[bucket] : "—";
}

function SatoriStarRow({ val, rowKey }: { val: number; rowKey: string }) {
  const s = T.type.star;
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {([1, 2, 3, 4, 5] as const).map((star) => {
        const pct = starFillPct(star, val);
        if (pct === 100 || pct === 0) {
          return (
            <svg key={star} width={s} height={s} viewBox="0 0 24 24">
              <path d={STAR_PATH} fill={pct === 100 ? T.gold : "rgba(245,230,211,0.18)"} />
            </svg>
          );
        }
        const clipId = `clip-${rowKey}-${star}`;
        return (
          <svg key={star} width={s} height={s} viewBox="0 0 24 24">
            <defs>
              <clipPath id={clipId}>
                <rect x="0" y="0" width={(24 * pct) / 100} height="24" />
              </clipPath>
            </defs>
            <path d={STAR_PATH} fill="rgba(245,230,211,0.18)" />
            <path d={STAR_PATH} fill={T.gold} clipPath={`url(#${clipId})`} />
          </svg>
        );
      })}
    </div>
  );
}

function SubRatingCell({ label, val, rowKey }: { label: string; val: number; rowKey: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
      <p style={{ fontFamily: T.mono, fontSize: T.type.eyebrow, fontWeight: 500, letterSpacing: "0.22em",
        textTransform: "uppercase", color: T.paperMute, margin: 0 }}>
        {label}
      </p>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
        <SatoriStarRow val={val} rowKey={rowKey} />
      </div>
      <p style={{ fontFamily: T.mono, fontSize: T.type.eyebrow, fontWeight: 500, letterSpacing: "0.18em",
        textTransform: "uppercase", color: T.goldDeep, margin: "8px 0 0" }}>
        {subRatingGrade(val)}
      </p>
    </div>
  );
}

function PhotoStrip({ uris }: { uris: string[] }) {
  if (uris.length === 0) return null;
  const cw   = T.CONTENT_WIDTH;
  const gap  = T.PHOTO_GAP;
  const band = T.PHOTO_BAND_H;

  if (uris.length === 1) {
    return (
      <div style={{ display: "flex", marginTop: 24 }}>
        <img src={uris[0]} width={cw} height={band}
          style={{ objectFit: "cover", borderRadius: 2 }} />
      </div>
    );
  }

  if (uris.length === 2) {
    const w = Math.floor((cw - gap) / 2);
    return (
      <div style={{ display: "flex", gap, marginTop: 24 }}>
        <img src={uris[0]} width={w} height={band} style={{ objectFit: "cover", borderRadius: 2 }} />
        <img src={uris[1]} width={w} height={band} style={{ objectFit: "cover", borderRadius: 2 }} />
      </div>
    );
  }

  // 3-photo asymmetric layout: left tall, right two stacked, total = band
  const leftW  = Math.floor((cw - gap) * (1.85 / 2.85));
  const rightW = (cw - gap) - leftW;
  const rightH = Math.floor((band - gap) / 2);
  return (
    <div style={{ display: "flex", gap, marginTop: 24 }}>
      <img src={uris[0]} width={leftW} height={band}
        style={{ objectFit: "cover", borderRadius: 2 }} />
      <div style={{ display: "flex", flexDirection: "column", gap }}>
        <img src={uris[1]} width={rightW} height={rightH}
          style={{ objectFit: "cover", borderRadius: 2 }} />
        <img src={uris[2]} width={rightW} height={rightH}
          style={{ objectFit: "cover", borderRadius: 2 }} />
      </div>
    </div>
  );
}

function Masthead({ parts }: { parts: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", marginBottom: 24 }}>
      <div style={{ height: 1, background: T.line, width: "100%" }} />
      <div style={{ display: "flex", justifyContent: "center", width: "100%", padding: "8px 0" }}>
        <p style={{ fontFamily: T.mono, fontSize: T.type.meta, fontWeight: 500, letterSpacing: "0.32em",
          textTransform: "uppercase", color: T.paperMute, margin: 0 }}>
          {parts.join(" · ")}
        </p>
      </div>
      <div style={{ height: 1, background: T.line, width: "100%" }} />
    </div>
  );
}

function Footer() {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", marginTop: 24 }}>
      <div style={{ height: 1, background: T.line, width: "100%" }} />
      <div style={{ display: "flex", justifyContent: "center", width: "100%", padding: "10px 0" }}>
        <p style={{ fontFamily: T.mono, fontSize: T.type.eyebrow, fontWeight: 500, letterSpacing: "0.32em",
          textTransform: "uppercase", color: T.goldFooter, margin: 0 }}>
          ASH & EMBER · WWW.ASHEMBER.VIP
        </p>
      </div>
    </div>
  );
}

export function buildPage1(p: ShareImageProps): React.ReactElement {
  const score     = p.overallRating ?? 0;
  const grade     = p.overallRating != null ? gradeFor(p.overallRating) : "—";
  const firstName = (p.displayName?.trim().split(/\s+/)[0] ?? "").toUpperCase() || null;

  const smokedDate = new Date(
    p.smokedAt.length === 10 ? p.smokedAt + "T00:00:00" : p.smokedAt
  );
  const mastheadDate = smokedDate
    .toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" })
    .toUpperCase()
    .replace(",", "");
  const mastheadParts = [
    "Burn Report",
    p.reportNumber != null ? `No. ${p.reportNumber}` : null,
    mastheadDate,
  ].filter(Boolean) as string[];

  const verdictLabel = firstName ? `${firstName}'S VERDICT` : "THE VERDICT";
  const scoreColW    = Math.round(T.CONTENT_WIDTH * 0.28);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: T.IMAGE_WIDTH,
      backgroundColor: T.background, padding: T.outerPad }}>
      <div style={{ display: "flex", flexDirection: "column", backgroundColor: T.card,
        border: `1px solid ${T.line}`, borderRadius: 4, padding: T.cardPad }}>

        <Masthead parts={mastheadParts} />

        {/* Hero row: score | identity */}
        <div style={{ display: "flex", gap: 20, marginBottom: 24, alignItems: "center" }}>
          {/* Score column */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", width: scoreColW, paddingRight: 20,
            borderRight: `1px solid ${T.lineSoft}` }}>
            <p style={{ fontFamily: T.mono, fontSize: T.type.eyebrow, fontWeight: 500, letterSpacing: "0.28em",
              textTransform: "uppercase", color: T.paperMute, margin: 0, textAlign: "center" }}>
              {verdictLabel}
            </p>
            <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.score, fontWeight: 500,
              color: T.gold, margin: "6px 0 0", lineHeight: 1 }}>
              {p.overallRating != null ? score : "—"}
            </p>
            <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.caption, fontWeight: 500,
              color: T.foreground, margin: "6px 0 0" }}>
              {grade}
            </p>
          </div>

          {/* Identity column — brand/series allowed to wrap (no nowrap) */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center",
            alignItems: "center", flex: 1 }}>
            {p.cigar?.brand && (
              <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.identity, fontWeight: 500,
                color: T.gold, margin: 0, lineHeight: 1.1, textAlign: "center" }}>
                {p.cigar.brand}
              </p>
            )}
            <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.identity, fontWeight: 600,
              color: T.foreground, margin: "6px 0 0", lineHeight: 1.1, textAlign: "center" }}>
              {p.cigar?.series ?? p.cigar?.format ?? "Unknown Cigar"}
            </p>
            {p.cigar?.format && p.cigar?.series && (
              <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.caption,
                color: T.paperMute, margin: "6px 0 0", textAlign: "center" }}>
                {p.cigar.format}
              </p>
            )}
          </div>
        </div>

        {/* Sub-ratings strip */}
        <div style={{ display: "flex", gap: 10 }}>
          <SubRatingCell label="Draw"   val={p.drawRating         ?? 0} rowKey="draw" />
          <SubRatingCell label="Burn"   val={p.burnRating         ?? 0} rowKey="burn" />
          <SubRatingCell label="Build"  val={p.constructionRating ?? 0} rowKey="build" />
          <SubRatingCell label="Flavor" val={p.flavorRating       ?? 0} rowKey="flavor" />
        </div>

        <PhotoStrip uris={p.photoDataUris.slice(0, 3)} />

        <Footer />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit --pretty false`
Expected: no errors referencing `page1.tsx`.

- [ ] **Step 3: Render + verify**

Run: `npx tsx scripts/render-share-sample.ts`
Expected: `OK /tmp/share-p1-sparse.png 1080x1080` and `OK /tmp/share-p1-photos.png 1080x1080`.
Open both PNGs: text is large/legible, nothing clipped, photos fit within the square. If page-1 content overflows (gets scaled down noticeably), reduce `PHOTO_BAND_H` in `tokens.ts` (e.g. 320) and re-run. These are the visual tuning knobs.

- [ ] **Step 4: Commit**

```bash
git add lib/share-image/page1.tsx
git commit -m "feat(share-image): page 1 legible type scale + square photo band"
```

---

## Task 6: Restyle `page2.tsx` (type scale, clamp prose)

**Files:**
- Modify: `lib/share-image/page2.tsx`

- [ ] **Step 1: Replace the file**

Replace the entire contents of `lib/share-image/page2.tsx` with:

```tsx
import React from "react";
import { T } from "./tokens";
import { clampText } from "./helpers";
import type { ShareImageProps } from "./types";

/* Char clamps tuned to keep a dense report inside the square at the new
   type scale. If a dense sample still gets scaled down by the square step,
   lower these (and re-run the sample script). */
const REVIEW_MAX_CHARS = 320;
const THIRD_MAX_CHARS  = 180;

function Masthead({ parts }: { parts: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", marginBottom: 24 }}>
      <div style={{ height: 1, background: T.line, width: "100%" }} />
      <div style={{ display: "flex", justifyContent: "center", width: "100%", padding: "8px 0" }}>
        <p style={{ fontFamily: T.mono, fontSize: T.type.meta, fontWeight: 500, letterSpacing: "0.32em",
          textTransform: "uppercase", color: T.paperMute, margin: 0 }}>
          {parts.join(" · ")}
        </p>
      </div>
      <div style={{ height: 1, background: T.line, width: "100%" }} />
    </div>
  );
}

function Footer() {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", marginTop: 24 }}>
      <div style={{ height: 1, background: T.line, width: "100%" }} />
      <div style={{ display: "flex", justifyContent: "center", width: "100%", padding: "10px 0" }}>
        <p style={{ fontFamily: T.mono, fontSize: T.type.eyebrow, fontWeight: 500, letterSpacing: "0.32em",
          textTransform: "uppercase", color: T.goldFooter, margin: 0 }}>
          ASH & EMBER · WWW.ASHEMBER.VIP
        </p>
      </div>
    </div>
  );
}

export function buildPage2(p: ShareImageProps): React.ReactElement {
  const firstName = (p.displayName?.trim().split(/\s+/)[0] ?? "").toUpperCase() || null;
  const cityUpper = p.city?.trim().toUpperCase() || null;

  const smokedDate = new Date(
    p.smokedAt.length === 10 ? p.smokedAt + "T00:00:00" : p.smokedAt
  );
  const mastheadDate = smokedDate
    .toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" })
    .toUpperCase()
    .replace(",", "");
  const mastheadParts = [
    "Burn Report",
    p.reportNumber != null ? `No. ${p.reportNumber}` : null,
    mastheadDate,
  ].filter(Boolean) as string[];

  const anyThird =
    p.thirdsEnabled &&
    (p.thirdBeginning?.trim() || p.thirdMiddle?.trim() || p.thirdEnd?.trim());
  const review = clampText(p.reviewText, REVIEW_MAX_CHARS);

  const THIRD_DEFS: Array<{ label: string; text: string | null; idx: 1 | 2 | 3 }> = [
    { label: "FIRST THIRD · BEGINNING", text: p.thirdBeginning, idx: 1 },
    { label: "SECOND THIRD · MIDDLE",   text: p.thirdMiddle,    idx: 2 },
    { label: "FINAL THIRD · END",       text: p.thirdEnd,       idx: 3 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", width: T.IMAGE_WIDTH,
      backgroundColor: T.background, padding: T.outerPad }}>
      <div style={{ display: "flex", flexDirection: "column", backgroundColor: T.card,
        border: `1px solid ${T.line}`, borderRadius: 4, padding: T.cardPad }}>

        <Masthead parts={mastheadParts} />

        {/* Thirds */}
        {anyThird && (
          <div style={{ display: "flex", flexDirection: "column", marginBottom: 24,
            paddingBottom: 24, borderBottom: `1px dashed ${T.lineSoft}` }}>
            {THIRD_DEFS.map(({ label, text, idx }) => {
              const t         = clampText(text, THIRD_MAX_CHARS);
              const chipNames = p.thirdsTaggedRows.find((r) => r.index === idx)?.flavor_tag_names ?? [];
              return (
                <div key={label} style={{ display: "flex", flexDirection: "column", marginBottom: 18 }}>
                  <p style={{ fontFamily: T.mono, fontSize: T.type.eyebrow, fontWeight: 500, letterSpacing: "0.28em",
                    textTransform: "uppercase", color: T.gold, margin: 0 }}>
                    {label}
                  </p>
                  <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.prose, lineHeight: 1.4,
                    color: t ? T.foreground : T.paperDim, margin: "6px 0 0" }}>
                    {t || "—"}
                  </p>
                  {chipNames.length > 0 && (
                    <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.chip,
                      lineHeight: 1.5, color: T.paperMute, margin: "6px 0 0" }}>
                      {chipNames.map((name, i) => (
                        <React.Fragment key={name}>
                          {name.toLowerCase()}
                          {i < chipNames.length - 1 && (
                            <> <span style={{ color: T.gold }}> · </span> </>
                          )}
                        </React.Fragment>
                      ))}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pull quote */}
        {review && (
          <div style={{ display: "flex", flexDirection: "column", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <span style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.quote, fontWeight: 500,
                lineHeight: 1, color: T.gold, opacity: 0.85, marginTop: -10, flexShrink: 0 }}>
                &ldquo;
              </span>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingTop: 12 }}>
                <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.body, lineHeight: 1.5,
                  color: T.foreground, margin: 0 }}>
                  {review}
                </p>
                {(firstName || cityUpper) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
                    <div style={{ width: 28, height: 1, background: T.goldDeep, flexShrink: 0 }} />
                    <p style={{ fontFamily: T.mono, fontSize: T.type.meta, fontWeight: 500,
                      letterSpacing: "0.22em", textTransform: "uppercase", color: T.paperMute, margin: 0 }}>
                      {[firstName, cityUpper].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tasting Notes */}
        {p.flavorTagNames.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 28, height: 1, background: T.goldDeep, flexShrink: 0 }} />
              <p style={{ fontFamily: T.mono, fontSize: T.type.eyebrow, fontWeight: 500, letterSpacing: "0.28em",
                textTransform: "uppercase", color: T.gold, margin: 0 }}>
                TASTING NOTES
              </p>
              <div style={{ width: 28, height: 1, background: T.goldDeep, flexShrink: 0 }} />
            </div>
            <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.prose, lineHeight: 1.5,
              color: T.paperMute, textAlign: "center", margin: "10px 0 0" }}>
              {p.flavorTagNames.map((name, i) => (
                <React.Fragment key={name}>
                  {name.toLowerCase()}
                  {i < p.flavorTagNames.length - 1 && (
                    <> <span style={{ color: T.gold }}> · </span> </>
                  )}
                </React.Fragment>
              ))}
            </p>
          </div>
        )}

        {/* Spec strip */}
        <div style={{ display: "flex", gap: 10, paddingTop: 22, borderTop: `1px solid ${T.lineSoft}` }}>
          {([
            ["DURATION", p.smokeDurationMinutes != null ? `${p.smokeDurationMinutes} min` : "—"],
            ["PAIRING",  p.pairingDrink?.trim() || "—"],
            ["OCCASION", p.occasion?.trim()     || "—"],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label} style={{ display: "flex", flexDirection: "column",
              alignItems: "center", flex: 1 }}>
              <p style={{ fontFamily: T.mono, fontSize: T.type.eyebrow, fontWeight: 500, letterSpacing: "0.22em",
                textTransform: "uppercase", color: T.paperMute, margin: 0 }}>
                {label}
              </p>
              <p style={{ fontFamily: T.serif, fontStyle: "italic", fontSize: T.type.body, fontWeight: 500,
                color: T.foreground, margin: "6px 0 0", lineHeight: 1.2 }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        <Footer />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit --pretty false`
Expected: no errors referencing `page2.tsx`.

- [ ] **Step 3: Render + verify**

Run: `npx tsx scripts/render-share-sample.ts`
Expected: `OK /tmp/share-p2-dense.png 1080x1080`.
Open `/tmp/share-p2-dense.png`: text is large/legible; the dense report (3 thirds + long review + tasting notes) fits the square without being noticeably shrunk. If it looks scaled-down, lower `REVIEW_MAX_CHARS` / `THIRD_MAX_CHARS` in `page2.tsx` (e.g. 240 / 140) and re-run.

- [ ] **Step 4: Commit**

```bash
git add lib/share-image/page2.tsx
git commit -m "feat(share-image): page 2 legible type scale + clamped prose"
```

---

## Task 7: Route uses `renderSquarePng`

**Files:**
- Modify: `app/api/burn-report/[id]/share-image/route.ts`

- [ ] **Step 1: Add the import**

In `app/api/burn-report/[id]/share-image/route.ts`, add to the import block (near the other `@/lib/share-image/*` imports):

```ts
import { renderSquarePng }              from "@/lib/share-image/render";
```

- [ ] **Step 2: Replace the inline Sharp pipeline**

Find the block that starts at the comment `// 12. Convert SVG → PNG, then trim.` and runs through the `console.log(...)` line (the `svgTagEnd` / `svgFor2x` / three `sharp(...)` passes). Replace that entire block — from the `// 12.` comment down to and including the `console.log` line — with:

```ts
  // 12. Rasterize the SVG to a fixed 1080×1080 PNG (square for Instagram).
  const { data: pngBuf, width, height } = await renderSquarePng(svg);
  console.log(`[share-image] page=${page} out=${width}x${height}`);
```

Leave the `satori(...)` call (step 11) and the final `return new NextResponse(new Uint8Array(pngBuf), {...})` unchanged. Remove the now-unused `import sharp from "sharp";` line if nothing else in the file uses `sharp` (check with the type-check in the next step; if it errors on an unused import, remove that line).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit --pretty false`
Expected: no errors. (If `sharp` import is now unused and lint/tsc flags it, delete the `import sharp from "sharp";` line.)

- [ ] **Step 4: Commit**

```bash
git add app/api/burn-report/[id]/share-image/route.ts
git commit -m "refactor(share-image): route renders via renderSquarePng (1080x1080)"
```

---

## Task 8: Full verification

- [ ] **Step 1: Unit suite**

Run: `npm run test:unit`
Expected: all pass, including new `clampText` and `tokens` tests.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds, no type errors.

- [ ] **Step 3: Final sample render**

Run: `npx tsx scripts/render-share-sample.ts`
Expected: all three `OK ... 1080x1080`. Open the PNGs one last time and confirm legibility + fit on all three.

- [ ] **Step 4: Manual preview validation (Dave)**

On the preview deploy: share a real report with review text + thirds + photos to Instagram and via iMessage. Confirm both pages are 1080×1080, render correctly in the IG carousel, and the text is readable without zooming.

---

## Self-Review

**Spec coverage:**
- Root cause (small absolute type) → Task 2 centralized 2x scale + Tasks 5/6 apply it. ✓
- Fixed 1080×1080 square → Task 2 (`IMAGE_HEIGHT`), Task 3 (`renderSquarePng` contain-pad), Task 7 (route). ✓
- Keep all content → Tasks 5/6 retain every element. ✓
- Page-1 photos sized to a reserved band → Task 5 `PhotoStrip` + `PHOTO_BAND_H`. ✓
- Brand allowed to wrap → Task 5 (removed `whiteSpace: nowrap`, added `textAlign: center`). ✓
- Page-2 prose clamped → Task 1 (`clampText`) + Task 6 (`REVIEW_MAX_CHARS`/`THIRD_MAX_CHARS`). ✓
- Render pipeline change → Task 3 + Task 7. ✓
- Unit tests (clampText + legibility floor) → Tasks 1, 2. ✓
- Visual verification → Task 4 harness + Tasks 5/6/8 use it. ✓
- Out of scope (share button, data shown, `shouldRenderPage2`) → untouched; clamping uses display copy only, `shouldRenderPage2` still reads raw fields. ✓

**Mechanism deviation from spec:** spec said "drop trim / fixed-height render"; plan keeps trim and squares via Sharp `fit: contain` (never clips, graceful scale-down). Flagged in the header. Same centered-square result.

**Placeholder scan:** none — all code shown in full; tuning knobs (`PHOTO_BAND_H`, clamp chars) are real values with explicit adjust-down instructions, not placeholders.

**Type consistency:** `renderSquarePng(svg: string)` returns `{ data, width, height }` — used identically in the route (Task 7) and the script (Task 4). `clampText(text, maxChars)` signature identical across helper (Task 1), tests (Task 1), and page2 (Task 6). `T.type.*` keys (`eyebrow/meta/caption/chip/body/prose/identity/score/quote/star`) defined in Task 2 and only those keys referenced in Tasks 5/6.
