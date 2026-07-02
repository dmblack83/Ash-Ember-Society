# 03 — Conventions

> TL;DR for agents: Tailwind v4 CSS-first — there is NO `tailwind.config.ts`; all design tokens live in `app/globals.css` (`:root` + `@theme inline`). Display font is Cormorant Garamond (NOT Playfair/Inter — that is stale); body/UI is the native system sans stack. No new font families, no em dashes in user-facing copy. Client fetchers throw on error and pair with tuple SWR keys from `lib/data/keys.ts`. `BottomSheet` is the one sheet primitive; heavy sheets are lazy-loaded via `next/dynamic`.

## File organization

- `app/` — App Router. Route groups: `(app)` authenticated, `(auth)` login/signup/reset, `(marketing)` landing. Groups do not appear in URLs.
- `components/<feature>/` — feature folders (`humidor/`, `lounge/`, `cigars/`, `dashboard/`, `account/`, `membership/`, `system/`, `ui/`). `components/system/` = PWA/reliability plumbing; `components/ui/` = shared primitives.
- `lib/` — shared logic, kebab-case filenames. `lib/data/` = all data fetchers + SWR keys. `lib/auth/` = session gate + server-user reader. Types are exported from the lib module that owns them; there is no `types/` barrel (only `types/react-experimental.d.ts`).
- `scripts/` — node/tsx one-offs and CI check scripts.
- Path alias `@/*` → repo root. Always use `@/` for cross-directory imports; `./` for same-folder.
- No Prettier. ESLint 9 flat config (`eslint.config.mjs`), not CI-enforced (63 pre-existing errors on main). TS strict mode on. `app/sw.ts` typechecks under its own `tsconfig.sw.json`.

## Naming

- Components: PascalCase files (`HumidorClient.tsx`). A minority of older `components/ui/` primitives are kebab-case (`toast.tsx`, `view-toggle.tsx`) — new components use PascalCase.
- lib modules: kebab-case. Functions/vars camelCase; types/interfaces PascalCase; module-level constants SCREAMING_SNAKE_CASE.
- SQL identifiers snake_case.
- Client components that own a page's interactivity are suffixed `*Client.tsx`; per-route auth gates are `*Route.tsx` / `*AuthGate.tsx`.
- No generated Supabase types. Declare row interfaces in the consuming file, cast at the Supabase boundary with `as unknown as Foo` (canonical example: `lib/data/humidor-fetchers.ts`).

## Component patterns

### BottomSheet primitive

`components/ui/BottomSheet.tsx` is THE sheet primitive: bottom sheet with drag-to-dismiss + spring physics on mobile, centered modal on `sm+`. Drag loop mutates DOM transform/opacity directly (no per-frame React render); motion uses shared tokens `--ease-spring` / `--dur-sheet`; `prefers-reduced-motion` collapses to instant. Built on it: `components/lounge/NewPostSheet.tsx`, `components/humidor/AddCigarSheet.tsx`, `components/cigars/AddToHumidorSheet.tsx`. New sheets MUST compose BottomSheet, not hand-roll backdrop/scroll-lock.

Mount pattern: always-mounted with an `open` prop. Call sites keep lazy-load semantics via `next/dynamic`:

```ts
const AddCigarSheet = dynamic(
  () => import("@/components/humidor/AddCigarSheet").then((m) => ({ default: m.AddCigarSheet })),
  { ssr: false },
);
```

13+ components lazy-load sheets/scanners/modals this way — keep it that way (bundle gate).

Other shared primitives in `components/ui/`: `PullToRefresh`, `CigarImage`, `AvatarFrame`, `PhotoLightbox`, `IntentLink`, `ScrollCarets`, `skeleton-card`, `view-toggle`, `toast`.

## Design system (dark lounge — do not redefine)

Single dark theme, defined once in `app/globals.css` `:root` (lines 13-114) and mapped to Tailwind utilities via `@theme inline` (lines 129-172). Tailwind v4: **no `tailwind.config.ts` exists**.

Core tokens (verified values):

