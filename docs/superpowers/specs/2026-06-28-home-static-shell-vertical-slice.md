# /home Static Shell + Client Auth — Vertical Slice Spec

> First slice of the app-shell rearchitecture. Goal: prove the "static shell +
> client-side auth + client-side data" model end-to-end on the `/home` route, so
> cold launch paints instantly with zero network/auth on the critical path. Once
> proven here, the same pattern rolls out route by route. Written 2026-06-28.
> Parent direction: docs/superpowers/specs/2026-06-28-pwa-strategy-rhyme-audit.md

---

## 1. Why this slice

Production cold launch on `/home` was ~30s to usable. Vercel telemetry (2026-06-28)
showed the **server is healthy** (822/900 requests 200, no errors, zero
`getUser exceeded` warnings) — the time is the **client cold path**: the proxy gates
the document on auth before any HTML ships, and nothing paints until the network +
auth resolve. The fix is to remove auth from the first-paint path: ship a static,
data-free shell instantly, then do auth + data on the client.

We prove it on `/home` first because it's the cold-launch entry and the screen with
the worst reported symptom. Success here validates the model before migrating the
other ~40 routes.

## 2. The good news — most of it already exists

Ground truth from the codebase (do not rebuild these):

- **The shell is already client + auth-free.** `app/(app)/layout.tsx` is `"use client"`,
  renders the nav chrome (`BottomNav`, `SideRailNav`) + system components, and calls
  **no** server auth.
- **Client session management exists.** `components/system/app-session.tsx`
  (`AppSessionProvider`, mounted in the app layout) runs `supabase.auth.getSession()` +
  `onAuthStateChange` and exposes `useAppSession() → { ready, session }`. It is currently
  **non-blocking** (does not redirect).
- **Client-data plumbing exists.** `components/SWRProvider.tsx` (mounted in root
  `app/layout.tsx`), `lib/data/keys.ts` (`keyFor`), `utils/supabase/client.ts`
  (browser client), and fetchers in `lib/data/` (humidor, cigar, lounge, notifications).
- **One home island is already the target model.** `NotificationsIsland` fetches
  client-side via SWR + the `auth.uid()`-scoped RPC `get_notification_summary()`
  (`lib/data/notifications.ts`, `components/dashboard/Notifications.tsx`). We copy this
  pattern for the others.
- **The WHOLE static-shell pattern already exists and is tested for `/humidor`.** This
  slice applies it to `/home`. Reuse, do not reinvent:
  - `lib/auth/session-gate.ts` — `resolveSessionGate({ hasSession, onboardingCompleted, pathname })
    → "login" | "onboarding" | "allow"`, a pure function with unit tests in
    `lib/auth/__tests__/session-gate.test.ts`.
  - `app/(app)/humidor/page.tsx` — `export default function HumidorPage() { return <HumidorRoute />; }`
    (static shell, no `getServerUser`, no server data).
  - `app/(app)/humidor/HumidorRoute.tsx` — `"use client"`; reads `useAppSession()`, applies
    `resolveSessionGate`, `router.replace`s to `/login?next=` or `/onboarding`, and renders a
    neutral skeleton until `ready && gate === "allow"`.
  - `onboardingCompleted` comes from the **session** (`AppSession.onboardingCompleted`,
    derived from `user_metadata.onboarding_completed`) — NO profile fetch needed for the gate.

## 3. Current → target

**Current** (`app/(app)/home/page.tsx`): server component, calls `getServerUser()`
(reads `x-ae-*` proxy headers), redirects to `/login` if null, renders server islands
inside `<Suspense>` that `await` data (`getProfileLite`, a direct `humidor_items` query,
`getLatestNews`). The proxy server-gates the whole document.

**Target:** `page.tsx` becomes an **auth-free** server component (no `getServerUser`, no
top-level `await`, no user-data server reads) that lays out the client islands. **The proxy
is unchanged** — it still gates `/home`, but its auth check is the fast local-JWKS path
(telemetry confirmed it is not the bottleneck), and once the page is a user-agnostic static
shell the SW can also serve it instantly from cache. A client gate (`resolveSessionGate`,
exactly as `/humidor` uses) handles redirect after mount. The user-data islands fetch
client-side via SWR, showing their existing skeletons. The one remaining server island is
**News** (public data) — it streams independently inside its Suspense boundary and never
blocks first paint.

