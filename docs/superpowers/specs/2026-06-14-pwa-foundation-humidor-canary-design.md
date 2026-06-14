# PWA Foundation Slice — Humidor Canary (design)

**Date:** 2026-06-14
**Status:** Approved (design)
**Parent:** `2026-06-14-pwa-hybrid-architecture-strategy.md` (umbrella)
**Branch:** `feat/pwa-foundation-humidor-canary`

---

## Goal

Build the reusable client-shell plumbing for the authed zone and prove it on one route —
`/humidor` (the list). On success, cold launch / resume / navigation for that route paint
from cache with no server round-trip, and the later slices (Lounge, Discover) inherit the
same pattern.

## Scope

- **In:** the main `/humidor` list route, plus the reusable pieces it needs (client session
  guard/context, client humidor data fetch, cache-first nav caching for static-shell
  routes), and before/after measurement.
- **Out (stay on the current server path, untouched):** `humidor/[id]`, `humidor/wishlist`,
  `humidor/stats`, `humidor/burn-reports`, and every non-humidor route. `proxy.ts` is not
  modified.

## Correction carried from the umbrella

The proxy auth is **already cheap** (local JWKS verify since the jose fix; network only on
hourly refresh). The latency this slice removes is the **server-side RSC render of the route
+ the route's server-side Supabase query** sitting on the critical path before paint — not
auth cost. The authed pages are already shell+island decomposed (Phase-1 perf work), so the
per-route lift is: stop rendering the shell on the server, fetch the island's data on the
client.

## Architecture

### Piece 1 — `AppSessionProvider` (the reusable guard + context)

A client component mounted in `app/(app)/layout.tsx` (already `"use client"`). On mount it
resolves the Supabase session via the existing browser client (`utils/supabase/client.ts`)
and enforces the same gating the proxy does today:

- no session → `redirect to /login?next=<path>`
- session but `onboarding_completed` falsy → `redirect to /onboarding`
- otherwise → provide `{ userId, email, onboardingCompleted }` via React context and render
  children.

It renders **nothing of the authed shell until the check resolves** (a neutral splash/blank,
not the populated shell) so an unauthenticated user with a cached shell never sees authed
chrome before redirect. It subscribes to `onAuthStateChange` to handle sign-out (clear
context, redirect to `/login`).

**Authority rule (resolves the double-guard):** the proxy remains authoritative when online
(it still redirects/401s server-side). `AppSessionProvider` is the guard for the
cache-served path (offline, or shell served from SW cache before any server hit). The two
agree because they read the same gating inputs (session presence + `onboarding_completed`).

Onboarding gating parity is replicated exactly (same fields, same exempt paths logic as
`proxy.ts` §3) and is explicitly tested.

### Piece 2 — `/humidor` becomes a static shell

`app/(app)/humidor/page.tsx` stops calling `getServerUser` and stops rendering the server
data island. It renders the existing static shell skeleton only. With no per-user server
data and no `getServerUser`, the route renders user-agnostic HTML that is safe to cache and
serve to anyone (it contains no PII — data arrives client-side).

`HumidorDataIsland` (server fetch) is removed from the `/humidor` path. Its query moves to
the client (Piece 3).

### Piece 3 — Humidor data via client SWR

