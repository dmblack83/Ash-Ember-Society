# Free-Tier Humidor Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap free-tier users at 10 unique cigars in their humidor, with a "soft nudge" upgrade modal on the 11th add, enforced both client-side (good UX) and via a Postgres trigger (defense in depth).

**Architecture:** A single helper `addHumidorItem()` wraps the existing inline `humidor_items` insert calls at the two humidor-add sites. It pre-checks the cap and throws a typed `HumidorLimitError` the callers catch to open a shared `<UpgradeLimitModal>`. A `BEFORE INSERT` trigger on `humidor_items` is the backstop. Wishlist inserts (`is_wishlist: true`) are exempt at every layer.

**Tech Stack:** Next.js App Router, Supabase Postgres + RLS, TypeScript, Tailwind, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-29-free-tier-humidor-limit-design.md`

---

## Task 0: Branch off a fresh `origin/main`

**Why:** Local `main` in this workspace is routinely stale; building off it produces PRs that target deleted files. See memory `project_main_branch_stale.md`.

- [ ] **Step 1: Sync main**

Run:
```bash
git fetch origin main
git checkout main
git merge --ff-only origin/main
git log --oneline main..origin/main
```

Expected: the last command prints nothing. If it prints commits, the ff-only merge failed and the branch is in a bad state — stop and investigate.

- [ ] **Step 2: Create the feature branch**

```bash
git checkout -b feat/free-tier-humidor-limit
```

---

## Task 1: Postgres trigger migration

**Files:**
- Create: `supabase/migrations/20260529_humidor_free_tier_limit.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260529_humidor_free_tier_limit.sql`:

```sql
-- Enforce free-tier humidor cap (10 unique cigars per user).
-- Wishlist inserts are exempt. Adding another batch of an already-owned
-- cigar (same cigar_id) is exempt — only NEW distinct cigar_id values
-- count against the cap.

create or replace function enforce_humidor_free_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_distinct int;
begin
  -- Wishlist inserts bypass the cap entirely.
  if new.is_wishlist then
    return new;
  end if;

  select coalesce(membership_tier, 'free')
    into v_tier
    from profiles
    where id = new.user_id;

  -- Anything other than the literal string 'free' is treated as paid.
  -- This includes the legacy 'premium' tier (now an alias for member).
  if v_tier <> 'free' then
    return new;
  end if;

  select count(distinct cigar_id)
    into v_distinct
    from humidor_items
    where user_id = new.user_id
      and is_wishlist = false
      and cigar_id <> new.cigar_id;

  if v_distinct >= 10 then
    raise exception 'humidor_free_tier_limit'
      using errcode = 'P0001';
  end if;

  return new;
end
$$;

drop trigger if exists humidor_free_limit_check on humidor_items;
create trigger humidor_free_limit_check
  before insert on humidor_items
  for each row execute function enforce_humidor_free_limit();
```

- [ ] **Step 2: Apply migration to the local/dev Supabase**

Open the Supabase SQL Editor for the project at `qagaiuibtwuhihukghyx.supabase.co`, paste the file contents, and run.

Expected: "Success. No rows returned."

(Per `project_go_live_checklist.md`, this project runs migrations manually in the SQL editor. The committed file is the source of truth; the manual run applies it.)

- [ ] **Step 3: Verify the trigger blocks an over-cap insert**

In the SQL editor, pick a free-tier test account's `user_id` that has at least 10 distinct cigars in their humidor (or seed one). Then:

```sql
-- Replace <USER_ID> and <NEW_CIGAR_ID> with real values.
insert into humidor_items (user_id, cigar_id, quantity, is_wishlist)
values ('<USER_ID>', '<NEW_CIGAR_ID>', 1, false);
```

Expected: `ERROR: humidor_free_tier_limit (SQLSTATE P0001)`.

- [ ] **Step 4: Verify the trigger lets a paid user through**

Repeat the same `INSERT` for a member-tier user with > 10 distinct cigars.

Expected: insert succeeds (rollback after verifying with `select count(*) from humidor_items where user_id = '<USER_ID>'`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260529_humidor_free_tier_limit.sql
git commit -m "feat(db): trigger enforcing 10-cigar cap for free tier"
```