## 4. The five parts

### 4.1 Shell — no change
`app/(app)/layout.tsx` already paints nav + system chrome with no server auth. It SSRs
its initial HTML (data-free) and is interactive on the client. Nothing to build here
beyond letting the document through (4.2).

### 4.2 No proxy change (corrected — mirror `/humidor`)
`/humidor` proves the static shell needs **no** proxy change. The proxy keeps gating
`/home` (unauth HTML nav → `/login`, fast local-JWKS check for authed users — not the
bottleneck). The instant paint comes entirely from `page.tsx` being a user-agnostic static
shell with **no server-data dependency**, which the SW can also cache and serve instantly.
Do **not** add a `CLIENT_AUTH_PATHS` allowlist or otherwise un-gate `/home`. `proxy.ts` is
untouched in this slice.

### 4.3 Client auth gate — reuse `resolveSessionGate` (the `/humidor` pattern)
Add a small `"use client"` guard for `/home` that mirrors `HumidorRoute.tsx`. It reads
`useAppSession()` and applies the existing, tested `resolveSessionGate`:

```tsx
const { ready, session } = useAppSession();
const gate = resolveSessionGate({
  hasSession:          session !== null,
  onboardingCompleted: session?.onboardingCompleted ?? false,  // from session, NOT a profile fetch
  pathname,
});
useEffect(() => {
  if (!ready) return;
  if (gate === "login")       router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  else if (gate === "onboarding") router.replace("/onboarding");
}, [ready, gate, pathname, router]);
```

Because News stays a server island interleaved with the client content (4.6), the home
guard renders `null` (a `HomeAuthGate` mounted in `page.tsx`) rather than wrapping a single
subtree like `HumidorRoute` does — the user-data islands each show their own skeleton until
`ready && session`. Behavior:
- **Returning logged-in user (the 30s case):** session in localStorage → no redirect, no
  flash; shell paints, data streams in.
- **Logged-out visitor:** proxy already redirects to `/login` before render; the client
  guard is the second line for client-side session edge cases. Accepted (Dave, 2026-06-28).
- **Expired token:** `AppSession.toAppSession` already treats an expired token as no
  session → gate returns `"login"` → redirect. (This logic already exists.)

The guard never blocks first paint — its redirect runs in an effect after mount.

### 4.4 Flip the four server islands to client SWR
Convert each from a server island (`app/(app)/home/_islands.tsx`) to a client component
that fetches via the browser Supabase client + SWR, mirroring `NotificationsIsland`. Each
keeps its existing skeleton from `app/(app)/home/_skeletons.tsx` as the SWR loading state.

| Island | Current server read | Target client fetch | SWR key | RLS dependency |
|---|---|---|---|---|
| Masthead | `getProfileLite(userId)` | new `fetchProfileLite()` (browser client), add `onboarding_completed` | `keyFor.profile(userId)` | `profiles` SELECT `auth.uid() = id` |
| SmokingConditions | server profile zip → client weather | reuse client profile SWR for zip, keep existing `/api/weather` client call | `keyFor.profile(userId)` | same `profiles` policy |
| Aging | direct `humidor_items` server query | new `fetchAgingItems()` (browser client): `humidor_items` join `cigar_catalog`, `is_wishlist=false`, aging window 31 days | new `keyFor.aging(userId)` | `humidor_items` SELECT `auth.uid() = user_id` |
| LocalShops | `getProfileLite(userId)` zip | reuse client profile SWR for zip | `keyFor.profile(userId)` | same `profiles` policy |

`NotificationsIsland` — already client; no change. News — see 4.6.

`getProfileLite` is fetched by three islands; the shared `keyFor.profile(userId)` SWR key
dedups it to one request (SWRProvider `dedupingInterval: 30_000`).

