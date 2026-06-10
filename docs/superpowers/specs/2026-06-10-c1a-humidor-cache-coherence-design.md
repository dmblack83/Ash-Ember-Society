# C1a — Humidor list cache coherence (design)

> Part of the responsiveness/snappiness initiative (`docs/superpowers/plans/2026-06-10-responsiveness-snappiness.md`).
> Scoping that produced this: `docs/superpowers/specs/2026-06-10-c1-humidor-swr-scoping.md`.
> This is the **C1a** slice: a correctness fix, not the round-trip trim (that is C1b, gated on #498 telemetry).

## Problem

The Humidor list (`HumidorClient.tsx`) reads via `useSWR(keyFor.humidorItems(userId), fetchHumidorItems, { fallbackData, revalidateOnMount: false })`. Because `revalidateOnMount` is `false`, navigating back to `/humidor` serves the cached list and does **not** refetch.

Writes that happen on **other** surfaces mutate `humidor_items` but never update that cache entry, so the list shows stale data until the user hits the manual toolbar refresh:

| Surface | File | Write |
|---|---|---|
| Item detail — quantity edit | `components/humidor/HumidorItemClient.tsx` (~:586) | `update({ quantity })` |
| Item detail — add | `components/humidor/HumidorItemClient.tsx` (~:608) | `insert(...)` |
| Item detail — delete | `components/humidor/HumidorItemClient.tsx` (~:643) | `delete()` then `router.push("/humidor")` |
| Add-to-humidor sheet | `components/cigars/AddToHumidorSheet.tsx` (~:177, :187) | `insert` / `update(quantity)` |
| Cigar actions (Discover) | `components/cigars/CigarActions.tsx` (~:57, :72) | `insert` / `delete` |
| Burn report (smoke) | `components/humidor/BurnReport.tsx` | API decrements quantity; `delete()` at qty 0 (~:1997) |

## Chosen approach: re-pull in background after each write

A single shared helper re-pulls the list (and the wishlist-count the empty state depends on) into the SWR cache immediately after a successful write, while the writing screen is still mounted. By the time the user navigates back to `/humidor`, the cache is already correct and renders instantly.

We hand SWR the **fresh data directly** (call the fetcher, pass the result) rather than calling `mutate(key)` with no data. This matters because the list component is unmounted when these writes happen, so no key-bound fetcher is registered; providing the data ourselves works regardless.

### Helper

In `lib/data/humidor-fetchers.ts` (co-located with the fetchers it uses):

```ts
import { mutate } from "swr";
import { keyFor } from "./keys";

/* Re-pull the Humidor list + wishlist-count into the shared SWR cache.
   Called after any write to humidor_items that happens OUTSIDE the
   Humidor list (item detail, add sheet, cigar actions, burn report) so
   the list reflects the change when the user navigates back. The list
   uses revalidateOnMount:false, so without this it stays stale until a
   manual refresh. We pass fresh data (not a bare mutate(key)) because
   the list component is unmounted here and has no registered fetcher.
   revalidate:false — the data we pass IS fresh, no extra round-trip. */
export async function revalidateHumidor(userId: string): Promise<void> {
  try {
    await Promise.all([
      mutate(keyFor.humidorItems(userId), fetchHumidorItems(userId), { revalidate: false }),
      mutate(keyFor.hasWishlist(userId), fetchHasWishlistItems(userId), { revalidate: false }),
    ]);
  } catch {
    /* Background refresh after an already-successful write. If it fails
       (network), the write still stands and SWR's revalidateOnReconnect
       + the manual refresh button recover the list. Never block the
       user's flow or surface an error for this. */
  }
}
```

### Key centralization (small, in-scope)

The wishlist-count key is currently an inline literal `["wishlist-has", userId]` in `HumidorClient.tsx:468`. Add it to `lib/data/keys.ts` so the helper and the component target the identical key:

```ts
hasWishlist: (userId: string) => ["wishlist-has", userId] as const,
```

Update `HumidorClient.tsx` to use `keyFor.hasWishlist(userId)` instead of the inline tuple. No behavior change — same key value.

### Call sites

After each successful write (and only on success), call `revalidateHumidor(userId)`. The `userId` is already available at every surface via `supabase.auth.getUser()`.

- `HumidorItemClient.tsx` — after quantity update, after add, after delete (before/around the existing `router.push("/humidor")`).
- `AddToHumidorSheet.tsx` — after the insert/update succeeds, before calling the existing `onSuccess()` prop.
- `CigarActions.tsx` — after insert and after delete.
- `BurnReport.tsx` — after the burn-report API call returns success (quantity decremented) and after the delete-at-zero.

## Data flow

```
write succeeds (other screen)
  → revalidateHumidor(userId)
      → fetchHumidorItems(userId)      → mutate(keyFor.humidorItems(userId), data, {revalidate:false})
      → fetchHasWishlistItems(userId)  → mutate(keyFor.hasWishlist(userId),  data, {revalidate:false})
  → user navigates to /humidor
      → HumidorClient mounts, reads fresh cache, renders correct data instantly
```

## Error handling

The re-pull is fire-and-forget after a write that already succeeded. The helper swallows its own errors (try/catch). A failed background refresh leaves the prior cache in place; existing recovery (`revalidateOnReconnect: true`, manual refresh button) covers it. No user-facing error, no flow blocking.

## Rejected alternative

Set the list's `revalidateOnMount: true` (refetch on every visit to `/humidor`). Simplest possible change, but it reintroduces a Supabase round-trip on **every** navigation to the tab — the exact cost the SWR caching was introduced to remove (see the comment at `HumidorClient.tsx:440-442`). The per-write helper keeps navigation cheap and only refreshes when something actually changed.

## Testing

- **Unit:** `revalidateHumidor` — mock SWR's `mutate`, assert it is called once per key with the correct `keyFor.*` tuple, the fetcher's resolved value, and `{ revalidate: false }`; assert a rejected fetcher does not throw out of the helper.
- **Manual matrix (preview/device):**
  - Smoke a cigar (burn report) → return to list → quantity decremented, or item gone at zero.
  - Add a cigar from Discover (CigarActions / AddToHumidorSheet) → return to list → it appears.
  - Edit quantity on the item detail → return to list → reflected.
  - Delete on the item detail → list no longer shows it (the post-delete `router.push("/humidor")` lands on a correct list).
- **No E2E:** the PWA + auth path makes a full E2E high-cost for low marginal signal on a cache-coherence fix.

## Scope guardrails

- Touches only the Humidor items list + wishlist-count cache keys.
- One new helper; one key added to `keyFor`; ~6 call-site additions across 4 files.
- No auth/proxy/server-island changes → outside the reliability working agreement.
- Does **not** attempt C1b (trimming the per-navigation server-island round-trip). That stays gated on #498 telemetry.
