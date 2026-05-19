# Coding Conventions

**Analysis Date:** 2026-05-18

## Tooling Baseline

**Formatter:** None. No Prettier config (`.prettierrc*`, `prettier.config.*`) exists in the repo. Formatting is by-hand, but the codebase shows a strongly preferred style (see "Whitespace alignment" below).

**Linter:** ESLint 9 flat config at `eslint.config.mjs`. Composes `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`. Generated SW artefacts (`public/sw.js`, `public/swe-worker-*.js`) are globally ignored. The lint script is `npm run lint`. **CI does NOT enforce lint** — `.github/workflows/ci.yml` runs typecheck only, with a comment explaining that `main` has ~63 pre-existing `@typescript-eslint/no-explicit-any` errors that would block PRs.

**TypeScript:** strict mode on (`tsconfig.json` line 7: `"strict": true`). Path alias `@/*` → repo root. Service-worker source (`app/sw.ts`) is excluded from the main `tsconfig.json` and checked under its own `tsconfig.sw.json` (different `lib`).

## Naming Patterns

**Routes (file paths under `app/`):** kebab-case for multi-word segments. Examples: `app/(app)/humidor/burn-reports/page.tsx`, `app/(auth)/login/page.tsx`, `app/api/stripe/create-checkout-session/route.ts`.

**Route groups:** parenthesised. `(app)` for authenticated, `(auth)` for login/signup, `(marketing)` for the landing page. They do NOT appear in the URL.

**React components:** PascalCase. Two filename styles coexist:
- `PascalCase.tsx` for most components — e.g. `components/humidor/HumidorClient.tsx`, `components/lounge/NewPostSheet.tsx`, `components/ui/RefreshButton.tsx`, `components/membership/PaywallGate.tsx`.
- `kebab-case.tsx` for a smaller set of older UI primitives — e.g. `components/ui/toast.tsx`, `components/ui/view-toggle.tsx`, `components/ui/skeleton-card.tsx`, `components/ui/theme-provider.tsx`, `components/ui/divider.tsx`, `components/ui/strength.tsx`, `components/ui/logo.tsx`, `components/cigar-search.tsx`.

When adding a new component, prefer PascalCase to match the dominant pattern (newer files use it).

**Lib modules:** kebab-case `.ts` files. Examples: `lib/cigar-default-image.ts`, `lib/burn-report-draft.ts`, `lib/offline-outbox.ts`, `lib/data/humidor-fetchers.ts`.

**Functions / variables:** camelCase. Examples: `getServerUser`, `fetchHumidorItems`, `tapHaptic`, `keyFor`, `agingDays`.

**Types / interfaces:** PascalCase. Examples: `ServerUser`, `HumidorItem`, `MembershipProfile`, `LogPayload`, `BurnReportBody`.

**Constants:** SCREAMING_SNAKE_CASE for module-level literal records / arrays. Examples: `SORT_LABELS`, `STAR_LABELS`, `OCCASIONS`, `QUICK_PAIRINGS`, `STEPS`, `SKIPPABLE`, `PUBLIC_PATHS`, `FORWARDED_USER_HEADERS`, `HEADER_H`.

**SQL identifiers:** snake_case. Tables (`humidor_items`, `smoke_logs`, `blog_posts`), columns (`is_wishlist`, `aging_start_date`, `cigar_id`).

**SWR cache keys:** tuple-form, kebab-resource-name. See `lib/data/keys.ts` — `["humidor-items", userId]`, `["lounge-feed", categoryId, page, userId, filter]`. Always built through the `keyFor.*` helpers, never inlined as strings.

**Log scopes:** `feature:operation` or single token. See `lib/log.ts` docstring — `webhook`, `cron:aging-ready`, `stripe:webhook`.

## TypeScript Patterns