---

## Task 2: Helper `addHumidorItem()` + `HumidorLimitError`

**Files:**
- Create: `lib/humidor/add-item.ts`

- [ ] **Step 1: Write the helper**

Create `lib/humidor/add-item.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMembershipTier, FREE_TIER_LIMITS, type MembershipProfile } from "@/lib/membership";

/**
 * Thrown when a free-tier user tries to add an 11th distinct cigar to
 * their humidor. Callers should catch this and present the upgrade modal.
 */
export class HumidorLimitError extends Error {
  constructor() {
    super("humidor_free_tier_limit");
    this.name = "HumidorLimitError";
  }
}

export interface HumidorInsertPayload {
  user_id:           string;
  cigar_id:          string;
  quantity?:         number;
  purchase_quantity?: number;
  purchase_date?:    string | null;
  price_paid_cents?: number | null;
  source?:           string | null;
  aging_start_date?: string | null;
  aging_target_date?: string | null;
  notes?:            string | null;
  is_wishlist?:      boolean;
}

/**
 * Assert the user is allowed to add `cigarId` to their humidor.
 * Returns silently on pass. Throws HumidorLimitError on block.
 *
 * Rules:
 *  - Paid tier → always pass.
 *  - Wishlist add (is_wishlist=true) → never called from addHumidorItem
 *    on the wishlist path; safe to call here regardless.
 *  - Free tier, cigarId already owned → pass (batch-add is free).
 *  - Free tier, new cigarId, < 10 distinct → pass.
 *  - Free tier, new cigarId, ≥ 10 distinct → throw.
 */
export async function assertCanAddHumidor(
  supabase: SupabaseClient,
  userId:   string,
  cigarId:  string,
): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("membership_tier, badge, assigned_badges")
    .eq("id", userId)
    .single<MembershipProfile>();

  if (getMembershipTier(profile) !== "free") return;

  const { data: rows, error } = await supabase
    .from("humidor_items")
    .select("cigar_id")
    .eq("user_id", userId)
    .eq("is_wishlist", false);

  if (error) {
    // Don't silently swallow — let the caller surface a generic error.
    throw error;
  }

  const distinct = new Set((rows ?? []).map((r) => r.cigar_id));

  // Adding another batch of an already-owned cigar is free.
  if (distinct.has(cigarId)) return;

  if (distinct.size >= FREE_TIER_LIMITS.humidor_items) {
    throw new HumidorLimitError();
  }
}

/**
 * Insert a humidor_items row, gated by the free-tier cap when
 * is_wishlist=false. Wishlist inserts bypass the gate entirely.
 *
 * Maps Postgres errcode P0001 (the trigger's exception) to
 * HumidorLimitError so race-condition rejections show the modal too.
 */
export async function addHumidorItem(
  supabase: SupabaseClient,
  payload:  HumidorInsertPayload,
): Promise<void> {
  if (!payload.is_wishlist) {
    await assertCanAddHumidor(supabase, payload.user_id, payload.cigar_id);
  }

  const { error } = await supabase.from("humidor_items").insert(payload);

  if (error) {
    // PostgREST surfaces Postgres errors with a `code` field. The trigger
    // raises with SQLSTATE P0001 and message text 'humidor_free_tier_limit'.
    if (error.code === "P0001" && error.message.includes("humidor_free_tier_limit")) {
      throw new HumidorLimitError();
    }
    throw error;
  }
}
```

- [ ] **Step 2: Confirm it type-checks**

Run:
```bash
npx tsc --noEmit
```

Expected: no new errors. If there are unrelated pre-existing errors, confirm none of them reference the new file.

- [ ] **Step 3: Commit**

```bash
git add lib/humidor/add-item.ts
git commit -m "feat(humidor): addHumidorItem helper + HumidorLimitError"
```

---

## Task 3: `<UpgradeLimitModal>` component

