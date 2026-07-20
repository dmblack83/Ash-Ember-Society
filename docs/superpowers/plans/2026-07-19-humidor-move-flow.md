# Humidor Move Flow + UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Compact contract-style plan (implementers author code against contracts; reviews enforce them).

**Goal:** Make multi-humidor livable: move cigars (single + bulk), fix the four UX gaps found in Dave's live testing, and give network failures a human error message.

**Scope source:** Dave's live-testing feedback 2026-07-19 (post PR #583/#584). Approved scope list in conversation.

## Global Constraints

- No em dashes in user-facing copy. Inputs ≥16px. Static shells stay static (`npm run check:shells`).
- No auto-retry of writes (double-add risk); friendly message + manual retry only.
- All 290 tests stay green; tsc/eslint clean; existing behavior otherwise unchanged.
- Branch `feat/humidor-move-flow` off main @ 770a5d3. Commit per task.

## Tasks

### T1: Network-error mapping + move data layer (TDD)
- Modify `lib/offline-outbox.ts` `isLikelyOfflineError`: also match Safari's message ("load failed" — add `msg.includes("load")`). Existing behavior otherwise unchanged.
- Create `lib/data/humidor-move.ts`:
  - `moveItemsToHumidor(itemIds: string[], humidorId: string): Promise<void>` — one supabase update `.update({ humidor_id }).in("id", itemIds)` (RLS scopes to owner), throws Error(message) on failure.
  - `friendlyWriteError(err: unknown): string` — `isLikelyOfflineError(err)` → "Connection hiccup. Nothing was saved. Try again."; else err.message if nonempty; else "Something went wrong."
- Tests: `lib/data/__tests__/humidor-move.test.ts` for friendlyWriteError (offline TypeError variants incl. "Load failed", plain Error passthrough, empty fallback) + `lib/__tests__` coverage for the isLikelyOfflineError addition (extend existing test file if present, else add one).

### T2: Move sheets
- Create `components/humidor/MoveToHumidorSheet.tsx` — single item. Props `{ open, onClose, userId, currentHumidorId: string | null, itemId, onMoved: (destId: string) => void, onToast }`. Lists humidors via `useHumidors`; current one marked "Current" and disabled; tap a destination → `moveItemsToHumidor([itemId], destId)` → onMoved → toast "Moved to {name}." Errors via `friendlyWriteError`.
- Create `components/humidor/MoveCigarsSheet.tsx` — bulk. Props `{ open, onClose, userId, targetHumidor: Humidor, onMoved: (count: number) => void, onToast }`. Fetches the humidor items list via the existing SWR key (`keyFor.humidorItems`) + `fetchHumidorItems`; shows a checklist of items NOT already in the target (row: cigar brand/series, current humidor name via useHumidors lookup, checkbox; select-all control). Footer button "Move N cigars" (disabled at 0, count live) → `moveItemsToHumidor(selectedIds, targetHumidor.id)` → onMoved(count) → toast "N cigars moved to {name}." BottomSheet primitive, always-mounted state reset on open (the established bug class), 44px touch targets, no em dashes.

### T3: Item detail integration
- `lib/data/humidor-item-fetchers.ts`: add `humidor_id` to the item select; bundle item type gains `humidor_id: string | null`.
- `components/humidor/HumidorItemClient.tsx`: "Move to..." action (btn-ghost, near Remove from Humidor per the existing actions block) → MoveToHumidorSheet. Render the action only when the user has ≥2 humidors. After move: `revalidateHumidor(userId)` + mutate `keyFor.humidorItemBundle(userId, item.id)` + toast. Show current humidor name near the top meta (small mono tag) when ≥2 humidors exist.

### T4: HumidorClient UX fixes
- Filtered-empty state gains CTA button "Move cigars here" → MoveCigarsSheet (target = selected humidor). Render CTA only when other humidors contain ≥1 item. After onMoved: SWR mutate humidorItems (list refresh).
- Create-flow: HumidorSheet gains optional `onCreated?: (humidor: Humidor) => void`; HumidorClient passes it and sets `selected = humidor.id` (auto-filter to the new empty humidor so the CTA is the landing).
- Rename visibility: when exactly 1 humidor and its name !== "My Humidor", All-view count line reads "{count} cigars in {name}" (value part unchanged).

### T5: AddCigarSheet humidor picker parity
- `components/humidor/AddCigarSheet.tsx` gains `defaultHumidorId?: string | null` and the same picker UI as AddToHumidorSheet (only when ≥2 humidors; defaults to prop ?? default humidor). Thread the prop from its mount chain to HumidorClient's `selected` (find the chain: AddCigarOptions or direct). ensureDefaultHumidor stays the fallback.

### T6: HumidorSheet polish
- Edit mode, `editing.is_default`: explanatory line where the delete affordance would be: "This is your default humidor. It can be renamed but not deleted."
- HumidorSheet + AddToHumidorSheet + HumidorItemClient error paths route through `friendlyWriteError` where they currently toast raw messages from network-capable calls.

### T7: Verification + PR
- test:unit, tsc, eslint on touched files, build + check:shells, bundle gate (lounge drift only), final whole-branch review, PR with UX-change summary for Dave.
