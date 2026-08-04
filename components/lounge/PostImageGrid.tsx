"use client";

import Image from "next/image";

/* ------------------------------------------------------------------
   PostImageGrid — the lounge post image block.

   1 image:  full card width at natural aspect ratio (the pre-multi-
             image look, unchanged).
   2 images: two equal 4:3 tiles side by side.
   3 images: large square tile left, two stacked tiles right.

   Every tile opens the shared PhotoLightbox via onOpen(index); the
   caller owns the lightbox so it can hand it the full URL list.
   ------------------------------------------------------------------ */

interface Props {
  urls:   string[];
  onOpen: (index: number) => void;
}

const tileButtonStyle: React.CSSProperties = {
  position:    "relative",
  border:      "none",
  padding:     0,
  cursor:      "pointer",
  touchAction: "manipulation",
  overflow:    "hidden",
  borderRadius: 12,
  display:     "block",
};

function Tile({
  url, index, onOpen, sizes, style,
}: { url: string; index: number; onOpen: (i: number) => void; sizes: string; style: React.CSSProperties }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      style={{ ...tileButtonStyle, ...style }}
      aria-label={`View photo ${index + 1}`}
    >
      <Image
        src={url}
        alt=""
        fill
        sizes={sizes}
        quality={78}
        style={{ objectFit: "cover", display: "block" }}
      />
    </button>
  );
}

export function PostImageGrid({ urls, onOpen }: Props) {
  if (urls.length === 0) return null;

  if (urls.length === 1) {
    /* Single image keeps the original full-width natural-ratio look.
       The 1200x900 props only reserve a pre-load aspect ratio;
       height:auto takes the real ratio once loaded. */
    return (
      <button
        type="button"
        onClick={() => onOpen(0)}
        className="mt-3 rounded-xl overflow-hidden block"
        style={{ width: "100%", border: "none", padding: 0, cursor: "pointer", touchAction: "manipulation" }}
        aria-label="View image"
      >
        <Image
          src={urls[0]}
          alt=""
          width={1200}
          height={900}
          sizes="(max-width: 768px) 100vw, 600px"
          quality={78}
          style={{ width: "100%", height: "auto", display: "block" }}
        />
      </button>
    );
  }

  if (urls.length === 2) {
    return (
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {urls.map((url, i) => (
          <Tile
            key={url + i}
            url={url}
            index={i}
            onOpen={onOpen}
            sizes="(max-width: 768px) 50vw, 300px"
            style={{ aspectRatio: "4 / 3", width: "100%" }}
          />
        ))}
      </div>
    );
  }

  /* 3 images: large left tile spanning both rows, two stacked right. */
  return (
    <div
      className="mt-3 grid gap-1.5"
      style={{ gridTemplateColumns: "2fr 1fr", gridTemplateRows: "1fr 1fr", aspectRatio: "3 / 2" }}
    >
      <Tile
        url={urls[0]}
        index={0}
        onOpen={onOpen}
        sizes="(max-width: 768px) 66vw, 400px"
        style={{ gridRow: "1 / span 2", width: "100%", height: "100%" }}
      />
      {urls.slice(1, 3).map((url, i) => (
        <Tile
          key={url + i}
          url={url}
          index={i + 1}
          onOpen={onOpen}
          sizes="(max-width: 768px) 33vw, 200px"
          style={{ width: "100%", height: "100%" }}
        />
      ))}
    </div>
  );
}
