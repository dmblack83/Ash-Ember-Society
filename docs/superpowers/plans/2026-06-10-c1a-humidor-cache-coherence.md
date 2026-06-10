# C1a — Humidor Cache Coherence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After any write to `humidor_items` from a screen other than the Humidor list, the list reflects the change on return — no manual refresh.

**Architecture:** A single shared helper `revalidateHumidor(userId)` re-pulls the list + wishlist-count into the global SWR cache (passing fresh fetcher data, `revalidate:false`) immediately after a successful write. The list uses `revalidateOnMount:false`, so this targeted re-pull is what keeps it correct without paying a refetch on every navigation. Six call sites across four components, plus two server pages that pass `userId`.

**Tech Stack:** Next.js App Router, React 19, SWR (global `mutate`), Supabase JS client, Vitest.

**Design spec:** `docs/superpowers/specs/2026-06-10-c1a-humidor-cache-coherence-design.md`

---

## File Structure

- **Modify** `lib/data/keys.ts` — add `keyFor.hasWishlist(userId)` (centralizes the inline `["wishlist-has", userId]` tuple).
- **Create** `lib/data/humidor-cache.ts` — the `revalidateHumidor` helper (own file, imports the fetchers, so it's unit-testable by mocking the fetchers module).
- **Create** `lib/data/__tests__/humidor-cache.test.ts` — unit test for the helper.
- **Modify** `components/humidor/HumidorClient.tsx` — point the wishlist-count `useSWR` at `keyFor.hasWishlist`.
- **Modify** `components/humidor/HumidorItemClient.tsx` — add `userId` prop; call helper in `updateQuantity`, `handleSaved`, `handleDelete`.
- **Modify** `app/(app)/humidor/[id]/page.tsx` — pass `userId={user.id}`.
- **Modify** `components/cigars/AddToHumidorSheet.tsx` — call helper in `insertEntry` and `addToExisting`.
- **Modify** `components/cigars/CigarActions.tsx` — call helper in `toggleWishlist`.
- **Modify** `components/humidor/BurnReport.tsx` — add `userId` prop; call helper after submit success and in `handleRemoveFromHumidor`.
- **Modify** `app/(app)/humidor/[id]/burn-report/page.tsx` — pass `userId={user.id}`.

---

### Task 1: Add `keyFor.hasWishlist` and point HumidorClient at it

**Files:**
- Modify: `lib/data/keys.ts:29`
- Modify: `components/humidor/HumidorClient.tsx:468`

- [ ] **Step 1: Add the key builder**

In `lib/data/keys.ts`, find:

```ts
  wishlist:     (userId: string) => ["wishlist",      userId] as const,
```

Replace with:

```ts
  wishlist:     (userId: string) => ["wishlist",      userId] as const,
  /* Boolean "has ≥1 wishlist item" — drives the Humidor empty-state
     "add from wishlist" CTA. Separate key from `wishlist` (the full
     list) because it's a cheap HEAD count, not the rows. */
  hasWishlist:  (userId: string) => ["wishlist-has",  userId] as const,
```

- [ ] **Step 2: Point HumidorClient's wishlist-count useSWR at the new key**

In `components/humidor/HumidorClient.tsx`, find:

```tsx
  } = useSWR(
    ["wishlist-has", userId] as const,
    () => fetchHasWishlistItems(userId),
```

Replace the inline tuple with the builder:

```tsx
  } = useSWR(
    keyFor.hasWishlist(userId),
    () => fetchHasWishlistItems(userId),
```

(`keyFor` is already imported at `HumidorClient.tsx:10`. The key VALUE is identical — `["wishlist-has", userId]` — so cache behavior is unchanged.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit --pretty false`
Expected: clean (exit 0, no output).

- [ ] **Step 4: Commit**

```bash
git add lib/data/keys.ts components/humidor/HumidorClient.tsx
git commit -m "refactor(humidor): centralize wishlist-has SWR key into keyFor.hasWishlist"
```

---

### Task 2: Create the `revalidateHumidor` helper (TDD)

**Files:**
- Test: `lib/data/__tests__/humidor-cache.test.ts`
- Create: `lib/data/humidor-cache.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/data/__tests__/humidor-cache.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { keyFor } from "../keys";

/* Mock SWR's global mutate and the fetchers module so the helper is
   tested in isolation (no Supabase). mutate is mocked to await the data
   promise it's handed — mirrors real SWR — so a rejecting fetcher
   propagates into the helper's Promise.all and we can assert the swallow. */
const { mutateMock, fetchItemsMock, fetchHasWishlistMock } = vi.hoisted(() => ({
  mutateMock:           vi.fn(),
  fetchItemsMock:       vi.fn(),
  fetchHasWishlistMock: vi.fn(),
}));

vi.mock("swr", () => ({ mutate: mutateMock }));
vi.mock("../humidor-fetchers", () => ({
  fetchHumidorItems:     fetchItemsMock,
  fetchHasWishlistItems: fetchHasWishlistMock,
}));

import { revalidateHumidor } from "../humidor-cache";

beforeEach(() => {
  vi.clearAllMocks();
  mutateMock.mockImplementation((_key: unknown, data?: unknown) => Promise.resolve(data));
});

describe("revalidateHumidor", () => {
  it("re-pulls both the humidor list and wishlist-count keys with revalidate:false", async () => {
    fetchItemsMock.mockResolvedValue([{ id: "a" }]);
    fetchHasWishlistMock.mockResolvedValue(true);

    await revalidateHumidor("user-1");

    expect(mutateMock).toHaveBeenCalledTimes(2);
    expect(mutateMock).toHaveBeenCalledWith(
      keyFor.humidorItems("user-1"), expect.anything(), { revalidate: false },
    );
    expect(mutateMock).toHaveBeenCalledWith(
      keyFor.hasWishlist("user-1"), expect.anything(), { revalidate: false },
    );
  });

  it("swallows errors when a fetcher rejects (the write already succeeded)", async () => {
    fetchItemsMock.mockRejectedValue(new Error("network"));
    fetchHasWishlistMock.mockResolvedValue(false);

    await expect(revalidateHumidor("user-1")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/data/__tests__/humidor-cache.test.ts`
Expected: FAIL — cannot resolve `../humidor-cache` (module does not exist yet).

- [ ] **Step 3: Write the helper**

Create `lib/data/humidor-cache.ts`:

```ts
"use client";

import { mutate } from "swr";
import { keyFor } from "./keys";
import { fetchHumidorItems, fetchHasWishlistItems } from "./humidor-fetchers";

/* Re-pull the Humidor list + wishlist-count into the shared SWR cache.
   Call after any write to humidor_items that happens OUTSIDE the Humidor
   list (item detail, add sheet, cigar actions, burn report). The list
   uses revalidateOnMount:false, so without this it stays stale until a
   manual refresh.

   We pass fresh data (the fetcher's promise), not a bare mutate(key),
   because the list component is unmounted at these call sites and has no
   key-bound fetcher registered. revalidate:false — the data we pass IS
   fresh, no extra round-trip.

   Fire-and-forget after an already-successful write: the helper swallows
   its own errors. A failed background refresh leaves the prior cache in
   place; SWR's revalidateOnReconnect + the manual refresh button recover
   it. Never block the user's flow or surface an error here. */
export async function revalidateHumidor(userId: string): Promise<void> {
  try {
    await Promise.all([
      mutate(keyFor.humidorItems(userId), fetchHumidorItems(userId),     { revalidate: false }),
      mutate(keyFor.hasWishlist(userId),  fetchHasWishlistItems(userId), { revalidate: false }),
    ]);
  } catch {
    /* swallowed — see doc comment above */
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/data/__tests__/humidor-cache.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/data/humidor-cache.ts lib/data/__tests__/humidor-cache.test.ts
git commit -m "feat(humidor): add revalidateHumidor SWR cache helper"
```

---

### Task 3: Wire the item-detail surfaces (HumidorItemClient + page)

**Files:**
- Modify: `components/humidor/HumidorItemClient.tsx` (import, props, 3 call sites)
- Modify: `app/(app)/humidor/[id]/page.tsx` (pass `userId`)

- [ ] **Step 1: Import the helper**

In `components/humidor/HumidorItemClient.tsx`, add after the existing imports near the top of the file (e.g. after the `keyFor` import at line 10):

```tsx
import { revalidateHumidor } from "@/lib/data/humidor-cache";
```

- [ ] **Step 2: Add the `userId` prop**

Find the component signature:

```tsx
export function HumidorItemClient({
  item: initialItem,
  initialSmokeLogs,
  hasPending     = false,
  hasApproved    = false,
  hasPendingEdit = false,
}: {
  item: HumidorItemDetail;
  initialSmokeLogs: SmokeLog[];
  hasPending?:      boolean;
  hasApproved?:     boolean;
  hasPendingEdit?:  boolean;
}) {
```

Replace with:

```tsx
export function HumidorItemClient({
  item: initialItem,
  initialSmokeLogs,
  userId,
  hasPending     = false,
  hasApproved    = false,
  hasPendingEdit = false,
}: {
  item: HumidorItemDetail;
  initialSmokeLogs: SmokeLog[];
  userId: string;
  hasPending?:      boolean;
  hasApproved?:     boolean;
  hasPendingEdit?:  boolean;
}) {
```

- [ ] **Step 3: Revalidate after a quantity change**

Find (inside `updateQuantity`):

```tsx
    setQtyLoading(false);
    if (error) {
      setQuantity(prev);
      setToast("Failed to update quantity.");
    }
  }
```

Replace with:

```tsx
    setQtyLoading(false);
    if (error) {
      setQuantity(prev);
      setToast("Failed to update quantity.");
      return;
    }
    /* Re-pull the Humidor list cache so the new quantity shows when the
       user navigates back (the list uses revalidateOnMount:false). */
    void revalidateHumidor(userId);
  }
```

- [ ] **Step 4: Revalidate after an edit-details save**

Find:

```tsx
  function handleSaved(updated: Partial<typeof itemFields>) {
    setItemFields((prev) => ({ ...prev, ...updated }));
    setToast("Details saved.");
  }
```

Replace with:

```tsx
  function handleSaved(updated: Partial<typeof itemFields>) {
    setItemFields((prev) => ({ ...prev, ...updated }));
    setToast("Details saved.");
    /* Edited fields (aging date, notes, etc.) show in the list — refresh. */
    void revalidateHumidor(userId);
  }
```

- [ ] **Step 5: Revalidate before the post-delete navigation**

Find (inside `handleDelete`):

```tsx
    router.push("/humidor");
  }
```

Replace with:

```tsx
    /* Update the list cache before navigating so the deleted item is
       already gone when the list mounts. */
    void revalidateHumidor(userId);
    router.push("/humidor");
  }
```

(Note: `handleSmoked`'s quantity decrement runs through `updateQuantity`, so it is covered by Step 3 — no separate call needed.)

- [ ] **Step 6: Pass `userId` from the detail page**

In `app/(app)/humidor/[id]/page.tsx`, find:

```tsx
    <HumidorItemClient
      item={item as HumidorItemDetail}
      initialSmokeLogs={normalizedLogs}
      hasPending={submission?.status === "pending"}
      hasApproved={submission?.status === "approved"}
      hasPendingEdit={editSuggestion !== null}
    />
```

Replace with:

```tsx
    <HumidorItemClient
      item={item as HumidorItemDetail}
      initialSmokeLogs={normalizedLogs}
      userId={user.id}
      hasPending={submission?.status === "pending"}
      hasApproved={submission?.status === "approved"}
      hasPendingEdit={editSuggestion !== null}
    />
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit --pretty false`
Expected: clean (exit 0).

- [ ] **Step 8: Commit**

```bash
git add components/humidor/HumidorItemClient.tsx "app/(app)/humidor/[id]/page.tsx"
git commit -m "feat(humidor): item-detail writes refresh the list cache"
```

---

### Task 4: Wire AddToHumidorSheet (insert + add-to-existing)

**Files:**
- Modify: `components/cigars/AddToHumidorSheet.tsx`

- [ ] **Step 1: Import the helper**

In `components/cigars/AddToHumidorSheet.tsx`, add after the existing import at line 6 (`import { addHumidorItem, HumidorLimitError } ...`):

```tsx
import { revalidateHumidor } from "@/lib/data/humidor-cache";
```

- [ ] **Step 2: Revalidate after a fresh insert**

Find (the end of `insertEntry`, immediately before the `/* Add qty to the first existing entry */` comment):

```tsx
    setSubmitting(false);
    onSuccess();
    onClose();
  }

  /* Add qty to the first existing entry */
```

Replace with:

```tsx
    setSubmitting(false);
    /* Re-pull the Humidor list cache so the new cigar shows on return. */
    void revalidateHumidor(user.id);
    onSuccess();
    onClose();
  }

  /* Add qty to the first existing entry */
```

(`user` is in scope here — fetched earlier in `insertEntry`.)

- [ ] **Step 3: Revalidate after adding to an existing entry**

Find (the end of `addToExisting`):

```tsx
    if (updateError) {
      setError(updateError.message);
      return;
    }

    onSuccess();
    onClose();
  }
```

Replace with:

```tsx
    if (updateError) {
      setError(updateError.message);
      return;
    }

    /* Re-pull the Humidor list cache so the updated quantity shows on
       return. addToExisting doesn't otherwise need the user id, so fetch
       it here (cheap — the supabase client caches the session). */
    const { data: { user } } = await supabase.auth.getUser();
    if (user) void revalidateHumidor(user.id);

    onSuccess();
    onClose();
  }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit --pretty false`
Expected: clean (exit 0).

- [ ] **Step 5: Commit**

```bash
git add components/cigars/AddToHumidorSheet.tsx
git commit -m "feat(humidor): add-to-humidor sheet refreshes the list cache"
```

---

### Task 5: Wire CigarActions (wishlist toggle)

**Files:**
- Modify: `components/cigars/CigarActions.tsx`

- [ ] **Step 1: Import the helper**

In `components/cigars/CigarActions.tsx`, add after the import at line 6 (`import { Toast } ...`):

```tsx
import { revalidateHumidor } from "@/lib/data/humidor-cache";
```

- [ ] **Step 2: Revalidate after the wishlist toggle**

Find (the end of `toggleWishlist`):

```tsx
      if (error) {
        setIsWishlisted(prev);
        setToast("Failed to remove from wishlist.");
      }
    }

    setWishlistLoading(false);
  }
```

Replace with:

```tsx
      if (error) {
        setIsWishlisted(prev);
        setToast("Failed to remove from wishlist.");
      }
    }

    /* Refresh the Humidor empty-state wishlist CTA (the hasWishlist count).
       Safe on the error paths too — a re-pull just returns current server
       truth. */
    void revalidateHumidor(user.id);
    setWishlistLoading(false);
  }
