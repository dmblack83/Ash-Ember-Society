# Free-tier limits: 20 unique cigars, full lounge, unlimited burn reports

**Date:** 2026-07-03
**Status:** Approved by Dave (design confirmed in session; "yes, build it")

## The tier deal (product decision, Dave)

Free members get:
- **20 unique cigars** in the humidor. Quantity per cigar is unlimited;
  only distinct cigars count. Wishlist stays unlimited and exempt.
- **Full lounge access**: read, post, comment, like. No posting gate.
- **Unlimited burn reports.**

Members (paid) remain unlimited everywhere.

## Current state (verified 2026-07-03)

- The unique-cigar cap already exists end-to-end at **10**: DB trigger
  `enforce_humidor_free_limit` (20260529 migration), client check
  `FREE_TIER_LIMITS.humidor_items` in `lib/membership.ts` +
  `lib/humidor/add-item.ts`, and `UpgradeLimitModal` copy. Semantics
  already match the product decision (distinct cigar_id, re-buys and
  wishlist exempt).
- Lounge posting is gated for free users in exactly two places
  (`LoungeForumClient.tsx`, `CategoryFeed.tsx`: `canPost` +
  "Upgrade to Member to post in the Lounge." toast). Comments and likes
  are already ungated.
- Burn reports have no tier gate anywhere. Already conformant.

## Changes

1. **Cap 10 → 20**
   - New migration `supabase/migrations/20260703_free_tier_20_unique.sql`:
     `create or replace` the trigger function with threshold 20
     (manual apply in the SQL editor; apply BEFORE the code deploys so
     the server is never stricter than the client).
   - `lib/membership.ts`: `FREE_TIER_LIMITS.humidor_items: 20`.
   - `UpgradeLimitModal.tsx` copy: "You've reached your 20-cigar limit" /
     "Free members can track up to 20 unique cigars."
   - Doc comments referencing "10" / "11th" in `add-item.ts` and the
     trigger updated to match.
2. **Remove the lounge posting gate**
   - Delete `canPost` and its toast branch from `LoungeForumClient.tsx`
     and `CategoryFeed.tsx`.
   - The `membershipTier` prop's only consumer was the gate: remove the
     prop from both components and their two island call sites, plus the
     now-unused `getMembershipTier` locals/imports there.
3. **Burn reports**: no change (verified ungated).
4. **Copy sweep**: no other user-facing surface describes the old limits
   (grep "10 unique", "read-only", "Upgrade to Member" — only the files
   above). PROJECT_STATE.md membership table gets the new free-tier line.

## Deploy order

Dave runs the SQL first (trigger at 20 while client still caps at 10 =
harmless), then the PR merges. Never the reverse.

## Edge cases

- A paid member downgrading with >20 unique cigars keeps everything;
  the trigger only blocks NEW distinct cigar inserts past the cap.
- Race between client check and insert stays covered by the trigger
  (P0001 mapped to `HumidorLimitError` → modal), unchanged.

## Testing

- Unit: pin `FREE_TIER_LIMITS.humidor_items === 20` and
  `isAtHumidorLimit` boundaries (19 no, 20 yes, paid never) — new test
  file for `lib/membership.ts`.
- Gate: tsc ×2, build, full unit suite.
- Manual (Dave): after SQL + deploy, add an 11th unique cigar on a free
  account (passes), post in the lounge on a free account (passes).
