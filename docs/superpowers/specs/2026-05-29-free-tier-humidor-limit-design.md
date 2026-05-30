# Free-tier humidor limit — design

**Date:** 2026-05-29
**Status:** Approved (design); pending implementation plan

## Problem

`lib/membership.ts` declares a 10-cigar cap for free users (`FREE_TIER_LIMITS.humidor_items = 10`) and exposes an `isAtHumidorLimit()` helper, but nothing in the app actually calls them. Free users can add an unlimited number of cigars to their humidor today. We need to:

1. Cap free users at 10 unique cigars in their humidor.
2. Block further adds with an upgrade modal that routes to the membership tab.
3. Not punish existing free users who are already over the cap.

## Decisions (locked)

| # | Decision | Choice |
|---|---|---|
| 1 | What counts toward the cap | Distinct `cigar_id` in `humidor_items` where `is_wishlist = false`. Multiple rows of the same cigar (different purchase date / batch) count as 1. |
| 2 | Grandfathering | Existing free users with > 10 distinct cigars keep everything. New adds are blocked until they upgrade OR drop below 10. No data hidden, no destructive action. |
| 3 | Enforcement | Client modal pre-check (good UX) + Postgres trigger (defense in depth). Both required. |
| 4 | Modal tone | Soft nudge with skip. Primary CTA → upgrade. Secondary CTA → close modal (returns user to prior context). |
| 5 | Wishlist | Stays unlimited. Wishlist inserts skip the assertion entirely. |
| 6 | Skip target | "Manage humidor" / secondary action just closes the modal. No forced redirect. |

## Architecture

```
AddToHumidorSheet ─┐
WishlistClient ────┤
PostModal ─────────┤
CigarActions ──────┼──► addHumidorItem()  ──► assertCanAddHumidor()
DiscoverCigarsClient ┤   (lib/humidor/add-item.ts)    │
AddCigarSheet ─────┘                                  ├─► pass → INSERT
                                                      └─► block → throw HumidorLimitError
                                                                       │
                       caller catches ─────────► <UpgradeLimitModal />

Postgres: BEFORE INSERT trigger on humidor_items → re-checks distinct count,
raises P0001 if free + would exceed 10 (wishlist excluded). Backstop only.
```

One wrapper, one modal, one trigger.

## Components

### `lib/humidor/add-item.ts` (new)

```ts
export class HumidorLimitError extends Error {
  constructor() { super("humidor_free_tier_limit"); this.name = "HumidorLimitError"; }
}

export async function assertCanAddHumidor(
  supabase: SupabaseClient,
  userId: string,
  cigarId: string,
): Promise<void>

export async function addHumidorItem(
  supabase: SupabaseClient,
  payload: HumidorInsertPayload,
): Promise<{ id: string }>
```

`assertCanAddHumidor` logic:
1. Load the user's profile (`membership_tier`, `assigned_badges`, `badge`) and run through `getMembershipTier()` from `lib/membership.ts`.
2. If paid (tier !== `free`) → return (pass).
3. Otherwise fetch the user's existing distinct `cigar_id` values from `humidor_items` where `user_id = userId AND is_wishlist = false`.
4. If `cigarId` is already in that set → return (pass — adding another batch is free).
5. If distinct count ≥ 10 → throw `HumidorLimitError`.

`addHumidorItem`:
- If `payload.is_wishlist === true` → skip the assert, just insert.
- Otherwise: run `assertCanAddHumidor`, then insert.
- Also maps Postgres error `P0001` with message `humidor_free_tier_limit` to a thrown `HumidorLimitError` (race condition: client check passed but trigger blocked).

### `components/membership/UpgradeLimitModal.tsx` (new)

Props: `{ isOpen: boolean; onClose: () => void }`.

Layout follows existing bottom-sheet / centered-modal pattern from `AddToHumidorSheet`:

