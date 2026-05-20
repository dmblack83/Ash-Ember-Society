# Reference screens

Captured snapshots of the live Ash & Ember app, so Open Design can refine
real screens instead of guessing from tokens alone. Each screen has two
files:

- `<screen>.png` — full-page screenshot at mobile width (390px). The
  visual source of truth.
- `<screen>.html` — the rendered DOM (scripts stripped). Structure and
  content reference. It does not load standalone — styles live in the
  app's stylesheet; read it for layout and copy, use the PNG for looks.

## Screens

| File | Route | Notes |
|---|---|---|
| `home` | `/home` | Dashboard — greeting, tonight card, conditions, news, field guide |
| `humidor` | `/humidor` | Empty state (the test account holds no cigars) |
| `lounge` | `/lounge` | Community feed — rules, categories, product feedback |
| `account` | `/account` | Profile, display badge, personal info, settings |

Captured 2026-05-20 from a fresh test account. Two gaps from empty data:

- **humidor** shows the empty state, not a populated collection.
- **cigar-detail** is missing — the `cigar_catalog` table is empty in this
  environment, so there is no catalog detail page to capture.

## Refreshing

Re-run after the app or the seed data changes:

```
npm run dev
CAPTURE_EMAIL=... CAPTURE_PASSWORD=... node scripts/capture-screens.mjs
```

## Using in Open Design

Drag a screen's `.png` (and optionally its `.html`) into a prompt as
reference, then ask Open Design to refine it. It already knows the lounge
tokens from this design system, so refinements stay on-palette.
