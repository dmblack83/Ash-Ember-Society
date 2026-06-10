# C1 (Humidor) — SWR scoping / investigation

> Read-only investigation done 2026-06-10 before writing the C1 detailed plan.
> **Finding: the read-caching half of C1 is already implemented.** The plan's
> Part C recipe (steps 1-2: add key + fetcher, seed with fallbackData) is done
> for the Humidor list. C1's real remaining work is two tighter, different
> pieces. This doc corrects the scope so the C1 plan targets reality, not the
> roadmap's assumption that Humidor is "server-rendered, hydrated via props."

## What already exists (no work needed)

- **List read path is SWR-cached.** `HumidorClient.tsx:444-456` uses
  `useSWR(keyFor.humidorItems(userId), fetchHumidorItems, { fallbackData: initialItems, revalidateOnMount: false })`.
  The server island (`app/(app)/humidor/_islands.tsx`) provides first-paint data
  as `fallbackData`; SWR caches it, so navigating away and back renders instantly
  from cache with no refetch. This is exactly recipe steps 1-2.
- **Wishlist boolean** is cached the same way (`HumidorClient.tsx:464-474`).
- **WishlistClient mutations are already optimistic.** `WishlistClient.tsx`
  delete (`:937`) and move (`:952`) call `mutate(next, { revalidate: false })` —
  recipe step 3, done for the wishlist surface.

## Gap A — cache coherence across write surfaces (real bug, low risk)

The Humidor list caches with `revalidateOnMount: false`, but writes that happen
on **other** surfaces don't update `keyFor.humidorItems(userId)`. Result: the
list shows stale data after a cross-surface write until a manual toolbar refresh.

Surfaces that mutate `humidor_items` without touching the cache:
- **`HumidorItemClient.tsx`** (item detail): quantity edit (`:586`), add
  (`:608`), delete (`:643` → `router.push("/humidor")`). Returning to the list
  shows the **old quantity / still-present deleted item** because the cached
  entry is served and not revalidated on mount.
- **`AddToHumidorSheet.tsx`**: insert/update (`:177`, `:187`) then `onSuccess()`
  — a prop callback. When opened from Discover (`CigarActions.tsx:118`,
  `DiscoverCigarsClient.tsx`), `onSuccess` does not update the humidor list cache.
- **`CigarActions.tsx`**: direct insert/delete (`:57`, `:72`).

**Fix shape (for the C1 plan):** give these surfaces a way to invalidate/patch
`keyFor.humidorItems(userId)` — either `useSWRConfig().mutate(keyFor.humidorItems(userId))`
to revalidate, or optimistic patches for the common cases (quantity, delete).
This is the highest-value, lowest-risk part of C1 and is arguably a correctness
fix, not just perf. It does NOT touch the auth/proxy path.

## Gap B — the per-navigation RSC round-trip is still paid (design tradeoff)

`HumidorDataIsland` re-runs both Supabase queries on **every** navigation to
`/humidor`, even though the client ignores the result after first paint
(`revalidateOnMount: false`). That server round-trip through the auth proxy is
the actual navigation latency the plan's "real lever" targets (recipe step 4:
"trim the server work").

The tension the roadmap glossed over: **the server fetch IS what produces
`fallbackData`.** You cannot both keep server-provided first-paint data and
eliminate the server round-trip. The two honest options:

1. **Keep as-is.** Pay the server round-trip on every nav; render instantly from
   client cache once warm. Today's behavior. Simplest, safest.
2. **Static shell + client fetch.** Drop the per-user server island; the route
   becomes a static shell that client-fetches via SWR. No server round-trip on
   navigation; repeat visits render instantly from cache. Cost: the **first-ever**
   visit (cold cache) shows a skeleton briefly instead of server-rendered data,
   and the change touches the auth/proxy/first-paint path — so it falls under the
   **reliability working agreement** and needs explicit sign-off.

**Open questions for Dave (decide before C1 plan):**
- Is the warm-navigation lag actually dominated by the RSC round-trip? The
  in-flight cold-load interactivity telemetry (PR #498) should answer this —
  the roadmap itself says to confirm with that data before investing. **Do not
  do Gap B until #498 data confirms the round-trip is the bottleneck.**
- Is a brief skeleton on the first-ever `/humidor` visit acceptable in exchange
  for zero-round-trip navigation thereafter?

## Recommended C1 sequencing (supersedes the roadmap's single "migrate" phase)

- **C1a — cache coherence (do first, independent PR).** Wire the cross-surface
  writes to update `keyFor.humidorItems(userId)`. Safe, no proxy impact, fixes a
  real staleness bug. Brainstorm the optimistic-vs-revalidate choice per surface.
- **C1b — round-trip trim (gated on #498 data + Dave sign-off).** Only if the
  telemetry confirms the RSC round-trip dominates warm-nav latency. Reliability
  working agreement applies. Its own spec + plan.

## Files referenced
- `app/(app)/humidor/page.tsx`, `app/(app)/humidor/_islands.tsx`
- `components/humidor/HumidorClient.tsx` (`:444-482`)
- `components/humidor/WishlistClient.tsx` (`:877-952`)
- `components/humidor/HumidorItemClient.tsx` (`:586`, `:608`, `:643-652`)
- `components/cigars/AddToHumidorSheet.tsx` (`:164-187`), `components/cigars/CigarActions.tsx`
- `lib/data/keys.ts` (`keyFor.humidorItems`, `keyFor.wishlist`)
