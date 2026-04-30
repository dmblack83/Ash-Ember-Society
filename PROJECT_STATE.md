# Ash & Ember Society — Project State

> This file is auto-loaded by CLAUDE.md and updated at the end of every session.
> It gives Claude (both Claude Code and Cowork) full project context without needing reminders.
> Last updated: 2026-04-18

---

## What This Project Is

"Ash & Ember Society" — a premium mobile-first web app for cigar enthusiasts. Built by Dave Black (dmblack83@gmail.com). Features: humidor management, smoke/burn log, cigar catalog (4,221 cigars), community lounge/feed, shop directory with map, home dashboard, account management.

---

## Stack

- **Framework:** Next.js App Router (TypeScript) — NOTE: This version has breaking changes, always read `node_modules/next/dist/docs/` before writing Next.js code
- **Database/Auth/Storage:** Supabase (project: qagaiuibtwuhihukghyx.supabase.co)
- **Payments:** Stripe (subscriptions)
- **Maps:** Google Maps API
- **Styling:** Tailwind CSS + custom design system (dark lounge aesthetic)
- **Hosting:** Vercel

---

## Design System (Implemented — Do Not Redefine)

- **Background:** `#1A1210` (near-black espresso)
- **Foreground:** `#F5E6D3` (warm cream)
- **Card:** `#241C17` (dark walnut)
- **Primary:** `#C17817` (amber — whiskey in light)
- **Accent/Gold:** `#D4A04A` (premium elements)
- **Ember:** `#E8642C` (active states, notifications)
- **Secondary:** `#3D2E23` (dark leather)
- **Muted foreground:** `#A69080` (aged tobacco)
- **Fonts:** Playfair Display (serif, headings) + Inter (sans, body)
- **Aesthetic:** Exclusive cigar lounge — dark, warm, rich. NOT a generic tech dark mode.

All design tokens already implemented in `globals.css` and `tailwind.config.ts`. Never redefine them.

---

## Navigation Structure

Bottom nav bar (mobile-first, 44px touch targets, safe-area-inset-bottom aware):

| Tab | Route | Notes |
|-----|-------|-------|
| Humidor | `/humidor` | Primary daily-use feature |
| Lounge | `/lounge` | Community feed |
| Home | `/home` | Dashboard |
| Discover | `/discover/cigars` + `/discover/shops` (two tabs) | Cigar catalog + shop directory |
| Account | `/account` | Profile / Membership / Legal |

Active tab uses `--ember` color indicator. Toast messages appear ABOVE the nav bar.

---

## Database Tables (Supabase)

- **profiles** — user profile, membership_tier (free/member/premium), avatar_url, city, state, experience_level, onboarding_completed
- **cigar_catalog** — 4,221 cigars seeded from cigars_clean.json. Columns: id, brand, series, name, format, ring_gauge, length_inches, wrapper, wrapper_country, usage_count, image_url
- **humidor_items** — user's cigars. Columns: id, user_id, cigar_id, quantity, is_wishlist, purchase_date, price_paid_cents, source, aging_start, notes, created_at
- **smoke_logs** — burn reports. Columns: id, user_id, cigar_id, humidor_item_id, smoked_at, draw_rating, burn_rating, construction_rating, flavor_rating, overall_rating, review_text, smoke_duration_minutes, pairing_drink, created_at
- **shops** — cigar shops with full schema: name, slug, address, lat/lng, hours (JSON), amenities (string array), is_partner, is_founding_partner, discount_member, discount_premium, has_lounge, etc.
- **blog_posts** — supports post_type: 'blog' (full markdown content) and 'news_link' (synopsis + source_url). Columns include: slug, category, synopsis, source_name, source_url, cover_image_url, published_at

---

## Supabase Storage Buckets

- **avatars** — user profile photos (RLS policies in place)
- **cigar-photos** — cigar catalog images (public bucket)

---

