# Using the Ash & Ember Society design system

This folder is a portable design system in open-design project shape. It
mirrors the live Ash & Ember cigar-lounge PWA so that mockups generated in
Open Design come out in the real espresso/amber lounge palette — ready to
hand back for implementation with no recolor step.

## Files

- `DESIGN.md` — design prose agents read as system-prompt context.
- `tokens.css` — the `:root { … }` block to paste into every artifact.
- `components.html` — a self-contained reference fixture; open it in any
  browser to see the system rendered.
- `manifest.json` — machine-readable project entry.

## Loading it into Open Design

Either:

1. **GitHub import** — point Open Design's design-system GitHub import at
   `dmblack83/Ash-Ember-Society`, path `design-systems/ash-ember`.
2. **Local folder** — copy this `ash-ember/` folder into the Open Design
   app's `design-systems/` directory, then **Rescan** in Settings.

Then pick **Ash & Ember Society** from the top-bar Design system dropdown.

## Keeping it in sync

The source of truth is the app's `app/globals.css`. If a token there
changes (palette, type scale, radius), mirror the change in `tokens.css`
and `components.html` so generated mockups stay faithful to production.

## Handoff back to implementation

Export mockups as **HTML** (preferred — markup plus inline CSS) or **PNG**.
Both are readable directly. Avoid PDF/PPTX for screen work.