**No generated Supabase types.** There is no `lib/types/database.ts` / `database.types.ts`. Row shapes are declared inline as `interface` in the file that consumes them, then cast at the Supabase boundary. See `components/humidor/HumidorClient.tsx` lines 35–57 for the canonical pattern — `Cigar` and `HumidorItem` interfaces define the rows, and `lib/data/humidor-fetchers.ts` casts the `.select()` result.

When adding a new Supabase read, follow the same shape:
```typescript
// 1. Declare the row interface in the client file:
export interface HumidorItem { id: string; quantity: number; /* ... */ }

// 2. In lib/data/<feature>-fetchers.ts, write a typed fetcher:
export async function fetchX(userId: string): Promise<HumidorItem[]> {
  const { data, error } = await supabase.from("...").select("...");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as HumidorItem[];
}
```

**Centralised types live in `lib/`**, not `types/`. `types/` only contains `react-experimental.d.ts`. Shared types are exported from the lib module that owns them (e.g. `MembershipTier` from `lib/stripe.ts`, `MembershipProfile` from `lib/membership.ts`, `ServerUser` from `lib/auth/server-user.ts`).

**Prefer `interface` for object shapes**, `type` for unions / aliases. Examples in `lib/log.ts` (`Level = "error" | "warn" | ...`), `components/humidor/HumidorClient.tsx` (`SortOption` union).

**Cross-boundary casts use `as unknown as Foo`** when Supabase's generated select types are hard to narrow. See `lib/data/humidor-fetchers.ts:27` and the comment block at line 56–59 explaining why.

## Imports

**Always use the `@/` path alias for cross-directory imports** — never relative `../../`. Same-directory imports use `./Foo`.

**Order observed across the codebase:**
1. React / next built-ins (`react`, `next/dynamic`, `next/navigation`, `next/link`, `next/headers`).
2. Third-party (`swr`, `@supabase/ssr`, `framer-motion`, etc.).
3. Internal modules via `@/` alias — utils, lib, components, in that loose order.
4. Same-folder relatives.

**Type-only imports** use `import type { ... } from "..."`. Example: `lib/membership.ts:13`.

**Dynamic imports for heavy client components.** 10+ components lazy-load heavyweight sheets/scanners/modals. The canonical pattern:
```typescript
const AddCigarSheet = dynamic(
  () => import("@/components/humidor/AddCigarSheet").then((m) => ({ default: m.AddCigarSheet })),
  { ssr: false },
);
```
See `components/humidor/HumidorClient.tsx:20-27`. **Always pass `ssr: false`** for sheets/modals — they have no meaningful server render.

## Server / Client Boundary

**Client components are explicit.** First line is `"use client";` (double quotes, semicolon). Roughly 69 component files use it.

**Server components are the default** — pages under `app/(app)/.../page.tsx` are async server components. They read the verified user via `getServerUser()` (`lib/auth/server-user.ts`), NOT `supabase.auth.getUser()`. The proxy (`proxy.ts`) validates the session once per request and forwards `x-ae-user-*` headers; pages just read those.

```typescript
// app/(app)/home/page.tsx pattern:
export default async function HomePage() {
  const user = await getServerUser();
  if (!user) redirect("/login");
  return (/* JSX */);
}
```

**Suspense islands.** Heavy data reads inside server pages are wrapped in `<Suspense fallback={...}>` so the static shell paints first. See `app/(app)/home/page.tsx:48-78` — `MastheadIsland`, `SmokingConditionsIsland`, `AgingIsland`, `NewsIsland`, `LocalShopsIsland` each Suspend independently. Skeleton fallbacks live in sibling `_skeletons.tsx` files (note the leading underscore — Next ignores `_`-prefixed folders for routing).

**Edge runtime is opt-in per route.** Routes that don't need Node APIs declare `export const runtime = "edge";` for faster cold start. Examples: `app/(app)/home/page.tsx:29`, `app/api/burn-report/route.ts:35`.

## Supabase Client Selection

Three clients in `utils/supabase/`. Pick by context:

