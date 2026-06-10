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