`page.tsx` stays a server component but becomes auth-free: it renders the now-client
user-data islands + `DashboardPager`, `TonightsPairing`, `FieldGuide` (already client) +
the server `<Suspense><NewsIsland /></Suspense>` (unchanged, public). Remove `getServerUser`,
the `/login` redirect, the `userId` props, and the server `<Suspense>` wrappers around the
**user-data** islands (their SWR loading states replace them). Each **client island** reads
the current user id from `useAppSession()` for its own SWR key; `page.tsx` passes no `userId`
and reads no user data.

### 4.5 Security — RLS (ships with this slice, non-negotiable)
Server reads today rely on **explicit `user_id` filtering in server queries**, not RLS.
Moving `profiles` and `humidor_items` reads to the browser client makes **RLS the only
guard**. Before/with the island flips, verify and (if missing) add:

- `profiles`: `SELECT` policy allowing a user to read **only their own row**
  (`auth.uid() = id`). Confirm no policy exposes other rows.
- `humidor_items`: `SELECT` policy `auth.uid() = user_id`.

Deliverables: exact SQL policy statements + a verification query, handed to Dave to run in
the Supabase SQL editor (manual-SQL-as-copy-paste convention). The slice is **not
shippable** until both policies are confirmed present and a cross-user read test returns
zero rows. `forum_posts`/`forum_comments` are already covered (Notifications RPC relies on
it) — re-confirm, don't assume.

### 4.6 News island (public data) — keep server-rendered (Dave, 2026-06-28)
`NewsIsland` reads public `news_items` via `getLatestNews` (anon client, `unstable_cache`,
300s). **Keep it exactly as-is**: a server island inside its `<Suspense fallback={<NewsSkeleton/>}>`
boundary. Because it's public (no auth) and inside a Suspense boundary, the shell + client
islands flush and paint first; News streams in when its cached read resolves. It never blocks
first paint and never touches the auth path, so it's fully compatible with the static-shell
model — and leaving it untouched is the lowest-risk choice. No change to News in this slice.

## 5. Out of scope (this slice)
- Other `(app)` routes — stay server-gated and server-rendered. Migrated later, route by
  route, using the proven pattern.
- The offline outbox, push, cold-smoke overlay, splash — untouched (restored by the revert
  PR #526).
- Any change to the service worker caching strategy beyond what the revert restored.
- A full RLS audit of all tables — only `profiles` + `humidor_items` (this slice's reads)
  are in scope; the broader audit is part of the later auth-decoupling pieces.

## 6. Success criteria
1. **Instant paint:** on `/home`, the shell (nav + skeletons) is visible with no
   dependence on a network/auth round-trip. Verify: throttled cold launch shows the frame
   immediately; data fills in after.
2. **No 30s freeze:** init-to-frame is sub-second on cold return (data may still stream).
3. **Auth correctness:** logged-out → redirected to `/login`; onboarding-incomplete →
   `/onboarding`; logged-in onboarded → home renders with their data.
4. **No data leak:** with RLS in place, the browser client cannot read another user's
   profile or humidor rows (verified by a cross-user query returning zero rows).
5. **Parity:** every home section shows the same data it did before, just fetched client-side.
6. **Other routes unaffected:** the rest of the app still works (still server-gated).

## 7. Risks + rollback
- **Risk: RLS gap → data exposure.** Mitigation: RLS verification is a hard gate (5);
  ship nothing until the cross-user read test passes. This is the highest-stakes part.
- **Risk: client auth gate redirect loops or flicker.** Mitigation: gate runs only when
  `ready`; redirects use `router.replace`; test the four states explicitly.
- **Risk: the static shell leaks user data.** Mitigation: confirm `page.tsx` reads no user
  data server-side after conversion (no `getServerUser`, no user-data server islands); the
  shell HTML must be user-agnostic so the SW can safely serve it to anyone. All user data
  now flows through RLS-protected client reads.
- **Rollback:** the slice is one route. Revert the PR to restore the server-rendered,
  proxy-gated `/home`. RLS policies added are additive and safe to leave in place.

## 8. Open questions resolved
- Logged-out shell-then-login flash: accepted (Dave, 2026-06-28).
- RLS work in-scope now: yes (Dave, 2026-06-28).
- First route: `/home` (Dave, 2026-06-28).