| Client | File | When to use |
|--------|------|-------------|
| Browser | `utils/supabase/client.ts` (`createClient()`) | Client components reading per-user data with RLS. |
| Server | `utils/supabase/server.ts` (async `createClient()`) | Server components, route handlers, server actions. Honors cookies. |
| Service | `utils/supabase/service.ts` (`createServiceClient()`) | Webhooks, cron jobs, admin routes. Bypasses RLS — NEVER import in a client component. |
| Anon | `utils/supabase/anon.ts` | (server-side anon — see file for use) |

**Auth in route handlers** uses `getServerUser()` from `lib/auth/server-user.ts` for identity, then `createClient()` from `utils/supabase/server.ts` for queries. See `app/api/burn-report/route.ts:63-86`.

**Ownership checks are explicit.** Route handlers re-verify that the resource belongs to the caller before mutating. See `app/api/burn-report/route.ts:88-98` — `humidor_items` row is fetched with `.eq("user_id", user.id)` before the dependent inserts run.

## Error Handling

**Server-side (route handlers, server components):** return `NextResponse.json({ error: "..." }, { status })` for failure cases. Validate body, auth, ownership in that order. See `app/api/burn-report/route.ts:63-98`.

**Client-side:** catch in the handler, store a string in local `error` state, render inline below the offending field. Throwing is reserved for SWR fetchers, where the error propagates into the `useSWR` hook's `error` slot.

**Centralised logger:** `lib/log.ts` exports `log.error / .warn / .info / .debug`. Each call writes structured JSON to console (single-line in prod, pretty in dev), forwards to Sentry Logs, and — for `level==="error"` with a real `Error` instance — captures a Sentry exception with the scope as a tag.

**Adoption is partial.** The wrapper is only imported in `lib/log.ts` itself; all 11+ existing call sites still use raw `console.error("[scope] msg", err)`. The wrapper's docstring (line 41) explicitly says: "Existing console.error sites are NOT migrated by this PR. Use this wrapper in new code." Follow the same rule — new code uses `log.*`, leave existing call sites alone unless adjacent.

**Error boundaries:**
- `app/error.tsx` — root client boundary. Catches errors anywhere in the root layout (auth, marketing).
- `app/(app)/error.tsx` — authenticated-route boundary.
- `app/global-error.tsx` — catches errors thrown from the root layout itself.

All three log to Sentry via `Sentry.captureException(error)` in the useEffect.

## Toast Usage

Single component: `components/ui/toast.tsx`. Self-dismisses after 3s via internal `setTimeout`. The caller owns visibility — keeps `Toast` mounted while a `toastMessage` state is non-null, unmounts when the dismiss callback fires.

**Hard constraints baked into the component (`components/ui/toast.tsx:23-32`):**
- `z-[60]` — sits above the bottom nav.
- `bottom-[calc(72px+env(safe-area-inset-bottom))]` — clears the nav and any iOS home indicator.
- `left: calc(var(--app-content-left) + 1rem)` — respects the desktop side rail at `lg`+.
- Amber-coloured left border (`border-left: 4px solid var(--primary)`).
- Auto-dismisses after exactly 3000ms.

Do NOT add a second toast component. Reuse `Toast`.

## Design-System Token Usage

**Tailwind v4 CSS-first config.** No `tailwind.config.ts`. All tokens live in `app/globals.css` under `:root` and are mapped to Tailwind utility names in the `@theme inline` block (`globals.css:122-157`).

**Surface tokens:**
- `--background: #15110b` (page)
- `--card-bg: #241710` (card surfaces, flat — not a gradient)
- `--card-border: rgba(214, 184, 118, 0.22)` (brass hairline)
- `--card-edge: inset 0 1px 0 rgba(214, 184, 118, 0.06)` (1px top-edge highlight)

