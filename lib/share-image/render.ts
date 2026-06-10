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
