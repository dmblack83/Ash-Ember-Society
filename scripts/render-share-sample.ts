/* Dev tool: render the burn-report share cards to /tmp PNGs with mock data
   so layout and legibility can be eyeballed without the full app.

   Run: npx tsx scripts/render-share-sample.ts
   Each output MUST be 1080x1080. Open the PNGs to check legibility/fit. */
import fs from "fs";
import type React from "react";
import satori, { type Font } from "satori";
import sharp from "sharp";
import { loadFonts } from "../lib/share-image/fonts";
import { buildPage1 } from "../lib/share-image/page1";
import { buildPage2 } from "../lib/share-image/page2";
import { renderSquarePng } from "../lib/share-image/render";
import { T } from "../lib/share-image/tokens";
import type { ShareImageProps, SharePhoto } from "../lib/share-image/types";

/* Solid-color test photo at a given aspect ratio, with a white border so
   the image's true edges read against the letterbox backdrop —
   scale-to-fit (no crop) is verifiable by eye. */
async function testPhoto(w: number, h: number, color: string): Promise<SharePhoto> {
  const border = Math.round(Math.min(w, h) * 0.04);
  const buf = await sharp({
    create: { width: w, height: h, channels: 3, background: "#ffffff" },
  })
    .composite([{
      input: await sharp({
        create: { width: w - border * 2, height: h - border * 2, channels: 3, background: color },
      }).png().toBuffer(),
      top: border, left: border,
    }])
    .png()
    .toBuffer();
  return { uri: `data:image/png;base64,${buf.toString("base64")}`, width: w, height: h };
}

const sparse: ShareImageProps = {
  reportNumber: 42,
  smokedAt: "2026-06-09",
  cigar: { brand: "Padrón", series: "1964 Anniversary", format: "Torpedo" },
  overallRating: 92,
  drawRating: 4.5,
  burnRating: 4,
  constructionRating: 4.5,
  flavorRating: 4.75,
  reviewText: null,
  smokeDurationMinutes: 75,
  pairingDrink: "Bourbon",
  occasion: "Evening",
  flavorTagNames: [],
  photos: [],
  thirdsEnabled: false,
  thirdBeginning: null,
  thirdMiddle: null,
  thirdEnd: null,
  thirdsTaggedRows: [],
  displayName: "Dave Black",
  city: "Salt Lake City",
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

/* A realistic content-heavy report: all three thirds with a sentence or two
   each plus a normal overall review — the upper end of what a real user
   writes (not the artificial everything-tripled `dense` case). */
const realistic: ShareImageProps = {
  ...sparse,
  reviewText:
    "One of the best I've had this year. Flawless burn, a cool draw, and a finish that lingered long after I set it down.",
  flavorTagNames: ["cocoa", "espresso", "cedar", "black pepper", "leather"],
  thirdsEnabled: true,
  thirdBeginning: "Opens with bold cocoa and black pepper, a touch of cedar underneath.",
  thirdMiddle: "Settles into espresso and leather as the pepper recedes into the background.",
  thirdEnd: "Finishes long with dried fig and a sweet cedar note that lingers.",
  thirdsTaggedRows: [
    { index: 1, flavor_tag_names: ["cocoa", "pepper"] },
    { index: 2, flavor_tag_names: ["espresso", "leather"] },
    { index: 3, flavor_tag_names: ["fig", "cedar"] },
  ],
};

async function render(name: string, element: React.ReactElement): Promise<void> {
  const svg = await satori(element, {
    width: T.IMAGE_WIDTH,
    height: T.IMAGE_MAX_HEIGHT,
    fonts: loadFonts() as unknown as Font[],
  });
  const { data, width, height } = await renderSquarePng(svg);
  const path = `/tmp/${name}.png`;
  fs.writeFileSync(path, data);
  const ok = width === T.IMAGE_WIDTH && height === T.IMAGE_HEIGHT;
  console.log(`${ok ? "OK " : "BAD"} ${path} ${width}x${height}`);
  if (!ok) process.exitCode = 1;
}

async function main(): Promise<void> {
  const landscape = await testPhoto(1600, 1200, "#8a5a2b"); // 4:3
  const portrait  = await testPhoto(1200, 1600, "#4a6741"); // 3:4
  const pano      = await testPhoto(2400, 1000, "#6b3a3a"); // wide

  await render("share-p1-sparse", buildPage1(sparse));
  await render("share-p1-1photo-landscape", buildPage1({ ...sparse, photos: [landscape] }));
  await render("share-p1-1photo-portrait",  buildPage1({ ...sparse, photos: [portrait] }));
  await render("share-p1-2photos", buildPage1({ ...sparse, photos: [portrait, landscape] }));
  await render("share-p1-3photos", buildPage1({ ...sparse, photos: [landscape, portrait, pano] }));
  await render("share-p1-3photos-nodims", buildPage1({
    ...sparse,
    photos: [landscape, portrait, pano].map((p) => ({ ...p, width: null, height: null })),
  }));
  await render("share-p2-realistic", buildPage2(realistic));
  await render("share-p2-dense", buildPage2(dense));
}

void main();