**Brand colors:**
- `--primary: #C17817` (amber)
- `--accent / --gold: #D4A04A` (premium gold)
- `--ember: #E8642C` (active states, notifications)
- `--destructive: #C44536`

**Text translucency tiers:** `--paper-mute` (0.62 alpha — meets AAA on background), `--paper-dim` (0.55 — AA). Use these for muted labels; do NOT introduce gray-* utilities.

**Hairlines:** `--line` / `--line-strong` / `--line-soft` for editorial dividers (gold-tinted). Distinct from `--border` which is solid card chrome.

**Fonts:**
- `--font-serif` → Playfair Display (headings, brand voice, editorial titles).
- `--font-sans` → Inter (body, UI).
- `--font-mono` → `ui-monospace, "SF Mono", ...` (eyebrow / meta labels).

Inject via `style={{ fontFamily: "var(--font-serif)" }}` or the `font-serif` Tailwind alias. **Do NOT add new font families** — the rule from user memory: map any handoff font onto the existing tokens.

**Side rail layout token:**
- `--side-rail-width: 240px` (intrinsic width — always defined).
- `--app-content-left: 0px` below `lg`, `var(--side-rail-width)` at `lg`+. Every fixed full-width element (page headers, toasts) must respect this offset.

**Custom utilities** (declared via `@utility` in `globals.css:285-314`): `glass`, `glow-ember`, `glow-gold`, `slide-in-right`, `slide-in-left`, `text-gradient-gold`.

**Component utility classes used inline in JSX:** `card`, `btn btn-primary`, `btn btn-ghost`, `app-container`. Defined elsewhere in `globals.css` (after line 320).

## Mobile-First Hard Rules

