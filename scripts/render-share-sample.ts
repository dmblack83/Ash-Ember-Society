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
  photoDataUris: [],
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
  await render("share-p1-sparse", buildPage1(sparse));
  await render("share-p1-photos", buildPage1({ ...sparse, photoDataUris: [TINY_PNG, TINY_PNG, TINY_PNG] }));
  await render("share-p2-realistic", buildPage2(realistic));
  await render("share-p2-dense", buildPage2(dense));
}

void main();
