#!/usr/bin/env python3
"""
Generate iOS launch (splash) images for apple-touch-startup-image.

Why this exists
---------------
iOS PWAs added to the Home Screen show a launch image in the window
between icon-tap and the first HTML paint. Without one, iOS shows
the manifest background_color briefly, then falls back to a default
white screen until our HTML/CSS paints. That's the multi-second
white-screen gap users see when re-opening the PWA after iOS has
killed the WebView.

Each splash is the brand dark background (#15110b) with the Circle
Logo centered. Sized to ~38% of the shorter device dimension so it
reads at a glance without dominating. iOS requires exact device
resolutions; mismatches fall back to white.

Inputs
------
public/Circle Logo.png — source logo (rgba transparency preserved).

Output
------
public/appstore-images/ios-splash/{width}x{height}.png — one per
device resolution listed in SIZES.

Run
---
python3 scripts/generate-ios-splash.py
"""

from PIL import Image
import os

# Brand background — must match manifest.background_color and the
# inline <head> style in app/layout.tsx. Keep these in sync.
BG_COLOR = (21, 17, 11)  # #15110b

# Device resolutions iOS expects. Each entry is (width_px, height_px)
# at the device's native pixel ratio. Portrait only — landscape pairs
# are added as (height, width) by the meta-tag emitter.
#
# Source of dimensions:
#   https://developer.apple.com/design/human-interface-guidelines/foundations/layout
#   https://www.iosfontsizes.com/
# Cross-referenced against PWA splash guides.
SIZES = [
    # iPhone 15 Pro Max, 14 Pro Max
    (1290, 2796),
    # iPhone 15 Pro, 14 Pro
    (1179, 2556),
    # iPhone 14 Plus
    (1284, 2778),
    # iPhone 14, 13, 13 Pro, 12, 12 Pro
    (1170, 2532),
    # iPhone 13 mini, 12 mini, 11 Pro, XS, X
    (1125, 2436),
    # iPhone 11 Pro Max, XS Max
    (1242, 2688),
    # iPhone 11, XR
    (828, 1792),
    # iPhone 8 Plus, 7 Plus, 6S Plus
    (1242, 2208),
    # iPhone 8, 7, 6S, 6, SE (2nd/3rd gen)
    (750, 1334),
    # iPhone SE (1st gen), 5S, 5
    (640, 1136),
    # iPad Pro 12.9"
    (2048, 2732),
    # iPad Pro 11"
    (1668, 2388),
    # iPad Air 10.9"
    (1640, 2360),
    # iPad 10.2"
    (1620, 2160),
    # iPad mini
    (1488, 2266),
    # iPad 9.7", iPad mini (older)
    (1536, 2048),
]

ROOT       = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LOGO_PATH  = os.path.join(ROOT, "public", "Circle Logo.png")
OUTPUT_DIR = os.path.join(ROOT, "public", "appstore-images", "ios-splash")

# Logo target size as a fraction of the SHORTER device dimension.
# 0.38 reads as a brand mark without feeling oversized on tablets or
# undersized on small phones.
LOGO_FRACTION = 0.38


def make_splash(logo: Image.Image, width: int, height: int) -> Image.Image:
    """Composite the logo centered on a solid-color canvas."""
    canvas = Image.new("RGB", (width, height), BG_COLOR)

    # Scale the logo to fraction of the shorter side, preserving aspect.
    target = int(min(width, height) * LOGO_FRACTION)
    scale  = target / max(logo.size)
    new_w  = int(logo.size[0] * scale)
    new_h  = int(logo.size[1] * scale)
    resized = logo.resize((new_w, new_h), Image.LANCZOS)

    # Center.
    x = (width  - new_w) // 2
    y = (height - new_h) // 2

    # Paste with alpha mask so transparency around the logo doesn't
    # overwrite the canvas with black.
    if resized.mode == "RGBA":
        canvas.paste(resized, (x, y), resized)
    else:
        canvas.paste(resized, (x, y))

    return canvas


def main() -> None:
    if not os.path.exists(LOGO_PATH):
        raise SystemExit(f"Logo not found: {LOGO_PATH}")

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    logo = Image.open(LOGO_PATH).convert("RGBA")

    for (w, h) in SIZES:
        out = os.path.join(OUTPUT_DIR, f"{w}x{h}.png")
        make_splash(logo, w, h).save(out, "PNG", optimize=True)
        print(f"wrote {os.path.relpath(out, ROOT)}")


if __name__ == "__main__":
    main()