```

(`user` is in scope — fetched earlier in `toggleWishlist`.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit --pretty false`
Expected: clean (exit 0).

- [ ] **Step 4: Commit**

```bash
git add components/cigars/CigarActions.tsx
git commit -m "feat(humidor): wishlist toggle refreshes the hasWishlist cache"
```

---

### Task 6: Wire BurnReport (smoke submit + remove-at-zero)

**Files:**
- Modify: `components/humidor/BurnReport.tsx` (import, props, 2 call sites)
- Modify: `app/(app)/humidor/[id]/burn-report/page.tsx` (pass `userId`)

- [ ] **Step 1: Import the helper**

In `components/humidor/BurnReport.tsx`, add after the import at line 18 (`import { tapHaptic, successHaptic } ...`):

```tsx
import { revalidateHumidor } from "@/lib/data/humidor-cache";
```

- [ ] **Step 2: Add the `userId` prop**

Find:

```tsx
export function BurnReport({
  item,
  flavorTags,
  partnerVideos = [],
  displayName,
  city,
  reportNumber,
  mode = "create",
  existing,
}: {
  item: BurnReportItem;
  flavorTags: FlavorTag[];
```

Replace with:

```tsx
export function BurnReport({
  item,
  userId,
  flavorTags,
  partnerVideos = [],
  displayName,
  city,
  reportNumber,
  mode = "create",
  existing,
}: {
  item: BurnReportItem;
  userId: string;
  flavorTags: FlavorTag[];
```

