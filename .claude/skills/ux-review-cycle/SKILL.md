---
name: ux-review-cycle
description: Use when Dave asks to evaluate a page or surface for UX improvements, review a screen, or "run it through mockups" — the evaluate → numbered mockups → selective approval → spec cycle used for the humidor, home, and raffle reviews.
---

# UX Review Cycle

The repeatable loop for surface-level UX work in Ash & Ember Society.
Proven shape (2026-08: humidor list + detail, home dashboard, raffle):
evaluate from evidence, propose in numbered mockup sections, let Dave
approve/reject/amend per item, then spec ONLY the approved set.

## Phase 1 — Evaluate from evidence, not memory

1. Read the real code for the surface (page + client components).
2. Capture the LIVE page logged-in via the verify-in-app harness
   (fixture account) — full-page screenshot. Evaluate pixels AND code;
   screenshots surface bugs code-reading misses (e.g. the news
   entity-rendering bug).
3. Verify every claimed gap against code before writing it up. "X is
   never displayed" must be grepped, not assumed.
4. Separate findings into: UX improvements (mockup-worthy) vs plain
   bugs (list them; they get fixed as ordinary fixes, no mockup).

## Phase 2 — Mockups

- Location: `mockups/<topic>/index.html` (+ more pages if large).
  Untracked, stays on disk. Self-contained single-file HTML.
- Conventions (see any existing `mockups/*/index.html`):
  - Lounge palette CSS variables copied from an existing mockup —
    never invent tokens.
  - Studio chrome: centered concept header, numbered
    `NN · Title` section labels in mono caps, phone frames (375px).
  - EVERY section gets a number — Dave references items by number.
  - Per-section `note`/`annot` text carries the behavior rules, edge
    cases, and data sources, not just visuals. The mockup doubles as
    the first draft of the spec.
  - Show real data shapes (actual brands, plausible values, the real
    rating bands/colors).
- Open it for Dave with `open <path>`. Summarize sections in chat with
  the same numbers, including your priority take.

## Phase 3 — Selective approval loop

- Dave replies per item: approve / reject / amend. Expect partial
  verdicts ("1 yes, 2 no, expand 3").
- Amendments are edited into the mockup THE SAME TURN, and the reply
  confirms what changed ("refresh section 03").
- Rejections are recorded with a do-not-repropose note (memory if the
  rejection is durable, e.g. "pager stays", "no collection strip on
  home").
- Whole-feature kills (e.g. raffle, legal risk): write a shelve memory
  capturing every decision made + revival conditions; mockups stay on
  disk. One session spent is the win, not a loss.
- Fatal external constraints (legality, platform policy) are BLOCKING
  questions raised before mockup investment, not annotations alongside
  it (observation #19).

## Phase 4 — Spec and execution

- Spec goes to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`,
  covering ONLY approved items, citing the mockup as the authoritative
  visual reference, and naming the rejected siblings so future sessions
  do not re-propose them.
- Then the standard pipeline: writing-plans → subagent-driven
  development → verify-in-app → PR(s). Split PRs by surface when the
  work spans more than one page.

## Anti-patterns

- Proposing from memory of the app instead of a fresh screenshot+code
  read.
- Un-numbered mockup sections (breaks Dave's reply style).
- Editing the spec to include amended behavior without ALSO updating
  the mockup — they must stay in sync; the mockup is what Dave
  approved.
- Re-proposing anything recorded as rejected.