**Files:**
- Create: `components/membership/UpgradeLimitModal.tsx`

- [ ] **Step 1: Write the modal**

Create `components/membership/UpgradeLimitModal.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";

interface UpgradeLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Soft-nudge modal shown when a free-tier user tries to add an 11th
 * distinct cigar to their humidor. Primary CTA → Membership tab.
 * Secondary CTA "Manage humidor" just closes the modal (returns user
 * to prior context — no forced redirect).
 */
export function UpgradeLimitModal({ isOpen, onClose }: UpgradeLimitModalProps) {
  // Escape-key dismiss + body scroll lock while open.
  useEffect(() => {
    if (!isOpen) return;

    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);

    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top      = `-${scrollY}px`;
    document.body.style.width    = "100%";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top      = "";
      document.body.style.width    = "";
      window.scrollTo(0, scrollY);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-limit-title"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6 pb-8"
        style={{
          backgroundColor: "var(--card)",
          border:          "1px solid var(--border)",
          paddingBottom:   "calc(2rem + env(safe-area-inset-bottom))",
        }}
      >
        {/* Close X */}
        <div className="flex justify-end -mt-2 -mr-2 mb-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 flex items-center justify-center rounded-full"
            style={{ color: "var(--muted-foreground)" }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M4 4 L14 14 M14 4 L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <h2
          id="upgrade-limit-title"
          style={{
            fontFamily: "var(--font-serif)",
            fontSize:   22,
            color:      "var(--foreground)",
            marginBottom: 12,
          }}
        >
          You&apos;ve reached your 10-cigar limit
        </h2>

        <p
          style={{
            fontSize:   15,
            lineHeight: 1.5,
            color:      "var(--muted-foreground)",
            marginBottom: 24,
          }}
        >
          Free members can track up to 10 unique cigars. Upgrade to Member for unlimited cigars.
        </p>

        <Link
          href="/account?tab=membership"
          onClick={onClose}
          className="btn btn-primary block w-full text-center"
          style={{ marginBottom: 12 }}
        >
          Upgrade to Member
        </Link>

        <button
          type="button"
          onClick={onClose}
          className="block w-full text-center py-3"
          style={{
            color:    "var(--muted-foreground)",
            fontSize: 14,
            background: "transparent",
            border: "none",
          }}
        >
          Manage humidor
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/membership/UpgradeLimitModal.tsx
git commit -m "feat(membership): UpgradeLimitModal soft-nudge component"
```

---

## Task 4: Wire `AddToHumidorSheet.tsx`

**Files:**
- Modify: `components/cigars/AddToHumidorSheet.tsx`

This is the canonical add path (also reused by WishlistClient for "move from wishlist to humidor").

- [ ] **Step 1: Read the current file**

Read `components/cigars/AddToHumidorSheet.tsx` in full to identify the insert at line ~137 and find a good mounting point for the modal at component root.

- [ ] **Step 2: Add the imports**

Add to the import block at the top of the file:

```ts
import { addHumidorItem, HumidorLimitError } from "@/lib/humidor/add-item";
import { UpgradeLimitModal } from "@/components/membership/UpgradeLimitModal";
```

- [ ] **Step 3: Add the modal state**

Inside the `AddToHumidorSheet` component body, alongside the other `useState` declarations (near `const [submitting, setSubmitting] = useState(false);`), add:

```ts
const [showLimitModal, setShowLimitModal] = useState(false);
```

- [ ] **Step 4: Replace the inline insert with `addHumidorItem`**

Find the block (around line 137):

```ts
const { error: insertError } = await supabase.from("humidor_items").insert({
  user_id: user.id,
  cigar_id: cigarId,
  is_wishlist: false,
  quantity,
  purchase_quantity: quantity,
  purchase_date: purchaseDate || null,
  price_paid_cents: isNaN(priceCents!) ? null : priceCents,
  source: source.trim() || null,
  aging_start_date: agingStartDate || null,
  notes: notes.trim() || null,
});

setSubmitting(false);

if (insertError) {
  setError(insertError.message);
  return;
}

onSuccess();
onClose();
```