## Environment Variables (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL=https://qagaiuibtwuhihukghyx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[set]
SUPABASE_SERVICE_ROLE_KEY=[set]
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=[set]
STRIPE_SECRET_KEY=[set]
STRIPE_WEBHOOK_SECRET=whsec_xxx (placeholder — local dev only)
STRIPE_MEMBER_MONTHLY_PRICE_ID=price_1TPQIvP1shPjr0YS465wU2BG
STRIPE_MEMBER_ANNUAL_PRICE_ID=price_1TGpPmP1shPjr0YSF4gSfaCV
STRIPE_PREMIUM_MONTHLY_PRICE_ID=price_1TPQFZP1shPjr0YSXhR13LJi
STRIPE_PREMIUM_ANNUAL_PRICE_ID=price_1TGpQZP1shPjr0YSmQLQOgvq
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSyAovIoRicBzpuWpIBBFzzCHi3gEuZXPlBI
GOOGLE_API_KEY=AIzaSyD-FTLdHi0mseW30ShexWrBPEEQpBj1QA8 (Ash & Ember Society GCP project — Custom Search, currently 403ing)
GOOGLE_SEARCH_ENGINE_ID=a312c39d533474894
```

Vercel env vars: all set to Production + Preview.

---

## Pages Built

| Route | File | Status |
|-------|------|--------|
| Login | `app/(auth)/login/page.tsx` | Done |
| Signup | `app/(auth)/signup/page.tsx` | Done |
| Onboarding | `app/(app)/onboarding/page.tsx` | Done |
| Home Dashboard | `app/(app)/page.tsx` | Done |
| Humidor | `app/(app)/humidor/page.tsx` | Done |
| Humidor Item Detail | `app/(app)/humidor/[id]/page.tsx` | Done |
| Burn Report | `app/(app)/humidor/[id]/burn-report/page.tsx` | Done |
| Humidor Stats | `app/(app)/humidor/stats/page.tsx` | Done |
| Wishlist | `app/(app)/humidor/wishlist/page.tsx` | Done |
| Discover Cigars | `app/(app)/discover/cigars/page.tsx` | Done |
| Cigar Detail | `app/(app)/discover/cigars/[id]/page.tsx` | Done |
| Discover Shops | `app/(app)/discover/shops/page.tsx` | Done |
| Shop Detail | `app/(app)/discover/shops/[slug]/page.tsx` | Done |
| Lounge | `app/(app)/lounge/page.tsx` | Done |
| Account | `app/(app)/account/page.tsx` | Done (Profile / Membership / Legal tabs) |
| Membership Success | `app/(app)/account/membership/success/page.tsx` | Done |

---

## Dashboard Sections (Home Page)

| Section | Component | Status |
|---------|-----------|--------|
| D.0 Shell + fixed header | `page.tsx` | Done |
| D.1 Welcome / greeting | `WelcomeSection.tsx` | Done |
| D.2 Smoking Conditions | `SmokingConditions.tsx` | Done (Open-Meteo API) |
| D.3 Aging Alerts | `AgingAlerts.tsx` | Done (preset dropdown: Ready Now, 2 Weeks, 1/3/6 months, 1 Year, Custom) |
| D.4 On This Day | — | Skipped for now |
| D.5 Cigar News | `CigarNews.tsx` | Done (blog_posts table, blog + news_link types) |
| D.6 Trending Lounge | `TrendingLounge.tsx` | Done |
| D.7 Shop Spotlight | — | Skipped for now |
| D.8 Member Milestones | — | Skipped for now |

---

## Key Components

- `components/cigar-search.tsx` — `CatalogResult` type (includes `image_url: string | null`), shared select string
- `components/cigars/AddToHumidorSheet.tsx` — slide-up sheet for adding cigars to humidor
- `components/humidor/BurnReport.tsx` — burn report multi-step form
- `components/membership/PaywallGate.tsx` — wraps gated content
- `components/membership/MembershipCard.tsx` — digital card with QR code
- `components/ui/toast.tsx` — toast appears ABOVE nav bar
- `components/ui/view-toggle.tsx` — grid/list toggle for Discover Cigars
- `components/account/AccountClient.tsx` — Profile / Membership / Legal tabs

---

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/seed-cigar-catalog.ts` | Seeds 4,221 cigars from cigars_clean.json |
| `scripts/seed-cigar-images.ts` | Fetches cigar images via Google Custom Search, uploads to cigar-photos bucket |
| `scripts/seed-cigar-default-images.ts` | **DO NOT RUN** — writes SVG paths to image_url; those files don't exist. Default images are handled client-side by `lib/cigar-default-image.ts`. Running this script breaks all default images. |
| `scripts/attach-test-image.ts` | One-off: attaches a single image to first cigar for testing |
| `scripts/seed-cigars.ts` | Original 50-cigar seed (superseded by full catalog) |
| `scripts/seed-shops.ts` | Seeds sample Utah shops |

---

## Cigar Images — Current Status

**Default images:** 5 WebP files in `public/Cigar Default Images/` — Connecticut.webp, Colorado Claro.webp, Colorado.webp, Maduro.webp, Oscuro.webp. Converted from PNG (588 KB → 99 KB total, ~83% smaller).

**Utility function:** `lib/cigar-default-image.ts` — implemented and applied across all cigar image display locations.
- `getCigarDefaultImage(wrapper)` — maps wrapper string to default WebP path via lowercase includes matching
- `getCigarImage(imageUrl, wrapper)` — returns `imageUrl` if set, falls back to default