- **Title** (Playfair Display, serif): "You've reached your 10-cigar limit"
- **Body** (Inter, sans): "Free members can track up to 10 unique cigars. Upgrade to Member for unlimited cigars."
- **Primary CTA**: `<Link href="/account?tab=membership">` labeled **Upgrade to Member** (amber `--primary` button). Requires a small additive change to `AccountClient.tsx`: read `useSearchParams()`, and if `tab === "membership"` on mount, set the local `sheet` state to `"membership"` so the Membership bottom sheet opens automatically.
- **Secondary CTA**: text button labeled **Manage humidor** → calls `onClose()` (no navigation)
- **Close X** in top-right corner → calls `onClose()`

No em dashes in any user-facing copy (per project rule).

### Database trigger (new migration)

File: `supabase/migrations/<timestamp>_humidor_free_tier_limit.sql`

```sql
create or replace function enforce_humidor_free_limit()
returns trigger language plpgsql as $$
declare
  v_tier text;
  v_distinct int;
begin
  if new.is_wishlist then return new; end if;

  select coalesce(membership_tier, 'free') into v_tier
  from profiles where id = new.user_id;

  if v_tier <> 'free' then return new; end if;

  select count(distinct cigar_id) into v_distinct
  from humidor_items
  where user_id = new.user_id
    and is_wishlist = false
    and cigar_id <> new.cigar_id;

  if v_distinct >= 10 then
    raise exception 'humidor_free_tier_limit'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger humidor_free_limit_check
  before insert on humidor_items
  for each row execute function enforce_humidor_free_limit();
```

Notes:
- The trigger reads `membership_tier` raw from `profiles`. Legacy `'premium'` rows bypass the check (treated as paid) — matches client-side `getMembershipTier()` coercion.
- The `cigar_id <> new.cigar_id` filter matches the helper rule (another batch of an owned cigar passes).
- The trigger does NOT enforce `assigned_badges` (founder / beta_tester). Edge case: a free-tier user with a founder badge would be blocked by the trigger even though `getMembershipTier()` treats them as member. This is acceptable for v1 because such accounts are manually administered; if it becomes a real case, extend the trigger to read `assigned_badges` too.

## Call site changes

A grep of `humidor_items` inserts found six sites, but four of them insert with `is_wishlist: true` — those are wishlist adds, which the design exempts from the cap. Only two sites actually need the client-side gate:

| File | Insert kind | Action |
|---|---|---|
| `components/cigars/AddToHumidorSheet.tsx` | `is_wishlist: false` | Replace inline insert with `addHumidorItem()`; mount `<UpgradeLimitModal>` at component root. This sheet is also reused by `WishlistClient` for the "move from wishlist to humidor" path, so gating it covers that path too. |
| `components/humidor/AddCigarSheet.tsx` | `is_wishlist: false` | Same pattern. |
| `components/account/AccountClient.tsx` | n/a | Add `useSearchParams()` read; auto-open the Membership sheet when `?tab=membership` is present so the modal's CTA lands the user on the right tab. |

Wishlist insert sites (unchanged):

- `components/humidor/WishlistClient.tsx:188`
- `components/cigars/DiscoverCigarsClient.tsx:366`
- `components/cigars/CigarActions.tsx:57`
- `components/lounge/PostModal.tsx:684`

The Postgres trigger early-returns on `is_wishlist = true`, so even if a wishlist insert is somehow forged with `is_wishlist: false`, the DB blocks it. No client-side gate needed on the wishlist paths.

Pattern:

```tsx
try {
  await addHumidorItem(supabase, { user_id, cigar_id, quantity, ... });
  onSuccess();
} catch (e) {
  if (e instanceof HumidorLimitError) {
    setShowLimitModal(true);
    return;
  }
  setError("Something went wrong");
}
```

The `<UpgradeLimitModal>` mounts at the component root, not inside a bottom sheet body, to avoid z-index / clipping issues.

## Edge cases