Replace with:

```ts
try {
  await addHumidorItem(supabase, {
    user_id: user.id,
    cigar_id: cigarId,
    is_wishlist: false,
    quantity,
    purchase_quantity: quantity,
    purchase_date: purchaseDate || null,
    price_paid_cents: isNaN(priceCents!) ? null : priceCents,
    source: source.trim() || null,
    aging_start_date: agingStartDate || null,
    notes: notes.trim() || null,
  });
} catch (e) {
  setSubmitting(false);
  if (e instanceof HumidorLimitError) {
    setShowLimitModal(true);
    return;
  }
  setError(e instanceof Error ? e.message : "Something went wrong.");
  return;
}

setSubmitting(false);
onSuccess();
onClose();
```

- [ ] **Step 5: Mount the modal**

At the bottom of the component's returned JSX, just before the outer-most closing element, mount the modal alongside (not nested inside) the bottom sheet markup so z-index works:

```tsx
<UpgradeLimitModal
  isOpen={showLimitModal}
  onClose={() => setShowLimitModal(false)}
/>
```

If the component returns a single root element, wrap the existing return in a fragment (`<>...</>`) and add the modal as a sibling.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 7: Manual smoke check**

Start the dev server in another shell (`npm run dev`). Sign in as any account, open a cigar detail page, tap "Add to Humidor". Confirm the sheet still opens, the form still submits successfully, and nothing visually regressed.

(The modal won't trigger yet unless you're a free user already at 10 distinct cigars — that's covered by the E2E in Task 7.)

- [ ] **Step 8: Commit**

```bash
git add components/cigars/AddToHumidorSheet.tsx
git commit -m "feat(humidor): gate AddToHumidorSheet on free-tier cap"
```

---

## Task 5: Wire `AddCigarSheet.tsx`

**Files:**
- Modify: `components/humidor/AddCigarSheet.tsx`

Same pattern as Task 4. This sheet is the "add a new cigar (possibly creating a catalog entry)" flow from inside the humidor.

- [ ] **Step 1: Add the imports**

Add to the top of `components/humidor/AddCigarSheet.tsx`:

```ts
import { addHumidorItem, HumidorLimitError } from "@/lib/humidor/add-item";
import { UpgradeLimitModal } from "@/components/membership/UpgradeLimitModal";
```

- [ ] **Step 2: Add modal state**

In the component body, alongside the other `useState` calls near `setSubmitError`, add:

```ts
const [showLimitModal, setShowLimitModal] = useState(false);
```

- [ ] **Step 3: Replace the inline insert with `addHumidorItem`**

Find the block (around line 198):

```ts
const { error: insertErr } = await supabase.from("humidor_items").insert({
  user_id:           user.id,
  cigar_id:          cigarId,
  quantity,
  purchase_date:     purchaseDate     || null,
  price_paid_cents:  isNaN(priceCents ?? NaN) ? null : priceCents,
  source:            source.trim()    || null,
  aging_start_date:  agingStart       || null,
  aging_target_date: agingTarget      || null,
  notes:             notes.trim()     || null,
  is_wishlist:       false,
});

if (insertErr) { setSubmitError(insertErr.message); return; }
```

Replace with:

```ts
try {
  await addHumidorItem(supabase, {
    user_id:           user.id,
    cigar_id:          cigarId,
    quantity,
    purchase_date:     purchaseDate     || null,
    price_paid_cents:  isNaN(priceCents ?? NaN) ? null : priceCents,
    source:            source.trim()    || null,
    aging_start_date:  agingStart       || null,
    aging_target_date: agingTarget      || null,
    notes:             notes.trim()     || null,
    is_wishlist:       false,
  });
} catch (e) {
  if (e instanceof HumidorLimitError) {
    setShowLimitModal(true);
    return;
  }
  setSubmitError(e instanceof Error ? e.message : "Something went wrong.");
  return;
}
```

- [ ] **Step 4: Mount the modal**

At the bottom of the component's returned JSX (same root-level placement guidance as Task 4):

```tsx
<UpgradeLimitModal
  isOpen={showLimitModal}
  onClose={() => setShowLimitModal(false)}
/>
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 6: Manual smoke check**

In the dev server, navigate to `/humidor`, tap "Add" (or whichever button opens this sheet), confirm the sheet still works.

- [ ] **Step 7: Commit**

```bash
git add components/humidor/AddCigarSheet.tsx
git commit -m "feat(humidor): gate AddCigarSheet on free-tier cap"
```

---

## Task 6: `?tab=membership` handler in `AccountClient.tsx`

**Files:**
- Modify: `components/account/AccountClient.tsx`

The modal's "Upgrade to Member" CTA links to `/account?tab=membership`. We need `AccountSection` (which owns the `sheet` state at line 1376) to read that query param and open the membership bottom sheet automatically.

- [ ] **Step 1: Add the `useSearchParams` import**

Find the existing `next/navigation` import in `components/account/AccountClient.tsx` (currently imports `useRouter`). Update it to also import `useSearchParams`:

```ts
import { useRouter, useSearchParams } from "next/navigation";
```

If `useSearchParams` is not already imported elsewhere in this file, add this import as a new line.

- [ ] **Step 2: Wire the query handler in `AccountSection`**

Find `AccountSection` (around line 1375) and locate:

```ts
function AccountSection({ userId, email, membership, onToast }: AccountSectionProps) {
  const [sheet,     setSheet]    = useState<"membership" | "privacy" | null>(null);
```

Immediately after the `useState` declaration for `sheet`, add:

```ts
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("tab") === "membership") {
      setSheet("membership");
    }
  }, [searchParams]);