`HumidorClient` already accepts `userId` + initial data and already runs SWR with cache
coherence (#503). It is rewired to:

- read `userId` from `AppSessionProvider` context (no longer a server prop),
- fetch its own data client-side via SWR using the existing keys
  `keyFor.humidorItems(userId)` and `keyFor.hasWishlist(userId)`, with a client fetcher that
  runs the same query `HumidorDataIsland` ran (against the browser Supabase client, RLS
  enforced),
- render the skeleton while SWR is pending on first load, fill from cache instantly on
  repeat loads.

The client fetcher lives in `lib/data/humidor-fetchers.ts` (already exists, already used by
`WishlistClient`); add the items + has-wishlist fetchers there if not present so all humidor
client fetches share one module.

### Piece 4 — Service-worker nav caching (mostly already done)

**Finding (2026-06-14, after reading `app/sw.ts`):** navigation requests are *already*
served via `StaleWhileRevalidate` from a `navigations` cache, with an `authPartitionPlugin`
to avoid cross-user HTML leakage (this was the #470 cold-load white-screen fix). So instant
paint-from-cache on cold launch and resume is **already in place** — it is NOT a new benefit
this slice unlocks.

What this slice actually changes at the SW layer is small: once `/humidor`'s shell is
user-agnostic (Piece 2), its cached navigation HTML no longer needs auth partitioning and
its background revalidation becomes a cheap static fetch instead of a per-user server render.
No new navigation handler is required; if anything the change is to let `/humidor` use a
non-partitioned entry. This is a minor optimization, not the source of the win.

**Consequence for the 10s resume:** because the shell already paints from cache, the resume
stall is almost certainly *post-paint* (hydration, `ResumeHandler`, longtasks, a blocking
client init) — which this slice does not touch. This slice is being built for nav/data
cleanliness and a user-agnostic shell, with resume *measured* here and fixed separately.

## Data flow (after)

```
Cold launch / resume / tab tap on /humidor
  → SW serves cached static shell instantly (StaleWhileRevalidate)   [no server wait]
  → AppSessionProvider resolves session (client)                      [redirect if absent]
  → HumidorClient reads userId from context
  → SWR returns cached humidor items instantly, revalidates via
    browser Supabase client (RLS-enforced, proxy still 401s if no token)
```

## Measurement (folded in, no standalone spike)

Instrument `/humidor` for resume-to-interactive and cold-launch paint using the existing
buckets (`perf_interactivity` slow_hydration window, `sw_lifecycle`). Record a baseline on
Dave's device before the change and the same after. This is where the ~10s resume gets
characterized: if it disappears with the cached shell, it was structural; if it persists, it
is a discrete blocker filed as a separate targeted fix — never absorbed into "the migration
fixed it."

## Error handling

- SWR fetch failure → existing humidor error/empty states (unchanged).
- Session resolve failure / expired → `AppSessionProvider` routes to `/login` (same
  destination as the proxy).
- Offline with no cached data → shell + skeleton + existing offline affordance; no crash.

## Security

Unchanged. Every humidor read/write still goes to Supabase with the user's token and is
enforced by RLS. The static shell carries no PII. The proxy still 401s data/RSC/API requests
that lack a valid token, so the cache-served shell cannot expose another user's data.

## Verification

On Dave's phone: cold launch, resume after backgrounding, tab navigation to/from Humidor,
and an add-a-cigar action — confirm instant shell paint, correct data fill, working
redirects when signed out, and onboarding redirect parity. Build + typecheck + unit tests
green. Rollback is a single-route revert.

## Risks

| Risk | De-risk |
|---|---|
| Onboarding/redirect parity drift between client guard and proxy | Replicate the exact `proxy.ts` gating inputs; test signed-out, signed-in-incomplete-onboarding, signed-in-complete. |
| SWR cache coherence regression on humidor (#503) | Reuse the existing keys + coherence logic; verify out-of-list writes still refresh the list. |
| Cached shell served to a signed-out user flashes authed chrome | `AppSessionProvider` renders neutral state until session resolves; never the populated shell. |
| Stale shell after deploy | Existing `StaleBuildNotice` + SW update flow already handle build version; `StaleWhileRevalidate` revalidates the shell in the background. |

## Success criteria

- `/humidor` renders as a user-agnostic static shell; per-user data arrives via client SWR.
- `AppSessionProvider` is a reusable client guard the later slices can adopt unchanged.
- Tab navigation to `/humidor` is client-side; the cached shell needs no auth partition and
  its revalidation is a static fetch (no per-user server render).
- No auth/RLS regression; signed-out and incomplete-onboarding users redirect correctly.
- No humidor data-coherence regression (#503 behavior preserved).
- Resume-to-interactive on `/humidor` is **measured and characterized** before/after. This
  slice is NOT expected to fix the ~10s resume (paint is already cache-served; the stall is
  almost certainly post-paint). If the measurement confirms a post-paint cause, it is filed
  as a separate targeted fix — explicitly NOT claimed as solved here.

## Out-of-scope follow-ups (later slices)

Lounge and Discover reuse `AppSessionProvider` + the static-shell/client-SWR pattern. The
rest of the `humidor/*` subtree migrates after the canary proves out. The **10s resume
diagnosis** is a separate near-term track (the measurement here feeds it). `proxy.ts`
simplification (once most routes are client-shell) is a much later, separate decision.