| Case | Handling |
|---|---|
| Race condition (two tabs add simultaneously, both pass client check) | Trigger rejects the second with `P0001`. `addHumidorItem` catches the SQLSTATE and rethrows `HumidorLimitError`. Modal appears. |
| Free user already over 10 (grandfathered) | Existing rows untouched. UPDATE / DELETE not gated. Next INSERT of a new distinct cigar fails (correct — they have to upgrade or trim). |
| Free user at exactly 10, adds another batch of an owned cigar | Helper and trigger both pass it (`cigar_id` matches an existing one). |
| Legacy `'premium'` tier in DB | Treated as paid by both helper (`getMembershipTier()` coerces) and trigger (`v_tier <> 'free'`). |
| Founder/beta_tester badge on a `free` tier row | v1: blocked by trigger. Documented as known v1 limitation; extend trigger to read `assigned_badges` if a real user hits this. |
| Wishlist insert | Helper and trigger both early-return on `is_wishlist = true`. |
| Helper / trigger drift in future tier rule changes | Both must be updated together. Spec lists both files so future contributors see the coupling. |

## Testing

### Playwright E2E

The project has no unit-test runner today (only Playwright). Rather than introduce Vitest for one helper, the helper's behavior is exercised end-to-end through the existing Playwright setup. Add a new spec `tests/e2e/free-tier-limit.spec.ts` covering:

- Free user with 9 distinct cigars in their humidor → add a 10th → success, no modal.
- Free user with 10 distinct → attempt to add an 11th → modal appears with "Upgrade to Member" CTA.
- Same user → add a duplicate batch of an already-owned cigar → success (the same-cigar exemption).
- Modal "Upgrade to Member" CTA → navigates to `/account?tab=membership` with the Membership sheet open.
- Modal "Manage humidor" CTA → closes the modal, stays on prior page.

Seed/teardown via Supabase service-role client in `beforeAll` / `afterAll` so the test owns its fixture data.

### Manual E2E (per CLAUDE.md "verify in browser")

Run against a test account in the dev or preview environment:

1. Free account with 9 distinct cigars → add a 10th → succeeds, no modal.
2. Same account → attempt to add an 11th distinct → modal appears, no insert in DB (verify via SQL editor count).
3. Same account → add another batch of an already-owned cigar → succeeds.
4. Upgrade test account to Member → 11th distinct now succeeds.
5. Manually downgrade test account back to free with 15 distinct cigars → all 15 still visible / editable / deletable / burn-reportable; new add blocked.
6. Open the modal → tap "Upgrade to Member" → lands on `/account?tab=membership` with the Membership bottom sheet already open.
7. Open the modal → tap "Manage humidor" → modal closes, user remains where they were.

### DB-level test

Direct SQL as a free-tier user via Supabase SQL editor:

```sql
insert into humidor_items (user_id, cigar_id, quantity, is_wishlist)
values ('<free-user-id>', '<new-cigar-id>', 1, false);
-- Expect: ERROR: humidor_free_tier_limit (SQLSTATE P0001)
```

## Out of scope (deferred)

- No UI indicator on the humidor list showing "9 / 10 used" — could be a follow-up.
- No backfill / cleanup for grandfathered free users above 10. They remain as-is until they upgrade or manually delete.
- No email or notification when a user hits the cap.
- No "you'll lose access to N cigars" warning when a paid user downgrades. (Downgrade path is rare; data is preserved either way.)
- No founder/beta_tester badge handling in the trigger (v1 known limitation; extend if a real user is affected).

## Files touched

**New:**
- `lib/humidor/add-item.ts`
- `components/membership/UpgradeLimitModal.tsx`
- `supabase/migrations/<timestamp>_humidor_free_tier_limit.sql`
- Test files alongside the helper

**Modified:**
- `components/cigars/AddToHumidorSheet.tsx`
- `components/humidor/AddCigarSheet.tsx`
- `components/account/AccountClient.tsx` (additive: `?tab=membership` query handling)

No changes to `lib/membership.ts` (the existing `FREE_TIER_LIMITS` constant and `isAtHumidorLimit` helper are kept; the new code consumes the constant).
