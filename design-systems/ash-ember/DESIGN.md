# Ash & Ember Society

> Category: Dark Luxury
> The design system of the Ash & Ember Society cigar-lounge PWA. A warm,
> dark, mobile-first members' club — not a generic tech dark mode. Use
> when the brief calls for premium hospitality, slow ritual, and craft.

## Visual Theme & Atmosphere

An exclusive cigar lounge after dark: leather chairs, aged wood, a single
amber bulb. Warm, rich, and intimate — every surface feels lit from within
rather than printed on a screen.

- The page background is a deep cognac-black carrying a faint radial
  vignette (warmer at 35% from the top, near-black at the edges) — one
  amber bulb across a dark room.
- A near-invisible fractal-noise overlay (opacity ~0.035) gives surfaces a
  tactile leather/wood-grain quality. Never a flat black field.
- Depth comes from warmth and brass hairlines, not from heavy shadow.
- The mood is unhurried and confident. Restraint over ornament.

## Color Palette & Roles

- **Background:** `#15110B` — deep cognac-black, the page
- **Surface:** `#241710` — warm walnut, cards and panels
- **Surface-warm:** `#3D2E23` — dark leather, chips and secondary buttons
- **Foreground:** `#F5E6D3` — warm cream, primary text and headings
- **Foreground-2:** `#D4C3A8` — dimmer cream, secondary text
- **Muted:** `#A69080` — aged tobacco, captions and metadata
- **Meta:** `#8A7E76` — ash, faint labels and timestamps
- **Border:** `rgba(214,184,118,0.22)` — brass hairline, card edges
- **Accent:** `#C17817` — amber ("whiskey held to the light"). Primary
  CTAs, active states, links. One hero accent + one CTA accent per screen.
- **Success:** `#8A9A5F` (moss) · **Warn:** `#D4A04A` (gold) ·
  **Danger:** `#C44536` (dimmed brick)

Brand tokens, core to the identity:
- **Ember `#E8642C`** — notifications, the active bottom-nav indicator,
  "live" cues. The one hot color; use it sparingly.
- **Gold `#D4A04A`** — premium and membership elements, editorial
  hairlines, the gold-gradient CTA.
- **Brass `#D6B876`** — surface chrome only: card borders and the 1px
  top-edge inset highlight.

Never pure black. Never a cool gray — every neutral is warm.

## Typography Rules

- **Display / headings:** `'Inter', system-ui, sans-serif`, weight 600–700,
  tracking `-0.02em`. There is no serif face — Playfair Display was retired
  for readability. Headings carry weight and tight tracking, not a
  different family.
- **Body:** `'Inter', system-ui, sans-serif`, weight 400, line-height 1.65.
- **Eyebrow / meta:** mono stack, 11px, uppercase, letter-spacing ~0.12em,
  color `--meta`. The lounge's "small caps" voice.
- Scale (px): 11 · 13 · 15 · 18 · 24 · 30 · 36 · 48. Body is 15px.
- Inputs render at a minimum of 16px (iOS zoom prevention).

## Component Stylings

- **Buttons:** 12px radius, ~44px min height (touch target). Primary =
  amber fill, white label, hover via +12% brightness. Secondary = leather
  fill with a brass border. Gold = a `#C17817 → #D4A04A → #C17817`
  gradient, reserved for membership/premium CTAs.
- **Cards:** warm walnut fill, 16px radius, a brass hairline border, and a
  1px brass top-edge inset highlight. No drop shadow. Interactive cards
  lift `translateY(-2px)` and step the border brighter on hover.
- **Inputs:** leather fill, 12px radius, brass border, amber focus ring
  (`0 0 0 3px rgba(193,120,23,0.3)`).
- **Badges:** pill shape, 11px. Strength badges (mild/medium/full) and
  membership badges (member/premium) use muted, sophisticated tints —
  never neon.
- **Toasts:** appear ABOVE the bottom nav, with an amber left border.

## Layout Principles

- Mobile-first. The content column stays narrow (~720px max) even on
  desktop — this is a phone app first.
- Fixed bottom navigation (5 tabs, 44px touch targets, safe-area aware).
  The active tab is marked with the ember color.
- A 240px side rail replaces the bottom nav at ≥1024px.
- Vertical rhythm over dividers; let warm spacing separate sections.
- Editorial gold hairlines, not hard borders, between related rows.

## Depth & Elevation

Three levels, shadow used sparingly:
- **Flat:** default surfaces.
- **Ring:** cards — a brass hairline border plus a 1px brass top-edge
  inset (`inset 0 1px 0 rgba(214,184,118,0.06)`). This is the primary
  elevation; it carries warmth without cast shadow.
- **Raised:** true overlays only (toasts, slide-up sheets) —
  `0 10px 30px -5px rgba(0,0,0,0.5)`.

No neumorphism. No glassmorphism beyond the existing subtle smoke blur.

## Do's and Don'ts

- ✅ Keep every neutral warm — tobacco, leather, ash, never gray.
- ✅ One ember moment per screen; let it mean something.
- ✅ Use brass hairlines and warm fills for depth before reaching for shadow.
- ✅ Sentence case for UI copy; reserve title case for brand names.
- ❌ No em dashes in any user-facing copy (a hard brand rule).
- ❌ No pure black `#000` and no cool gray.
- ❌ No serif headings — Inter only.
- ❌ No neon or high-saturation status colors.

## Responsive Behavior

- **Phone < 640px:** single column, 16px gutters, fixed bottom nav.
- **Tablet 640–1023px:** single column, 20px gutters, content centered
  in the 720px column.
- **Desktop ≥ 1024px:** 240px side rail replaces the bottom nav; content
  column stays at 720px max — it does not stretch to fill the viewport.

## Agent Prompt Guide

- This is a members' club, not a SaaS dashboard. Favor warmth, ritual, and
  restraint over density and chrome.
- Do not invent hex values outside this palette. If a request needs one,
  surface a warning comment and use the closest existing token.
- The amber accent and the ember brand color are not interchangeable —
  amber is for CTAs and active states, ember is for notifications and
  "live" signals only.
- When in doubt, make it feel lit from within: warm fill, brass edge,
  generous radius, no hard shadow.
