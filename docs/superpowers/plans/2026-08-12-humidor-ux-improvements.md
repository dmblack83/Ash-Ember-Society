# Humidor UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the eight approved humidor UX improvements (spec: `docs/superpowers/specs/2026-08-12-humidor-ux-improvements-design.md`) as two PRs: detail page first (creates shared pieces), list page second.

**Architecture:** PR 1 (branch `feat/humidor-ux-improvements`, current) builds a shared aging-state helper, extracts the quick-log modal into a reusable component, adds a shared wishlist-add helper + last-stick prompt, and applies all four detail-page changes. PR 2 (fresh branch off main AFTER PR 1 merges — never push to a merged branch) consumes those pieces on the list page: aging badges, search toolbar, swipe-to-log, ember ×1.

**Tech Stack:** Next.js App Router, React client components, SWR, Supabase client, Tailwind + CSS tokens, vitest (`npm run test:unit` runs `vitest run lib/`).

## Global Constraints

- No em dashes in any user-facing string (use comma/colon/period).
- Text inputs need `fontSize: 16` (iOS zoom prevention).
- `/humidor` must stay a static shell — no server-side data added to the route (`npm run check:shells` after build).
- Design tokens only (`var(--gold)`, `var(--ember)` etc.); no new font families; no new npm dependencies.
- Animations: transform/opacity only. Preserve `contentVisibility` styles on list rows/cards.
- Every Supabase write handles its error case with a user-visible toast.
- Before ANY `git push`: `gh pr list --head <branch> --state all` — verify the PR is OPEN (or doesn't exist yet).

---

## PR 1 — shared pieces + detail page

### Task 1: Aging-state helper

**Files:**
- Create: `lib/humidor/aging-state.ts`
- Test: `lib/__tests__/aging-state.test.ts`

**Interfaces:**
- Produces: `agingState(startDate: string | null, targetDate: string | null, now?: Date): AgingState` where `AgingState` is the discriminated union below. Consumed by Tasks 5, 9.
- Produces: `formatShortDate(ymd: string): string` → `"Nov 12"` style label.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/__tests__/aging-state.test.ts
import { describe, expect, test } from "vitest";
import { agingState, formatShortDate } from "@/lib/humidor/aging-state";

const NOW = new Date(Date.UTC(2026, 7, 12)); // 2026-08-12

describe("agingState", () => {
  test("no start, no target: none", () => {
    expect(agingState(null, null, NOW)).toEqual({ kind: "none" });
  });
  test("start only: plain day count", () => {
    expect(agingState("2026-07-01", null, NOW)).toEqual({ kind: "plain", days: 42 });
  });
  test("target more than 14 days out: aging with ready label", () => {
    expect(agingState("2026-05-20", "2026-11-16", NOW)).toEqual({
      kind: "aging", days: 84, readyLabel: "Nov 16",
    });
  });
  test("target exactly 15 days out is still aging", () => {
    expect(agingState("2026-05-20", "2026-08-27", NOW).kind).toBe("aging");
  });
  test("target 14 days out flips to almost", () => {
    expect(agingState("2026-05-20", "2026-08-26", NOW)).toEqual({
      kind: "almost", days: 84, daysToTarget: 14,
    });
  });
  test("target today is ready", () => {
    expect(agingState("2026-01-22", "2026-08-12", NOW)).toEqual({ kind: "ready", days: 202 });
  });
  test("target passed is ready", () => {
    expect(agingState("2026-01-22", "2026-08-10", NOW).kind).toBe("ready");
  });
  test("target set with no start still reports states", () => {
    expect(agingState(null, "2026-08-10", NOW)).toEqual({ kind: "ready", days: 0 });
  });
});

test("formatShortDate", () => {
  expect(formatShortDate("2026-11-16")).toBe("Nov 16");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/__tests__/aging-state.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// lib/humidor/aging-state.ts
/*
 * Single source of truth for aging display states, driven by the
 * aging_target_date the user set. Used by the humidor list badges and
 * the detail page aging bar so both surfaces agree.
 * Dates are YYYY-MM-DD strings compared in UTC (same convention as
 * lib/format's agingDays).
 */
export type AgingState =
  | { kind: "none" }
  | { kind: "plain"; days: number }
  | { kind: "aging"; days: number; readyLabel: string }
  | { kind: "almost"; days: number; daysToTarget: number }
  | { kind: "ready"; days: number };

const ALMOST_WINDOW_DAYS = 14;
const MS_PER_DAY = 86_400_000;

function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function parseYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function formatShortDate(ymd: string): string {
  return new Date(parseYmd(ymd)).toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });
}

export function agingState(
  startDate: string | null,
  targetDate: string | null,
  now: Date = new Date(),
): AgingState {
  const today = utcMidnight(now);
  const days = startDate
    ? Math.max(0, Math.floor((today - parseYmd(startDate)) / MS_PER_DAY))
    : 0;

  if (!targetDate) {
    return startDate ? { kind: "plain", days } : { kind: "none" };
  }
  const daysToTarget = Math.ceil((parseYmd(targetDate) - today) / MS_PER_DAY);
  if (daysToTarget <= 0) return { kind: "ready", days };
  if (daysToTarget <= ALMOST_WINDOW_DAYS) return { kind: "almost", days, daysToTarget };
  return { kind: "aging", days, readyLabel: formatShortDate(targetDate) };
}
```

- [ ] **Step 4: Run tests, expect all PASS**

Run: `npx vitest run lib/__tests__/aging-state.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/humidor/aging-state.ts lib/__tests__/aging-state.test.ts
git commit -m "feat: aging-state helper for target-aware humidor aging display"
```

### Task 2: Extract QuickLogModal (behavior-neutral)

**Files:**
- Create: `components/humidor/QuickLogModal.tsx`
- Modify: `components/humidor/HumidorItemClient.tsx` (remove inline `SmokeModal`, lines ~379-579; update usage ~line 1212)

**Interfaces:**
- Produces: `QuickLogModal({ isOpen, onClose, onSmoked }: { isOpen: boolean; onClose: () => void; onSmoked: (draft: SmokeLogDraft) => void })` and `export interface SmokeLogDraft { smoked_at: string; overall_rating: number; review_text: string | null }`. Consumed by Task 13 (list) and HumidorItemClient.

- [ ] **Step 1: Create the new file**

Move the entire `SmokeModal` function body from `HumidorItemClient.tsx` (the component spanning the `/* Smoke One modal */` comment through the end of its return, lines ~379-579) into `components/humidor/QuickLogModal.tsx` UNCHANGED except:
- Rename `SmokeModal` → `QuickLogModal`, add `export`.
- Change the `onSmoked` prop type from `(log: SmokeLog) => void` to `(draft: SmokeLogDraft) => void` with:

```ts
export interface SmokeLogDraft {
  smoked_at:      string;
  overall_rating: number;
  review_text:    string | null;
}
```

- In its `handleSubmit`, call `onSmoked({ smoked_at: smokedAt, overall_rating: rating, review_text: reviewText.trim() || null })` and DELETE the dead `supabase.auth.getUser()` block and placeholder-id object (the parent does the insert; the current placeholder shape is vestigial).
- Imports needed: `useState`, `useEffect` from react; `createClient` removed; `ratingLabel` from `@/lib/rating`; `todayLocalYmd` from `@/lib/format`; `useEscapeKey` from `@/lib/hooks/use-escape-key`.

- [ ] **Step 2: Update HumidorItemClient**

- Delete the inline `SmokeModal` and import `QuickLogModal, { type SmokeLogDraft }` from `./QuickLogModal`.
- Replace usage `<SmokeModal isOpen={smokeOpen} …>` with `<QuickLogModal …>` (same props).
- `handleSmoked(draft: SmokeLogDraft)` — adjust its signature; body unchanged (it already only reads `smoked_at`, `overall_rating`, `review_text`).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit --pretty false` — expect clean (pre-existing errors excepted).

- [ ] **Step 4: Commit**

```bash
git add components/humidor/QuickLogModal.tsx components/humidor/HumidorItemClient.tsx
git commit -m "refactor: extract QuickLogModal from HumidorItemClient for reuse"
```

### Task 3: Wishlist-add helper + LastStickPrompt

**Files:**
- Create: `lib/humidor/wishlist-add.ts`
- Create: `components/humidor/LastStickPrompt.tsx`
- Modify: `components/humidor/HumidorItemClient.tsx` (wire into `handleSmoked`)

**Interfaces:**
- Produces: `addCigarToWishlist(userId: string, cigarId: string): Promise<"added" | "exists">` (throws on other errors). Consumed by Tasks 6, 7, 13.
- Produces: `LastStickPrompt({ open, cigarLabel, humidorName, busy, onWishlist, onKeep, onRemove })` — all callbacks `() => void`, `busy: boolean` disables buttons. Consumed by Task 13.

- [ ] **Step 1: Implement the helper**

```ts
// lib/humidor/wishlist-add.ts
import { createClient } from "@/utils/supabase/client";
import { mutate } from "swr";
import { keyFor } from "@/lib/data/keys";

/* Adds a cigar to the wishlist. The humidor_items_wishlist_unique
   partial index makes duplicates a 23505 conflict, which we report as
   "exists" rather than an error. Revalidates the wishlist SWR keys. */
export async function addCigarToWishlist(
  userId:  string,
  cigarId: string,
): Promise<"added" | "exists"> {
  const supabase = createClient();
  const { error } = await supabase
    .from("humidor_items")
    .insert({ user_id: userId, cigar_id: cigarId, quantity: 1, is_wishlist: true });

  if (error && error.code !== "23505") throw new Error(error.message);
  void mutate(keyFor.wishlist(userId));
  void mutate(keyFor.hasWishlist(userId));
  void mutate(keyFor.cigarWishlisted(userId, cigarId));
  return error ? "exists" : "added";
}
```

- [ ] **Step 2: Implement LastStickPrompt**

Centered modal (scrim + card, same overlay pattern as `DeleteDialog` in HumidorItemClient — `useEscapeKey(open, onKeep)`, z-40 scrim / z-50 dialog). Copy (no em dashes):

```tsx
// components/humidor/LastStickPrompt.tsx  (structure; styling matches DeleteDialog)
export function LastStickPrompt({ open, cigarLabel, humidorName, busy, onWishlist, onKeep, onRemove }: {
  open: boolean; cigarLabel: string; humidorName: string; busy: boolean;
  onWishlist: () => void; onKeep: () => void; onRemove: () => void;
}) {
  useEscapeKey(open, onKeep);
  if (!open) return null;
  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-40" style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={onKeep} />
      <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="card w-full max-w-sm space-y-4 animate-fade-in text-center">
          <h3 style={{ fontFamily: "var(--font-serif)" }}>That was your last one</h3>
          <p className="text-sm text-muted-foreground">
            Smoke logged. {cigarLabel} is now at zero in {humidorName}. What would you like to do with the entry?
          </p>
          <div className="flex flex-col gap-3">
            <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={onWishlist}>Add to Wishlist for a re-buy</button>
            <button type="button" className="btn btn-secondary w-full" disabled={busy} onClick={onKeep}>Keep at 0 for my records</button>
            <button type="button" className="btn btn-ghost w-full text-sm" style={{ color: "#C44536" }} disabled={busy} onClick={onRemove}>Remove from Humidor</button>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Wire into HumidorItemClient**

In `handleSmoked`, after the quantity decrement: if the new quantity is 0, `setLastStickOpen(true)` (new state). Handlers:
- `onWishlist`: `await addCigarToWishlist(userId, item.cigar_id)` → toast `"Added to your wishlist."` (or `"Already on your wishlist."` for `"exists"`), close prompt. Wrap in try/catch → toast `"Couldn't add to wishlist."`
- `onKeep`: close prompt.
- `onRemove`: reuse the existing `handleDelete()`.
Track `busy` with a small `useState` while the wishlist call is in flight.

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit --pretty false`. Manually: quick log at quantity 1 in dev shows the prompt.

```bash
git add lib/humidor/wishlist-add.ts components/humidor/LastStickPrompt.tsx components/humidor/HumidorItemClient.tsx
git commit -m "feat: last-stick prompt after quick log empties an entry"
```

### Task 4: Vitola spec strip + On Hand stat

**Files:**
- Modify: `components/humidor/HumidorItemClient.tsx` (hero chips ~line 840; Stats grid ~line 1080)

**Interfaces:**
- Consumes: existing `Chip` sub-component; `c.length_inches`, `c.ring_gauge` (already fetched).

- [ ] **Step 1: Add the Vitola chip**

In the hero chip row, BEFORE the Wrapper chip:

```tsx
{(c.format || (c.length_inches != null && c.ring_gauge != null)) && (
  <Chip
    label="Vitola"
    value={[
      c.format,
      c.length_inches != null && c.ring_gauge != null
        ? `${trimNum(c.length_inches)}″ × ${c.ring_gauge}`
        : null,
    ].filter(Boolean).join(" · ")}
  />
)}
```

with a module-level `function trimNum(n: number): string { return String(parseFloat(n.toFixed(2))); }`. Remove the standalone `{c.format && <p …>{c.format}</p>}` under the h1 (the chip replaces it).

- [ ] **Step 2: Swap Ring Gauge stat for On Hand**

In the Stats grid, replace the `Ring Gauge` StatCard with:

```tsx
{item.price_paid_cents != null && quantity > 0 && (
  <StatCard
    label="On Hand"
    value={`$${Math.round((quantity * item.price_paid_cents) / 100)}`}
    sub={`${quantity} × $${(item.price_paid_cents / 100).toFixed(2)}`}
  />
)}
```

- [ ] **Step 3: Verify + commit**

`npx tsc --noEmit --pretty false`; dev check on an item with and without price/length.

```bash
git add components/humidor/HumidorItemClient.tsx
git commit -m "feat: vitola spec chip and on-hand value stat on cigar detail"
```

### Task 5: Aging bar honors the target

**Files:**
- Modify: `components/humidor/HumidorItemClient.tsx` (aging block, lines ~910-938)

**Interfaces:**
- Consumes: `agingState`, `formatShortDate` (Task 1). `item.aging_target_date` is already on `HumidorItemDetail`.

- [ ] **Step 1: Rework the aging block**

Replace the hardcoded `days / 180` progress and `180d target` label:

```tsx
const aging = agingState(item.aging_start_date, item.aging_target_date);
// progress: target-aware when set, legacy 180d fallback otherwise
const startMs  = item.aging_start_date ? Date.parse(item.aging_start_date) : null;
const targetMs = item.aging_target_date ? Date.parse(item.aging_target_date) : null;
const progress =
  startMs != null && targetMs != null && targetMs > startMs
    ? Math.min(1, (Date.now() - startMs) / (targetMs - startMs)) * 100
    : Math.min(days / 180, 1) * 100;
```

Right-side stat: `ready` → gold `` `${days} days ✦` ``; otherwise `` `${days} days` `` (amber when target set, muted when not). Endpoint labels: left `formatDate(start)` as today; right = `item.aging_target_date ? (ready ? \`${formatShortDate(target)} · target met\` : \`${formatShortDate(target)} · your target\`) : "180d target"`.

When `aging.kind === "ready"`, append the Ready strip below the endpoints:

```tsx
<div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg"
     style={{ background: "rgba(212,160,74,0.09)", border: "1px solid rgba(212,160,74,0.35)" }}>
  <span style={{ color: "var(--accent)" }}>{"✦"}</span>
  <div>
    <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>Ready to smoke</p>
    {item.aging_target_date && (
      <p className="text-xs text-muted-foreground">Rested past your {formatShortDate(item.aging_target_date)} target</p>
    )}
  </div>
</div>
```

Bar fill color: ready → `var(--accent)`; else current logic.

- [ ] **Step 2: Verify + commit**

Dev check: item with future target (bar partial, "your target" label), passed target (full gold + strip), no target (180d fallback unchanged).

```bash
git add components/humidor/HumidorItemClient.tsx
git commit -m "feat: aging bar runs to the user's ready-by target with ready state"
```

### Task 6: Action stack → two buttons + overflow menu

**Files:**
- Modify: `components/humidor/HumidorItemClient.tsx` (back row ~786, actions ~1035)

**Interfaces:**
- Consumes: `BottomSheet` from `@/components/ui/BottomSheet`; `addCigarToWishlist` (Task 3).

- [ ] **Step 1: Kebab button in the top row**

Wrap the back link in `flex items-center justify-between`; add on the right:

```tsx
<button type="button" onClick={() => setMenuOpen(true)} aria-label="More actions"
  className="btn btn-ghost p-2 -mr-2 text-muted-foreground">
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/>
  </svg>
</button>
```

- [ ] **Step 2: Menu sheet**

New state `menuOpen`. Render with the BottomSheet primitive:

```tsx
<BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} ariaLabel="Cigar actions"
  mobileHeight="auto" desktopHeight="auto">
  <div className="flex flex-col py-1">
    <MenuRow label="Edit Details" onClick={() => { setMenuOpen(false); setEditOpen(true); }} />
    {hasMultipleHumidors && (
      <MenuRow label="Move to another humidor" onClick={() => { setMenuOpen(false); setMoveOpen(true); }} />
    )}
    <MenuRow label="Add to Wishlist" onClick={handleAddToWishlist} />
    <MenuRow label="Remove from Humidor" danger onClick={() => { setMenuOpen(false); setDeleteOpen(true); }} />
  </div>
</BottomSheet>
```

`MenuRow` is a local sub-component: full-width left-aligned button, `py-3.5 px-5 text-sm border-b border-border/40 last:border-0`, `danger` → `color: "#C44536"` and a top separator (`borderTop: "1px solid var(--border)"`, extra margin) so Remove reads as its own group. `handleAddToWishlist` closes the menu, calls `addCigarToWishlist(userId, item.cigar_id)`, toasts `"Added to your wishlist."` / `"Already on your wishlist."` / `"Couldn't add to wishlist."` (catch).
Note: if `BottomSheet`'s `mobileHeight` prop rejects `"auto"` (it defaults `92dvh`), pass `mobileHeight="min(50dvh, 340px)"` instead; check the prop's handling in `components/ui/BottomSheet.tsx` before choosing.

- [ ] **Step 3: Trim the action stack**

Delete the Edit Details, Move to..., and Remove from Humidor buttons from the actions column, leaving File Burn Report + Quick Smoke Log.

- [ ] **Step 4: Verify + commit**

Dev check: menu opens, each row routes to its existing sheet/dialog; Move hidden with one humidor.

```bash
git add components/humidor/HumidorItemClient.tsx
git commit -m "feat: collapse detail actions into overflow menu with wishlist add"
```

### Task 7: Burn-report finish adopts the last-stick options

**Files:**
- Modify: `components/humidor/BurnReport.tsx` (finish screen `quantityAfter <= 0` block ~1346-1364; props ~1273-1288; usage ~2035-2041)

**Interfaces:**
- Consumes: `addCigarToWishlist` (Task 3).

- [ ] **Step 1: Extend the finish screen**

Add props `onAddToWishlist: () => void` and `wishlistState: "idle" | "busy" | "done"` next to `onRemoveFromHumidor`. Replace the notice block's single Remove button with the three options (copy identical to LastStickPrompt, minus the modal chrome):

```tsx
{quantityAfter <= 0 && (
  <div className="w-full max-w-sm rounded-xl p-4 mb-8 text-center space-y-3"
       style={{ backgroundColor: "var(--secondary)", border: "1px solid var(--border)" }}>
    <p className="text-sm text-foreground font-medium">That was your last one.</p>
    <button type="button" onClick={onAddToWishlist} disabled={wishlistState !== "idle"}
            className="btn btn-primary text-sm w-full">
      {wishlistState === "done" ? "On your wishlist" : wishlistState === "busy" ? "Adding..." : "Add to Wishlist for a re-buy"}
    </button>
    <p className="text-xs text-muted-foreground">Or keep it at 0 for your records.</p>
    <button type="button" onClick={onRemoveFromHumidor} className="btn btn-ghost text-sm w-full" style={{ color: "#C44536" }}>
      Remove from Humidor
    </button>
  </div>
)}
```

- [ ] **Step 2: Wire in the parent**

Where `handleRemoveFromHumidor` is defined, add `wishlistState` state and `handleAddToWishlist`: call `addCigarToWishlist(userId, cigarId)` (both already in the wizard's scope; verify names at the call site), set `"done"` on success or `"exists"`, reset to `"idle"` + toast on failure. Pass both new props at the usage site.

- [ ] **Step 3: Verify + commit**

`npx tsc --noEmit --pretty false`; dev: file a burn report on a quantity-1 item.

```bash
git add components/humidor/BurnReport.tsx
git commit -m "feat: burn report last-stick screen offers wishlist re-buy"
```

### Task 8: PR 1 gate

- [ ] Run: `npm run test:unit` — all pass.
- [ ] Run: `npx tsc --noEmit --pretty false` — no new errors.
- [ ] Run: `npm run build && npm run check:shells` — `/humidor` still static.
- [ ] Runtime: `verify-in-app` skill across `/humidor/[id]`: spec chips, aging target states, overflow menu (all four rows), quick-log last-stick prompt, burn-report finish options.
- [ ] `gh pr list --head feat/humidor-ux-improvements --state all` (expect none), then push with `-u` and open PR titled `feat: cigar detail UX (vitola specs, target-aware aging, action menu, last-stick prompt)` referencing the spec.

---

## PR 2 — list page (START ONLY AFTER PR 1 MERGES)

Branch fresh: `git fetch origin main && git checkout main && git merge --ff-only origin/main && git checkout -b feat/humidor-list-ux`.

### Task 9: aging_target_date on the list + badges

**Files:**
- Modify: `lib/data/humidor-fetchers.ts:21-24` (add column to select)
- Modify: `components/humidor/HumidorClient.tsx` (HumidorItem interface ~58-69; `AgingBadge` ~150-186; GridCard ~260; ListRow ~328)
- Test: `lib/__tests__/aging-state.test.ts` (already covers logic; no new unit test)

**Interfaces:**
- Consumes: `agingState` (Task 1, merged in PR 1).
- Produces: `HumidorItem.aging_target_date: string | null` — used by Tasks 10, 11.

- [ ] **Step 1:** Add `aging_target_date` to the `fetchHumidorItems` select string and to the `HumidorItem` interface.
- [ ] **Step 2:** Replace `AgingBadge({ days })` with `AgingBadge({ item }: { item: HumidorItem })`:

```tsx
function AgingBadge({ item }: { item: HumidorItem }) {
  const s = agingState(item.aging_start_date, item.aging_target_date);
  switch (s.kind) {
    case "none":  return null;
    case "plain": return <span className="text-[11px] text-muted-foreground">Aging {s.days}d</span>;
    case "aging": return <span className="text-[11px] text-muted-foreground">Aging {s.days}d {"·"} ready {s.readyLabel}</span>;
    case "almost": return <span className="text-[11px] font-medium" style={{ color: "var(--primary)" }}>Almost there {"·"} {s.daysToTarget}d to go</span>;
    case "ready": return <span className="text-[11px] font-medium" style={{ color: "var(--accent)" }}>{"✦"} Ready to smoke</span>;
  }
}
```

Update both call sites (GridCard + ListRow) to pass `item`; ListRow's `days > 0` wrapper becomes a null-check on the badge (render unconditionally; the badge self-hides).
- [ ] **Step 3:** `npx tsc --noEmit --pretty false`; dev check all four states; commit `feat: target-aware aging badges on humidor list`.

### Task 10: Ready-first sort

**Files:**
- Modify: `components/humidor/HumidorClient.tsx` (`SortOption` type ~72, `SORT_LABELS` ~89, `sortItems` ~120)

- [ ] **Step 1:** Add `"ready_first"` to `SortOption` and `SORT_LABELS` (`"Ready first"`). In `sortItems`:

```ts
case "ready_first": {
  const rank = (i: HumidorItem) => {
    const k = agingState(i.aging_start_date, i.aging_target_date).kind;
    return k === "ready" ? 0 : k === "almost" ? 1 : k === "aging" ? 2 : 3;
  };
  return arr.sort((a, b) =>
    rank(a) - rank(b) ||
    agingDays(b.aging_start_date) - agingDays(a.aging_start_date));
}
```

- [ ] **Step 2:** Dev check, commit `feat: ready-first sort option`.

### Task 11: Search field + compressed sort control

**Files:**
- Modify: `components/humidor/HumidorClient.tsx` (toolbar Row 3, lines ~802-824; `visible` memo ~631)
- Create: `lib/humidor/list-filter.ts`
- Test: `lib/__tests__/list-filter.test.ts`

**Interfaces:**
- Produces: `matchesQuery(item: { cigar: { brand: string | null; series: string | null; wrapper: string | null } }, query: string): boolean`

- [ ] **Step 1: Failing test**

```ts
// lib/__tests__/list-filter.test.ts
import { expect, test } from "vitest";
import { matchesQuery } from "@/lib/humidor/list-filter";

const item = { cigar: { brand: "Padrón", series: "1964 Anniversary", wrapper: "Maduro" } };
test("empty query matches", () => expect(matchesQuery(item, "")).toBe(true));
test("brand, case-insensitive", () => expect(matchesQuery(item, "padr")).toBe(true));
test("series", () => expect(matchesQuery(item, "1964")).toBe(true));
test("wrapper", () => expect(matchesQuery(item, "maduro")).toBe(true));
test("no match", () => expect(matchesQuery(item, "opus")).toBe(false));
test("null fields", () =>
  expect(matchesQuery({ cigar: { brand: null, series: null, wrapper: null } }, "x")).toBe(false));
```

- [ ] **Step 2: Implement**

```ts
// lib/humidor/list-filter.ts
export function matchesQuery(
  item: { cigar: { brand: string | null; series: string | null; wrapper: string | null } },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.cigar.brand, item.cigar.series, item.cigar.wrapper]
    .some((f) => f != null && f.toLowerCase().includes(q));
}
```

Run the test file; expect PASS.

- [ ] **Step 3: Toolbar rework**

New state `const [query, setQuery] = useState("")`. Row 3 becomes: search input (flex-1) + sort icon button + existing `ViewToggle`:

```tsx
<div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
  <div className="relative flex-1">
    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
         width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
    <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
           placeholder="Search your humidor" aria-label="Search your humidor"
           className="input py-2 pl-9 text-sm w-full" style={{ fontSize: 16 }} />
  </div>
  <div className="relative flex-shrink-0">
    <button type="button" aria-hidden="true" tabIndex={-1} className="btn btn-secondary w-9 h-9 p-0 flex items-center justify-center">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M4 7h6M6 10h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
    </button>
    <select className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)} aria-label="Sort by">
      {(Object.keys(SORT_LABELS) as SortOption[]).map((k) => (
        <option key={k} value={k}>{SORT_LABELS[k]}</option>
      ))}
    </select>
  </div>
  <div className="flex-shrink-0"><ViewToggle view={view} onChange={setView} /></div>
</div>
```

(The invisible native select over the icon keeps the platform sort menu and its accessibility for free.)

- [ ] **Step 4: Filter chain**

`visible` memo: `items` → humidor-chip filter (existing) → `.filter((i) => matchesQuery(i, query))`, dep array gains `query`. When `displayed.length === 0 && query.trim() !== ""` render a no-results state INSTEAD of the per-humidor empty state: `<p className="text-sm text-muted-foreground text-center py-16">No cigars match "{query}".</p>` (straight quotes fine; no em dashes).

- [ ] **Step 5:** `npm run test:unit`; dev check search + sort still work; commit `feat: humidor search with compressed sort control`.

### Task 12: Ember ×1 count

**Files:**
- Modify: `components/humidor/HumidorClient.tsx` (ListRow quantity span ~336-344)

- [ ] **Step 1:** On the ListRow quantity badge, color by count — color only, no text:

```tsx
style={{
  backgroundColor: "var(--secondary)",
  color: item.quantity === 1 ? "var(--ember, #E8642C)" : "var(--foreground)",
  border: item.quantity === 1 ? "1px solid rgba(232,100,44,0.45)" : "1px solid transparent",
}}
```

GridCard badge unchanged (hidden at 1 today).
- [ ] **Step 2:** Dev check; commit `feat: ember quantity badge on last stick`.

### Task 13: Swipe-to-log on list rows

**Files:**
- Create: `components/humidor/SwipeableRow.tsx`
- Modify: `components/humidor/HumidorClient.tsx` (wrap ListRow; quick-log state + handlers)

**Interfaces:**
- Consumes: `QuickLogModal` + `SmokeLogDraft`, `LastStickPrompt`, `addCigarToWishlist` (PR 1); `revalidateHumidor` from `@/lib/data/humidor-cache`.
- Produces: `SwipeableRow({ children, onQuickLog, onBurnReport }: { children: React.ReactNode; onQuickLog: () => void; onBurnReport: () => void })`.

- [ ] **Step 1: SwipeableRow component**

```tsx
// components/humidor/SwipeableRow.tsx
"use client";
import { useRef, useState } from "react";

const ACTIONS_WIDTH = 164;   // two 82px actions
const FULL_SWIPE = 260;      // past this, release triggers quick log
const INTENT = 10;           // px before we claim the gesture

/* Horizontal swipe reveal for humidor list rows. Claims the gesture
   only after horizontal intent beats vertical (|dx| > |dy| and
   |dx| > INTENT) so vertical scroll and pull-to-refresh keep working.
   Transform-only animation. */
export function SwipeableRow({ children, onQuickLog, onBurnReport }: {
  children: React.ReactNode; onQuickLog: () => void; onBurnReport: () => void;
}) {
  const [offset, setOffset]   = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const claimed = useRef(false);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, base: offset };
    claimed.current = false;
    setDragging(true);
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!start.current) return;
    const t = e.touches[0];
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;
    if (!claimed.current) {
      if (Math.abs(dx) <= INTENT || Math.abs(dx) <= Math.abs(dy)) return;
      claimed.current = true;
    }
    setOffset(Math.min(0, Math.max(-FULL_SWIPE - 40, start.current.base + dx)));
  }
  function onTouchEnd() {
    setDragging(false);
    start.current = null;
    if (!claimed.current) return;
    if (offset <= -FULL_SWIPE) { setOffset(0); onQuickLog(); return; }
    setOffset(offset <= -ACTIONS_WIDTH / 2 ? -ACTIONS_WIDTH : 0);
  }
  const close = () => setOffset(0);

  return (
    <div className="relative rounded-xl overflow-hidden"
         onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="absolute inset-y-0 right-0 flex" aria-hidden={offset === 0}>
        <button type="button" tabIndex={offset === 0 ? -1 : 0}
          onClick={() => { close(); onBurnReport(); }}
          className="w-[82px] flex flex-col items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ background: "linear-gradient(180deg, var(--accent), #a87c32)", color: "#1a1208" }}>
          Burn<br/>Report
        </button>
        <button type="button" tabIndex={offset === 0 ? -1 : 0}
          onClick={() => { close(); onQuickLog(); }}
          className="w-[82px] flex flex-col items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ background: "linear-gradient(180deg, #f07a42, var(--ember, #E8642C))", color: "#1a0d06" }}>
          Quick<br/>Log
        </button>
      </div>
      <div style={{ transform: `translateX(${offset}px)`,
                    transition: dragging ? "none" : "transform 200ms ease" }}>
        {children}
      </div>
    </div>
  );
}
```

Add the cigar icon SVG inside the Quick Log button (body rect + band lines + ember dot, per mockup) and a document icon in Burn Report; both `aria-hidden`.

- [ ] **Step 2: Wire into the list**

In `HumidorClient` list branch, wrap each `<ListRow>`:

```tsx
<SwipeableRow key={item.id}
  onQuickLog={() => setQuickLogItem(item)}
  onBurnReport={() => router.push(`/humidor/${item.id}/burn-report`)}>
  <ListRow item={item} tagName={…existing…} />
</SwipeableRow>
```

(`useRouter` import needed.) Grid branch untouched. New state: `quickLogItem: HumidorItem | null`, `lastStick: HumidorItem | null`, `wishlistBusy: boolean`.

- [ ] **Step 3: Quick log submit handler**

Mirror the detail page's `handleSmoked`, list-side:

```tsx
async function handleQuickLogged(draft: SmokeLogDraft) {
  const target = quickLogItem;
  setQuickLogItem(null);
  if (!target) return;
  const supabase = createClient();
  const { error: logError } = await supabase.from("smoke_logs").insert({
    user_id: userId, cigar_id: target.cigar_id, humidor_item_id: target.id,
    smoked_at: draft.smoked_at, overall_rating: draft.overall_rating, review_text: draft.review_text,
  });
  if (logError) { setToast("Failed to log smoke."); return; }
  const nextQty = Math.max(0, target.quantity - 1);
  const { error: qtyError } = await supabase
    .from("humidor_items").update({ quantity: nextQty }).eq("id", target.id);
  if (qtyError) { setToast("Smoke logged, but count not updated."); return; }
  setToast("Smoke logged!");
  await refresh();
  if (nextQty === 0) setLastStick(target);
}
```

Render `<QuickLogModal isOpen={quickLogItem != null} onClose={() => setQuickLogItem(null)} onSmoked={handleQuickLogged} />` and `<LastStickPrompt open={lastStick != null} …>` with: `cigarLabel` = `[cigar.brand, cigar.series ?? cigar.format].filter(Boolean).join(" ")`, `humidorName` = `nameById.get(item.humidor_id ?? "") ?? "your humidor"`, `onWishlist` → `addCigarToWishlist(userId, lastStick.cigar_id)` with the same three toasts as detail, `onKeep` closes, `onRemove` → `supabase.from("humidor_items").delete().eq("id", lastStick.id)` then `refresh()` (toast `"Failed to remove cigar."` on error).
Check `smoke_logs` insert columns against the detail page's insert first; keep them identical plus `humidor_item_id` (column exists in schema; detail page omits it — include there too if trivially safe, otherwise match detail exactly).

- [ ] **Step 4: Verify + commit**

Dev on touch device/emulator: swipe reveals, full swipe quick-logs, partial swipe snaps open, tap elsewhere still navigates, vertical scroll and pull-to-refresh unaffected, grid view has no swipe.

```bash
git add components/humidor/SwipeableRow.tsx components/humidor/HumidorClient.tsx
git commit -m "feat: swipe-to-log on humidor list rows (quick log + burn report)"
```

### Task 14: PR 2 gate

- [ ] `npm run test:unit`, `npx tsc --noEmit --pretty false`, `npm run build && npm run check:shells`.
- [ ] `verify-in-app` across `/humidor`: search, sort menu (incl. Ready first), badges, ember ×1, swipe actions, last-stick from list; grid view regression pass.
- [ ] `gh pr list --head feat/humidor-list-ux --state all`, push `-u`, PR titled `feat: humidor list UX (search, aging states, swipe-to-log, last-one)` referencing the spec.
