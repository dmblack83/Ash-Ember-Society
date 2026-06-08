import fs   from "fs";
import path from "path";

interface SatoriFont {
  name:   string;
  data:   Buffer;
  weight: number;
  style:  "normal" | "italic";
}

function fontFile(relPath: string): Buffer {
  return fs.readFileSync(path.join(process.cwd(), "node_modules", relPath));
}

let cached: SatoriFont[] | null = null;

export function loadFonts(): SatoriFont[] {
  if (cached) return cached;
  cached = [
    {
      name:   "Cormorant Garamond",
      data:   fontFile("@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff2"),
      weight: 500,
      style:  "normal",
    },
    {
      name:   "Cormorant Garamond",
      data:   fontFile("@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-italic.woff2"),
      weight: 500,
      style:  "italic",
    },
    {
      name:   "JetBrains Mono",
      data:   fontFile("@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2"),
      weight: 500,
      style:  "normal",
    },
  ];
  return cached;
}