- [ ] **Step 3: Revalidate after a successful submit**

Find:

```tsx
      const data = await res.json() as { smoke_log_id: string; quantity_after: number };
      setSmokeLogId(data.smoke_log_id);
      setQuantityAfter(data.quantity_after);
    } catch (err) {
```

Replace with:

```tsx
      const data = await res.json() as { smoke_log_id: string; quantity_after: number };
      setSmokeLogId(data.smoke_log_id);
      setQuantityAfter(data.quantity_after);
      /* Server decremented the humidor quantity — re-pull the list cache
         so it reflects the smoke on return. Skip in edit mode (a PATCH
         that doesn't change quantity). */
      if (mode === "create") void revalidateHumidor(userId);
    } catch (err) {
```

- [ ] **Step 4: Revalidate before the remove-at-zero navigation**

Find:

```tsx
  async function handleRemoveFromHumidor() {
    const supabase = createClient();
    await supabase.from("humidor_items").delete().eq("id", item.id);
    router.push("/humidor");
  }
```

Replace with:

```tsx
  async function handleRemoveFromHumidor() {
    const supabase = createClient();
    await supabase.from("humidor_items").delete().eq("id", item.id);
    void revalidateHumidor(userId);
    router.push("/humidor");
  }
```

- [ ] **Step 5: Pass `userId` from the burn-report page**