```

(`useEffect` should already be imported at the top of the file. If not, add it to the `react` import.)

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Manual smoke check**

In the dev server, navigate directly to `/account?tab=membership`. Expected: the Membership bottom sheet opens automatically. Navigate to plain `/account` — no sheet opens.

- [ ] **Step 5: Commit**

```bash
git add components/account/AccountClient.tsx
git commit -m "feat(account): auto-open membership sheet on ?tab=membership"
```

---

## Task 7: Playwright E2E spec

**Files:**
- Create: `tests/e2e/free-tier-limit.spec.ts`

Per the spec, the project has no unit-test runner — we cover the helper's behavior end-to-end via Playwright against a real Supabase test account.

- [ ] **Step 1: Look up a free-tier test account credentials**

Check `tests/e2e/authenticated.spec.ts` to see how existing tests authenticate. The same pattern is reused here.

- [ ] **Step 2: Write the spec**

Create `tests/e2e/free-tier-limit.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------
   Free-tier humidor cap E2E
   ------------------------------------------------------------------
   Requires the following env vars (mirrors authenticated.spec.ts):
     NEXT_PUBLIC_SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY
     E2E_FREE_USER_EMAIL
     E2E_FREE_USER_PASSWORD
     E2E_FREE_USER_ID  (UUID of the above user)
   ------------------------------------------------------------------ */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const USER_EMAIL   = process.env.E2E_FREE_USER_EMAIL!;
const USER_PASSWORD = process.env.E2E_FREE_USER_PASSWORD!;
const USER_ID      = process.env.E2E_FREE_USER_ID!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

/** Wipe humidor_items for the test user and seed with N distinct cigars. */
async function seedHumidor(count: number): Promise<string[]> {
  await admin.from("humidor_items").delete().eq("user_id", USER_ID);

  const { data: cigars } = await admin
    .from("cigar_catalog")
    .select("id")
    .order("usage_count", { ascending: false })
    .limit(count + 1); // +1 spare for the "11th" test

  const seedIds = cigars!.slice(0, count).map((c) => c.id);
  const spareId = cigars![count].id;

  if (seedIds.length > 0) {
    await admin.from("humidor_items").insert(
      seedIds.map((cigar_id) => ({
        user_id: USER_ID,
        cigar_id,
        quantity: 1,
        is_wishlist: false,
      })),
    );
  }

  return [...seedIds, spareId]; // last element is unused / available
}

