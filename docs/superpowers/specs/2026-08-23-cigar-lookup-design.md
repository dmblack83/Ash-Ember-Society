# Cigar "Look up" — design spec

Date: 2026-08-23
Status: APPROVED (approach A — simple link-out)

## What

A "Look up" button in the shared cigar details form that opens a Google web
search composed from the fields the user has filled in, so they can find the
specs (wrapper, vitola, etc.) they're missing while entering a cigar manually
or suggesting an edit.

## Where it appears

One implementation in `components/cigars/CigarDetailFields.tsx` — the shared
form rendered by all three consumers, so the button appears in each with no
per-surface work:

- Manual add (`components/humidor/AddCigarSheet.tsx`)
- Wishlist manual add (`components/humidor/WishlistClient.tsx`)
- Suggest an Edit (`components/cigars/SuggestCigarEditSheet.tsx`)

## Behavior

- **URL builder:** `buildCigarLookupUrl(d: CigarDetails): string | null` in
  `lib/cigars/cigar-details.ts`.
  - Returns `null` when `brand` is blank (button hidden/disabled state below).
  - Query terms, in order, skipping blanks: `brand`, `series`, `format`,
    `"{lengthInches}x{ringGauge}"` (only when BOTH are present), `shade`,
    `wrapper`, and the literal word `cigar` (disambiguates short brand names).
  - Countries (wrapper/binder/filler) are excluded — they add noise to spec
    searches, not signal.
  - URL: `https://www.google.com/search?q=` + encoded terms joined by spaces.
- **Button:** ghost-style button with a small external-link glyph, labeled
  "Look up", placed at the top right of the form beside the Brand field's
  label row. Disabled (muted) until `brand` has non-blank text; enabled state
  opens `window.open(url, "_blank", "noopener")`.
- Form state is untouched by the round-trip. On the iOS PWA the link opens in
  the in-app Safari view; the sheet and its fields are exactly as the user
  left them on return. No warning copy needed.
- No analytics, no backend, no new dependencies.

## Copy

Button label: "Look up". No em dashes anywhere (user-facing copy rule).

## Testing

- Unit tests for `buildCigarLookupUrl` in `lib/cigars/__tests__/`:
  brand-only; brand+series; full field set (asserts country exclusion and
  the `6x52` composition); blank brand returns null; length-without-gauge
  omits the dimension term; encoding of spaces/diacritics (e.g. "San Andrés").
- verify-in-app: open manual add on desktop and mobile viewports, confirm
  button renders in all three surfaces and disabled/enabled transition works.
  (Clicking out to google.com is asserted by URL construction in unit tests,
  not by navigating the harness browser off-app.)

## Out of scope (deliberate)

- Auto-filling fields from search results (Google Custom Search API is
  currently 403ing in this project; revisit as a layered upgrade if wanted).
- Source picker (web vs. images vs. cigar databases).
- Any change to catalog search or the band scanner.