In `app/(app)/humidor/[id]/burn-report/page.tsx`, find:

```tsx
    <BurnReport
      item={item as unknown as BurnReportItem}
      flavorTags={flavorTagData as FlavorTag[]}
      partnerVideos={partnerVideos}
      displayName={profile?.display_name ?? null}
      city={profile?.city ?? null}
      reportNumber={nextReportNumber}
    />
```

Replace with:

```tsx
    <BurnReport
      item={item as unknown as BurnReportItem}
      userId={user.id}
      flavorTags={flavorTagData as FlavorTag[]}
      partnerVideos={partnerVideos}
      displayName={profile?.display_name ?? null}
      city={profile?.city ?? null}
      reportNumber={nextReportNumber}
    />
```

(`user` is in scope — `getServerUser()` at line 55, with a `redirect("/login")` guard.)

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit --pretty false`
Expected: clean (exit 0).

- [ ] **Step 7: Commit**

```bash
git add components/humidor/BurnReport.tsx "app/(app)/humidor/[id]/burn-report/page.tsx"
git commit -m "feat(humidor): burn report refreshes the list cache after smoke/remove"
```

---

### Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the unit suite**

Run: `npm run test:unit`
Expected: PASS, including the new `humidor-cache.test.ts` (2 tests).

- [ ] **Step 2: Type-check + production build**

Run: `npx tsc --noEmit --pretty false && npm run build`
Expected: tsc clean (exit 0); build succeeds, `public/sw.js` written.

- [ ] **Step 3: Confirm every call site is wired**

Run: `grep -rn "revalidateHumidor" components/ app/ lib/`
Expected: the helper definition (`lib/data/humidor-cache.ts`), its test, and **six** call sites — `HumidorItemClient.tsx` (×3), `AddToHumidorSheet.tsx` (×2), `CigarActions.tsx` (×1), `BurnReport.tsx` (×2). (Eight call invocations total across the four components.)

- [ ] **Step 4: Manual verification matrix (preview/device)**

Deploy the branch to a preview and confirm each, watching the Humidor list AFTER the action:

- [ ] Smoke a cigar via the burn report → return to `/humidor` → quantity decremented (or item gone at zero).
- [ ] Add a cigar from Discover (CigarActions → AddToHumidorSheet) → `/humidor` shows it.
- [ ] Add quantity to a cigar already in the humidor (add-to-existing path) → `/humidor` shows the higher quantity.
- [ ] Edit quantity on the item-detail page → `/humidor` reflects it.
- [ ] Edit details (notes/aging) on the item-detail page → `/humidor` reflects any list-visible field.
- [ ] Delete on the item-detail page → the post-delete `/humidor` does not show the item.
- [ ] Toggle a cigar's wishlist from the cigar page while the humidor is empty → the empty-state "add from wishlist" CTA appears/updates.

---

## Self-Review

**Spec coverage:**
- Helper `revalidateHumidor` passing fresh data + `revalidate:false` → Task 2. ✓
- `keyFor.hasWishlist` centralization + HumidorClient update → Task 1. ✓
- All six surfaces wired (item detail quantity/edit/delete, add sheet insert+existing, cigar actions, burn report submit+remove) → Tasks 3-6. ✓
- Error handling (swallow, no flow block) → Task 2 helper + test. ✓
- Unit test on helper → Task 2; manual matrix → Task 7. ✓
- No auth/proxy changes → confirmed (only client write surfaces + two `userId` prop passes). ✓

**Placeholder scan:** every step shows exact find/replace code and exact commands with expected output. No TBD/TODO. ✓

**Type consistency:** `revalidateHumidor(userId: string): Promise<void>` is called the same way at every site (`void revalidateHumidor(userId)` / `revalidateHumidor(user.id)`). `keyFor.hasWishlist(userId)` matches between Task 1 (definition), Task 2 (helper + test), and HumidorClient. New props are `userId: string` in both `HumidorItemClient` and `BurnReport`, passed as `userId={user.id}` from both pages. ✓

**Scope:** single feature (cache coherence), no server-island/proxy work (that's C1b, gated on #498). Focused enough for one plan. ✓
