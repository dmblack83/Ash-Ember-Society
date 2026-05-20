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

Use the folder-drop method — it loads this curated system verbatim:

1. Copy this entire `ash-ember/` folder into the Open Design app's
   design-systems directory (inside the installed app's user-data
   folder, e.g. `~/Library/Application Support/...` on macOS).
2. **Rescan** in Settings, then pick **Ash & Ember Society** from the
   top-bar Design system dropdown.

Do NOT use the app's "Import from GitHub" / "Import an existing local
project" feature for this folder. That feature is an auto-extractor: it
scans a whole codebase's CSS and generates a new, normalized design
system. It does not accept a subfolder path, and it would not load this
hand-authored system as written — it would synthesize a generic one.

## Refining existing screens

`reference-screens/` holds snapshots of the live app (HTML + screenshot
per screen). To refine a real screen rather than design from scratch,
drag its `.png` into an Open Design prompt as reference. See
`reference-screens/README.md` for the screen list and how to refresh it.

## Keeping it in sync

The source of truth is the app's `app/globals.css`. If a token there
changes (palette, type scale, radius), mirror the change in `tokens.css`
and `components.html` so generated mockups stay faithful to production.
Re-run `scripts/capture-screens.mjs` after UI changes to refresh
`reference-screens/`.

## Handoff back to implementation

Export mockups as **HTML** (preferred — markup plus inline CSS) or **PNG**.
Both are readable directly. Avoid PDF/PPTX for screen work.