**No em dashes ever.** Anywhere in user-visible content or copy. This is a hard product rule from the owner — see `PROJECT_STATE.md` line 195. Plain alternatives: hyphen, comma, colon, period, or a rewritten sentence. Code comments may use em dashes (they're not user-facing).

**16px minimum input font-size.** `globals.css:262-266` enforces `font-size: max(16px, 1rem) !important` on inputs/textareas/selects (excluding hidden/submit/button/checkbox/radio types). Anything smaller triggers iOS Safari auto-zoom on focus. Never override with `text-xs` / `text-sm` on a real input.

**44px minimum touch target.** Buttons that don't go through `.btn` utility classes set `style={{ minHeight: 44 }}` (or `min-h-[44px]`) — 23+ call sites. Example: `app/error.tsx:74` (`<button ... style={{ minHeight: 44 }}>`).

**Touch responsiveness:** `touch-action: manipulation` + `-webkit-tap-highlight-color: transparent` are applied globally to `button`, `[role="button"]`, `a` outside `@layer` blocks so they win the cascade against UA stylesheets (`globals.css:246-251`).

**`overscroll-behavior-y: none` on `body`** to kill iOS rubber-band reload and the grey flash (`globals.css:210`).

**Dynamic viewport height.** Use `dvh` units (or the `app-container` class) when content must track the visible viewport — Android software keyboard otherwise pushes content off-screen. See `globals.css:220-224`.

## Component Composition

**Slide-up sheets / bottom-sheets:** The canonical pattern is in `components/humidor/AddCigarSheet.tsx:248-309`:
- Backdrop: `fixed inset-0 z-40`, `rgba(0,0,0,0.65)`, click-to-dismiss.
- Sheet: `fixed z-50`, mobile = `bottom: 0` with `translateY(0 → 100%)` transition, desktop = centered with `translate(-50%, -50%)`.
- Drag handle on mobile only (10px × 1px pill at top).
- `role="dialog"` + `aria-modal="true"` (24 dialog/modal call sites use these).
- Body-scroll lock: store `scrollY`, `body.style.position = "fixed"`, restore on close. See `components/lounge/NewPostSheet.tsx:59-73` for the cleanest version.
- Escape-key dismissal: call `useEscapeKey(open, onClose)` from `lib/hooks/use-escape-key.ts` — do NOT re-implement the listener.

**Modals via portal:** `createPortal(..., document.body)` from `react-dom`. Used in `NewPostSheet`, `BurnReportModal`, `PostModal`, `FieldGuideModal`.

**PaywallGate:** `components/membership/PaywallGate.tsx`. Server component wrapping gated content. If user's tier ≥ `requiredTier`, renders `children` raw. Otherwise renders children blurred at 25% opacity with a glass overlay + upgrade CTA. Pass `fallback={...}` to swap a custom replacement for the blurred preview.

**Lazy-loaded heavy components.** Sheets, scanners, and full-feature modals are `dynamic(..., { ssr: false })` so their bundle chunks don't ship with the parent route. Threshold: any client component that adds >50KB or is mounted only after interaction. See `components/humidor/HumidorClient.tsx:20-27`.

**Haptics:** Three intent-named helpers in `lib/haptics.ts` — `tapHaptic()` (10ms), `successHaptic()` ([15, 60, 25] pattern), `errorHaptic()` (40ms). Wrap all `navigator.vibrate` calls; iOS is a silent no-op (Apple has no Web haptic API). Call on every interactive primitive — taps, submit success, validation rejects.

**SWR keys + fetchers.** Client data lives in SWR. Keys are built via `keyFor.*` from `lib/data/keys.ts`, fetchers live in `lib/data/<feature>-fetchers.ts`. Mutations call `mutate(key)` with the same tuple to invalidate.

**SWR defaults** (in `components/SWRProvider.tsx`): `revalidateOnFocus: false`, `revalidateOnReconnect: true`, `dedupingInterval: 30_000`, `keepPreviousData: true`. Per-call overrides are allowed but must be documented inline.

## Whitespace Alignment (de facto Prettier replacement)

Heavily aligned multi-line object literals and import destructures. Examples seen repeatedly:

```typescript
const [mounted,        setMounted]        = useState(false);
const [categoryId,     setCategoryId]     = useState(...);
const [feedbackType,   setFeedbackType]   = useState<FeedbackType>(...);
```

```typescript
const FEATURE_TIER: Record<Feature, MembershipTier> = {
  feed_read:          "free",
  wishlist:           "free",
  burn_report:        "free",
  stats:              "free",
  unlimited_humidor:  "member",
  community_posting:  "member",
  advanced_stats:     "premium",
};
```

```typescript
import { createClient }                          from "@/utils/supabase/client";
import { keyFor }                                from "@/lib/data/keys";
```

This is not enforced by tooling — it's a style the maintainer reads for at review time. When editing aligned blocks, preserve alignment. When introducing a new block of 3+ similar lines, align values vertically.

**Quotes:** double quotes (`"..."`) for strings. Template literals only when interpolating.

**Semicolons:** required at statement end.

**Trailing commas:** present in multi-line object/array literals.

## Comments

**File header block comments** in `/* ... */` form across `lib/` and `components/`. Format observed:
```typescript
/* ------------------------------------------------------------------
   <Name>

   <Purpose paragraph>

   <Usage examples or constraints>
   ------------------------------------------------------------------ */
```

The dashed banner is the canonical opener — see `lib/log.ts:3-41`, `lib/haptics.ts:1-22`, `components/ui/toast.tsx:5-7`, `lib/hooks/use-escape-key.ts:1-23`.

**Section markers inside files** use a thinner banner:
```typescript
/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */
```
or `/* ── Auth ─────────────── */` (box-drawing-char form) inside function bodies — see `app/api/burn-report/route.ts:64`.

**Per-line explanations** for non-obvious decisions, almost always paired with "why" not "what". Example: `components/SWRProvider.tsx` lines 11–42 explain every default by its trade-off.

**JSDoc** used selectively on exported helpers — e.g. `lib/auth/server-user.ts:9-22`, `lib/membership.ts:1-11`, `utils/supabase/service.ts:3-10`. Not required everywhere; reserved for things a future caller needs to know.

## Function / Module Design

**Named exports.** Default exports are reserved for Next route files (`page.tsx`, `route.ts`, `layout.tsx`, `error.tsx`) where Next requires them.

**One feature per directory** under `components/` and `lib/data/`. Examples: `components/humidor/`, `components/lounge/`, `lib/data/humidor-fetchers.ts`, `lib/data/lounge-fetchers.ts`.

**No barrel files (`index.ts`)** in component or lib directories. Import each file by its full path.

**Server-side modules export `async` factories.** `createClient()` in `utils/supabase/server.ts` is async because it awaits `cookies()`.

**Constants extracted to module-level `const` records** with `as const` for narrow string-union derivation. See `components/humidor/BurnReport.tsx:24-55` — `STEPS`, `OCCASIONS`, `QUICK_PAIRINGS`, `STAR_LABELS` are all `as const` tuples used both at runtime and as type sources.

## Commit Message Style

Conventional-Commits with scope. Format: `<type>(<scope>): <subject>` followed by `(#<PR-number>)`.

Types observed in `git log`:
- `feat` — new functionality (most common).
- `fix` — bug fix (second most common).
- `perf` — performance work.
- `refactor` — code reshape without behavior change.
- `chore` — content, deps, tooling.
- `docs` — documentation.
- `revert` — undo a prior commit. Format: `Revert "<original subject>" (#<original PR>)`.

Scopes seen: `humidor`, `lounge`, `cold-smoke`, `proxy`, `auth`, `cigar-search`, `ui`, `home`, `sw`, `ios`, `push`, `taxonomy`, `cron`, `burn-report`, `view-transitions`, `images`, `prerender`, `rate-limit`, `dashboard`, `ios-pwa`, `resume`, `content`, `channels`, `likes`, `feedback-loop`.

Subject is lowercase, imperative present tense, no trailing period. Body is rare — most commits are single-line; when bodies exist they explain "why" (see commit `89db9d0`, `8cdc8fe`).

**Hard rule from `CLAUDE.md` engineering principles:** one concern per PR. No "while I'm in there" bundled cleanups. Reverts are valid when a recent change broke something — restore working state first, redesign later.

**No `Co-Authored-By` claude trailer in committed history** — the repo does not use it. Match maintainer style.

## File Organization Within a Component

Observed order in `components/humidor/HumidorClient.tsx`, `components/humidor/BurnReport.tsx`, `components/lounge/NewPostSheet.tsx`:

1. `"use client";` directive (if applicable).
2. External imports.
3. `@/`-aliased imports.
4. Same-folder relative imports.
5. `/* Types */` section — `interface`/`type` declarations.
6. `/* Constants */` section — module-level `const` arrays / records (often `as const`).
7. `/* Helpers */` section — pure functions used by the component.
8. The exported component function.
9. Sub-components used only by this file (often defined inline at bottom).

Each section is separated by the dashed banner described under "Comments".

## Forbidden Patterns

- No new font families. Map handoff fonts onto `--font-serif` / `--font-sans` / `--font-mono`.
- No em dashes in user-facing copy. Code comments are fine.
- No relative imports across folders. Use `@/` alias.
- No `index.ts` barrels in `components/` or `lib/` — adds bundling cost for marginal ergonomic win.
- No client component without `"use client";` as the first non-blank line.
- No direct `supabase.auth.getUser()` in server pages — use `getServerUser()` from `lib/auth/server-user.ts`.
- No second toast component. Reuse `components/ui/toast.tsx`.
- No `gray-*` Tailwind utilities for muted text. Use `var(--paper-mute)` / `var(--paper-dim)`.
- No `text-xs` / `text-sm` on `<input>` / `<textarea>`. iOS will zoom.
- No `tailwind.config.ts`. Tokens are CSS-first in `globals.css`.

---

*Convention analysis: 2026-05-18*