test.describe("free-tier humidor cap", () => {
  test.beforeEach(async ({ page }) => {
    // Ensure the user is on the free tier (in case a previous test upgraded them).
    await admin.from("profiles").update({ membership_tier: "free" }).eq("id", USER_ID);

    await page.goto("/login");
    await page.fill('input[type="email"]', USER_EMAIL);
    await page.fill('input[type="password"]', USER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/home|\/onboarding/);
  });

  test("free user with 9 distinct cigars can add a 10th", async ({ page }) => {
    const [ , , , , , , , , , spareId ] = await seedHumidor(9);

    await page.goto(`/discover/cigars/${spareId}`);
    await page.getByRole("button", { name: /add to humidor/i }).click();
    await page.getByRole("button", { name: /^add$/i }).click();

    // Modal should NOT appear.
    await expect(page.getByText("You've reached your 10-cigar limit")).toHaveCount(0);
    // The add sheet should close and a success state appear.
    await expect(page.getByText(/added/i)).toBeVisible({ timeout: 5_000 });
  });

  test("free user with 10 distinct cigars is blocked on the 11th", async ({ page }) => {
    const seeded = await seedHumidor(10);
    const eleventhCigarId = seeded[seeded.length - 1];

    await page.goto(`/discover/cigars/${eleventhCigarId}`);
    await page.getByRole("button", { name: /add to humidor/i }).click();
    await page.getByRole("button", { name: /^add$/i }).click();

    // Modal MUST appear.
    await expect(page.getByText("You've reached your 10-cigar limit")).toBeVisible();
    await expect(page.getByRole("link", { name: /upgrade to member/i })).toBeVisible();

    // Confirm no insert happened.
    const { data: rows } = await admin
      .from("humidor_items")
      .select("cigar_id")
      .eq("user_id", USER_ID)
      .eq("cigar_id", eleventhCigarId);
    expect(rows ?? []).toHaveLength(0);
  });

  test("free user can add another batch of an already-owned cigar at the cap", async ({ page }) => {
    const seeded = await seedHumidor(10);
    const ownedCigarId = seeded[0]; // already in the humidor

    await page.goto(`/discover/cigars/${ownedCigarId}`);
    await page.getByRole("button", { name: /add to humidor/i }).click();
    // The sheet may show "you already own this — add another batch?" UX;
    // either way, a fresh insert should succeed.
    await page.getByRole("button", { name: /^add$/i }).click();

    await expect(page.getByText("You've reached your 10-cigar limit")).toHaveCount(0);

    const { count } = await admin
      .from("humidor_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", USER_ID)
      .eq("cigar_id", ownedCigarId);
    expect(count ?? 0).toBeGreaterThanOrEqual(2);
  });

  test("upgrade CTA lands on /account with the Membership sheet open", async ({ page }) => {
    await seedHumidor(10);
    const { data: cigars } = await admin
      .from("cigar_catalog").select("id").limit(11);
    const eleventh = cigars![10].id;

    await page.goto(`/discover/cigars/${eleventh}`);
    await page.getByRole("button", { name: /add to humidor/i }).click();
    await page.getByRole("button", { name: /^add$/i }).click();

    await page.getByRole("link", { name: /upgrade to member/i }).click();

    await expect(page).toHaveURL(/\/account\?tab=membership/);
    await expect(page.getByText(/membership/i).first()).toBeVisible();
  });

  test.afterAll(async () => {
    // Clean up: drop all seeded humidor rows so the account is reusable.
    await admin.from("humidor_items").delete().eq("user_id", USER_ID);
  });
});
```

- [ ] **Step 3: Confirm the env vars are documented**

If `E2E_FREE_USER_EMAIL`, `E2E_FREE_USER_PASSWORD`, and `E2E_FREE_USER_ID` are not already set up in `.env.local` for testing, add them now (placeholder values + a comment for the real ones go in `.env.example` if that file exists).

If `.env.example` does not exist, skip — the env vars are documented in the spec header.

- [ ] **Step 4: Run the test against local dev server**

In one shell:
```bash
npm run dev
```

In another:
```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e -- free-tier-limit
```

Expected: all 4 tests pass. If a test fails, fix the implementation (not the test) and re-run.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/free-tier-limit.spec.ts
git commit -m "test(e2e): free-tier humidor cap behavior"
```

