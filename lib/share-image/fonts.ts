import fs   from "fs";
import path from "path";

interface SatoriFont {
  name:   string;
  data:   Buffer;
  weight: number;
  style:  "normal" | "italic";
}

// Fonts are committed to lib/share-image/fonts/ so they are always present
// in the Vercel deployment bundle — node_modules is not reliably available at runtime.
const FONTS_DIR = path.join(process.cwd(), "lib", "share-image", "fonts");

function fontFile(filename: string): Buffer {
  return fs.readFileSync(path.join(FONTS_DIR, filename));
}

let cached: SatoriFont[] | null = null;

export function loadFonts(): SatoriFont[] {
  if (cached) return cached;
  cached = [
    {
      name:   "Cormorant Garamond",
      data:   fontFile("cormorant-garamond-latin-500-normal.woff2"),
      weight: 500,
      style:  "normal",
    },
    {
      name:   "Cormorant Garamond",
      data:   fontFile("cormorant-garamond-latin-500-italic.woff2"),
      weight: 500,
      style:  "italic",
    },
    {
      name:   "JetBrains Mono",
      data:   fontFile("jetbrains-mono-latin-500-normal.woff2"),
      weight: 500,
      style:  "normal",
    },
  ];
  return cached;
}