| Token | Value | Use |
|---|---|---|
| `--background` | `#15110b` | page bg (NOTE: not the older `#1A1210` some docs quote) |
| `--foreground` | `#F5E6D3` | warm cream text |
| `--card` | `#241C17` / `--card-bg` `#241710` | surfaces |
| `--primary` / `--ring` | `#C17817` | amber CTAs |
| `--accent` / `--gold` | `#D4A04A` | premium accents |
| `--ember` | `#E8642C` | active states, notifications |
| `--secondary` / `--border` / `--input` | `#3D2E23` | dark leather chrome |
| `--muted-foreground` | `#A69080` | aged tobacco |
| `--destructive` | `#C44536` | errors |
| `--brass` | `rgb(214,184,118)` | surface chrome only (card borders + top-edge inset) |
| `--paper-mute` / `--paper-dim` | fg at 0.62 / 0.55 alpha | muted text tiers (alphas chosen for WCAG AA — don't lower) |
| `--line` / `--line-strong` / `--line-soft` | gold-tinted hairlines | editorial dividers, distinct from `--border` |
| `--ease-spring` `cubic-bezier(0.32,0.72,0,1)` / `--dur-sheet` `340ms` | sheet motion | every sheet uses these |
| `--side-rail-width` `240px` / `--app-content-left` | desktop side rail offset (0 below `lg`) | fixed elements (headers, toasts) must respect `--app-content-left` |

The inline `<head>` style in `app/layout.tsx` hardcodes `#15110b` as a literal (pre-CSS paint bridge) — if `--background` ever changes, update layout.tsx AND `app/manifest.ts` background_color in the same change.

### Typography

- Display face: **Cormorant Garamond** (600/700), self-hosted via `next/font` in `app/layout.tsx:33-38`, exposed as `--font-cormorant`. Both `--font-serif` AND `--font-playfair` bind to it in globals.css (the Playfair name survives as an alias only).
- Body/UI: native system sans stack (`--font-sans`) — there is NO body webfont. Do not add one.
- `--font-mono`: system mono stack (eyebrow/meta labels).
- **Rule: no new font families.** Map any design handoff fonts onto the existing `--font-serif` / `--font-mono` variables.

### Copy

- **No em dashes in user-facing copy** (UI strings, marketing, blog/news synopses, push, email). Use comma/colon/semicolon/period/parens. Code, comments, internal docs, commit messages are exempt.
- Aesthetic: exclusive cigar lounge — dark, warm, rich. Not generic tech dark mode.

## Data fetching

- **Client reads**: `useSWR(keyFor.x(...), fetcher)`. Keys are tuples built ONLY through `keyFor.*` in `lib/data/keys.ts` (`["humidor-items", userId]`) — never inline strings, never object args (new object per render = new key). Per-user keys embed `userId` so account switches can't serve another user's cache.
- **Client fetchers** live in `lib/data/*-fetchers.ts` / `*-client.ts`, return plain values, and **throw** on Supabase error (`if (error) throw new Error(error.message)`) so SWR's error handling engages.
- **Mutations**: mutate the same tuple key. Cache coherence after writes made outside the list view goes through helpers like `revalidateHumidor()` (`lib/data/humidor-cache.ts`) — pass fresh data with `{ revalidate: false }`, fire-and-forget with `Promise.allSettled`.
- **Server reads**: React `cache()` for per-request dedup (`getProfileLite`, `lib/data/profile.ts`); `unstable_cache` + the anon client (`utils/supabase/anon.ts`) for cross-request TTL caches of public data (`getLatestNews`, `getPopularCigars`, `getCigarById`, forum categories, flavor tags).
- SWR provider defaults (`components/SWRProvider.tsx`): `revalidateOnFocus: false`, `revalidateOnReconnect: true`, `dedupingInterval: 30s`, `keepPreviousData: true`, retry cap 2. `dedupingInterval` is the Supabase-request-volume dial. Override per-call sparingly and document why.
- Persist-eligible key families are the allowlist in `lib/swr-persist.ts` (`PERSIST_FAMILIES`) — adding a new SWR family that should survive cold launch means adding it there with the correct `perUser` flag.

## Error handling and toasts

- Fetchers throw; SWR surfaces `error`. Mutations roll back optimistic state and surface a toast.
- `components/ui/toast.tsx`: fixed, auto-dismiss 3s, amber left border. It sits **above the bottom nav** — `bottom-[calc(72px+env(safe-area-inset-bottom))]` on mobile, `lg:bottom-6` + `left: calc(var(--app-content-left) + 1rem)` to clear the desktop side rail. Any new floating UI must respect both offsets.
- Server-side: `lib/log.ts` with `feature:operation` scopes (`stripe:webhook`, `cron:aging-ready`). Reliability events go through `trackReliability` (`lib/telemetry/reliability.ts`).
- Never silently swallow errors EXCEPT where the file documents fire-and-forget best-effort semantics (telemetry, cache persistence, background revalidation).

## Mobile-first specifics

- **Touch targets**: 44px minimum on interactive elements (`min-h-[44px]` / explicit 44px sizing; bottom-nav links sized accordingly).
- **iOS input zoom**: inputs are forced to `font-size: max(16px, 1rem) !important` in globals.css (~line 280) — iOS zooms on any input under 16px. Viewport also sets `maximumScale: 1` (removed on desktop by `ViewportMeta`).
- **Safe areas**: bottom nav pads `calc(env(safe-area-inset-bottom) + 12px)`; page content pads `pb-[calc(88px+env(safe-area-inset-bottom))]` under the nav; toast offsets above it. Status bar is `black-translucent`.
- `touch-action: manipulation` globally on interactive elements (kills double-tap zoom delay).
- Desktop (`lg+`): bottom nav is replaced by a 240px side rail; fixed elements offset by `--app-content-left`.
- Pull-to-refresh via `components/ui/PullToRefresh.tsx` on list pages.

## Testing conventions

- Unit: Vitest, colocated `__tests__/` dirs under `lib/` (`npm run test:unit` runs `vitest run lib/`). Pure logic is extracted to make this possible (e.g. `resolveSessionGate` is pure + sync specifically to be unit-testable).
- E2E: Playwright in `tests/e2e/` — `smoke.spec.ts` (unauthenticated), `authenticated.spec.ts` + `free-tier-limit.spec.ts` (need `TEST_USER_EMAIL`/`TEST_USER_PASSWORD`; self-skip otherwise). `auth.setup.ts` signs in once and saves storage state. Base URL via `PLAYWRIGHT_BASE_URL` (default localhost:3000).

## Git / PR workflow

- Sync `main` with origin before branching (`git fetch origin main && git merge --ff-only origin/main` on main). Each unit of work = fresh branch off origin/main + new PR. Never push to merged PR branches; never amend/force-push shared branches.
- Conventional commits (`feat:`, `fix:`, `perf:`, ...). One concern per PR.
- Migrations are SQL run manually in the Supabase SQL editor — paste the exact SQL in chat as a copy-paste block plus a verify query (see 02-data-model.md).