---

## Task 8: Manual end-to-end verification

These are the manual checks listed in the spec. They cover scenarios the Playwright spec doesn't (downgrade behavior, grandfathered users).

- [ ] **Step 1: Free user at 9 → add 10th, no modal**

(Covered by E2E Task 7 — repeat manually for sanity.)

- [ ] **Step 2: Free user at 10 → add 11th, modal**

(Covered by E2E.)

- [ ] **Step 3: Free user at 10 → batch-add an owned cigar**

(Covered by E2E.)

- [ ] **Step 4: Upgrade to Member → 11th distinct now works**

In the Supabase SQL Editor, run:
```sql
update profiles set membership_tier = 'member' where id = '<TEST_USER_ID>';
```
In the app, retry the 11th cigar add. Expected: succeeds, no modal.

- [ ] **Step 5: Downgrade to free with 15 distinct → all visible/editable, new add blocked**

```sql
-- Set tier back to free; the 15 existing rows stay in the DB.
update profiles set membership_tier = 'free' where id = '<TEST_USER_ID>';
```

In the app, navigate to `/humidor`. Confirm:
- All 15 cigars are visible.
- Tapping any of them opens the item detail (edit/delete still work).
- Tapping "Add" and choosing a 16th distinct cigar shows the modal.

- [ ] **Step 6: Upgrade CTA lands correctly**

Trigger the modal again. Tap "Upgrade to Member". Confirm the URL is `/account?tab=membership` and the Membership bottom sheet is open.

- [ ] **Step 7: Manage humidor CTA closes modal cleanly**

Trigger the modal again. Tap "Manage humidor". Confirm the modal closes and you're back on the cigar detail page (or wherever you triggered it from).

- [ ] **Step 8: Reset the test account**

```sql
-- Restore the test account to whatever its baseline state should be.
delete from humidor_items where user_id = '<TEST_USER_ID>';
update profiles set membership_tier = 'free' where id = '<TEST_USER_ID>';
```

---

## Task 9: Apply migration to production + open PR

- [ ] **Step 1: Apply the migration to production Supabase**

This step happens BEFORE the PR is merged, so any merged code that depends on the trigger doesn't run on a missing trigger.

Open the Supabase SQL Editor for the production project (same URL — this project has a single Supabase env per memory `project_main_branch_stale.md` context). Paste and run `supabase/migrations/20260529_humidor_free_tier_limit.sql`.

Expected: "Success. No rows returned."

Verify with:
```sql
select tgname from pg_trigger where tgname = 'humidor_free_limit_check';
```
Expected: one row returned.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/free-tier-humidor-limit
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "feat(membership): free-tier 10-cigar humidor cap" --body "$(cat <<'EOF'
## Summary
- Caps free-tier users at 10 distinct cigars in their humidor
- Client-side modal (UpgradeLimitModal) gates the two humidor-add sheets
- Postgres BEFORE INSERT trigger on humidor_items is the backstop
- AccountClient auto-opens the Membership sheet on ?tab=membership

Spec: docs/superpowers/specs/2026-05-29-free-tier-humidor-limit-design.md

## Test plan
- [x] Playwright E2E suite passes (tests/e2e/free-tier-limit.spec.ts)
- [x] Manual: free user at 9 can add 10th
- [x] Manual: free user at 10 blocked on 11th distinct, modal shown
- [x] Manual: batch-add of owned cigar still works at the cap
- [x] Manual: upgrade to Member unblocks adds
- [x] Manual: downgraded user with 15 cigars keeps all data, new adds blocked
- [x] DB: trigger applied to production before merge

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Verify CI passes**

```bash
gh pr checks
```

If checks fail, fix and push a follow-up commit on the same branch.

---

## Done

All tasks complete. Merge the PR via GitHub UI once review approves.