Applied to:
- `app/(app)/discover/cigars/page.tsx` (grid + list)
- `app/(app)/discover/cigars/[id]/page.tsx`
- `components/cigar-search.tsx`
- `components/cigars/AddToHumidorSheet.tsx`
- `app/(app)/humidor/page.tsx`
- `app/(app)/humidor/[id]/page.tsx`

**No database changes.** `image_url` stays null for cigars without real photos. User-uploaded photos will set `image_url` and automatically take priority. No web image sourcing planned.

**cigar-photos bucket:** Supabase storage bucket exists, reserved for user-uploaded photos.

---

## Known Issues / Decisions

- **No em dashes** anywhere in the app or content — Dave flagged this repeatedly. Use plain alternatives.
- **Mobile zoom on text input** — Fixed with `font-size: 16px` on inputs (prevents iOS auto-zoom).
- **Toast above nav** — Toasts must use z-index above the bottom nav bar.
- **Cigar catalog search** — Shows top 20 by usage_count by default (not blank until user types).
- **Grid view default** — Discover Cigars defaults to grid, preference saved to localStorage.
- **Aging alerts** — Uses preset dropdown instead of date picker. Options: Ready Now, 2 Weeks (default), 1 Month, 3 Months, 6 Months, 1 Year, Custom.
- **Partner shops** — No real partner shops yet. Seed data is placeholder.
- **Blog posts** — 'blog' type opens full markdown in bottom sheet; 'news_link' shows synopsis + "Read Full Article" button. Content managed via SQL inserts in Supabase. CMS is a future phase.

**Blog post SQL format (always use this exact template):**
```sql
INSERT INTO blog_posts (title, type, synopsis, source_name, source_url, cover_image_url, published_at)
VALUES (
  'Headline here',
  'news_link',
  'Synopsis in Dave''s voice — no em dashes, plain language, 3-4 sentences max.',
  'Source Name',
  'https://source-url.com/full-article-path',
  'https://image-url.com/image.jpg',
  now()
);
```
Synopsis style: factual, direct, Dave's voice. No em dashes. End with one sentence of why it matters to the reader.

---

## Membership Tiers

| Tier | Price | Limits |
|------|-------|--------|
| Free | $0 | 25 humidor items, read-only feed |
| Member | $4.99/mo or $50/yr | Unlimited, community posting, shop discounts (10%), events |
| Premium | $9.99/mo or $100/yr | Everything + exclusive events, 15% discount |

---

## How We Work

- **Claude Code** builds the app. Dave runs prompts in Claude Code one at a time.
- **Cowork (this session)** writes the prompts, troubleshoots, manages files and scripts.
- **Prompt format:** Always in a markdown code block so there is a copy button. Never write prompts as plain prose.
- **Commits:** After each working feature: `git add . && git commit -m "description" && git push`
- **Worktree path:** `/Users/dave.black/Documents/the-humidor/.claude/worktrees/modest-edison/`

---

## Pending / Next Steps

1. **Performance refactor (Prompt B series)** — B0 dead code done, B1-B5 prompts written, run in order and test each before next. Also address these PWA-specific issues:
   - Server render more pages (minimize client components)
   - Add service worker via `next-pwa` for offline caching and instant repeat loads
   - Convert cigar default images from PNG to WebP
   - Replace `box-shadow` on scrolling elements with `border` (GPU-friendlier on mobile)
   - Dynamic imports (`next/dynamic`) for heavy components not needed on initial load
   - Cache Supabase queries to avoid re-fetching on every navigation
   - Skeleton screens on data-heavy pages instead of spinners
   - **Auth call consolidation** — every page calls `supabase.auth.getUser()` independently, each making a live network round-trip to Supabase. With 14 pages doing this, a single browsing session generates ~1 auth call per page load. At scale this is wasteful. Fix: add Next.js middleware that validates auth once per request and forwards the verified user via a header; server components read the header instead of calling `getUser()`. Reduces auth calls by ~80% per page load. Observed at 2,228 auth requests/24hrs with 1 active user.
2. **Home route fix** — Move `app/(app)/page.tsx` to `app/(app)/home/page.tsx`, update all redirects to `/home`
3. **Humidor fixed header** — Fixed header: tabs row + title/button row + sort/view toggle row
4. **Prompt 6.2** — Responsive polish and performance pass
5. **Prompt 6.3** — Landing page and SEO
6. **Dashboard skipped sections** — D.4 On This Day, D.7 Shop Spotlight, D.8 Member Milestones (deferred)
7. **Staging environment** — Separate Supabase project + Vercel preview env for safe testing before production
