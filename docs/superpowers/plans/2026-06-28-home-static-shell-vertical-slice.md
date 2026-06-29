# /home Static Shell + Client Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `/home` to a static, user-agnostic shell that paints instantly, with client-side auth gating and client-side data fetching — applying the pattern already proven and tested on `/humidor`.

**Architecture:** `page.tsx` becomes an auth-free server component (no `getServerUser`, no user-data server reads) that renders client data-islands + a `HomeAuthGate` (client redirect guard reusing `resolveSessionGate`) + the unchanged public News server island. The four user-data islands (Masthead, SmokingConditions, Aging, LocalShops) fetch via the browser Supabase client + SWR, each showing its existing skeleton while loading. RLS on `profiles` + `humidor_items` becomes the data perimeter.

**Tech Stack:** Next.js App Router, React server/client components, SWR, Supabase (browser client + RLS), TypeScript, vitest.

## Global Constraints

- **Mirror the proven `/humidor` pattern; reuse, do not reinvent:** `lib/auth/session-gate.ts` (`resolveSessionGate`, already unit-tested), `app/(app)/humidor/HumidorRoute.tsx` (gate usage), `app/(app)/humidor/page.tsx` (static shell), `components/dashboard/Notifications.tsx` (client SWR island).
- **`proxy.ts` is NOT modified.** The proxy keeps gating `/home`; the win is the static shell, not un-gating.
- **`onboardingCompleted` comes from the session** (`AppSession.onboardingCompleted`), never a profile fetch.
- **News stays server-rendered** in its `<Suspense>` (Dave, 2026-06-28). Do not move it client-side.
- **RLS is a hard ship gate.** No client read of `profiles`/`humidor_items` data ships until the cross-user verify query returns zero rows (Task 2).
- No em dashes in any user-facing copy (none is added here; preserve existing strings exactly).
- No `any`; reuse existing exported types (`ProfileLite` from `lib/data/profile.ts`, `AgingItem` from `components/dashboard/AgingAlerts.tsx`) via `import type`.
- The client islands read `userId` from `useAppSession()`, NOT from props. `page.tsx` passes no `userId`.
- SW/service-worker, push, splash, outbox: untouched (restored by revert PR #526).
- Branch off freshly-synced `main` (Task 1). One PR for the slice.

---

## File Structure

| File | Change |
|---|---|
| `lib/data/keys.ts` | Modify: add `homeAging` SWR key |
| `lib/data/profile-client.ts` | Create: `fetchProfileLite()` (browser client) |
| `lib/data/aging-client.ts` | Create: `fetchAgingItems()` (browser client) |
| `app/(app)/home/HomeAuthGate.tsx` | Create: client redirect guard (renders null) |
| `app/(app)/home/client-islands.tsx` | Create: the 4 client islands + Notifications wrapper |
| `app/(app)/home/_islands.tsx` | Modify: remove the 4 server islands + Notifications wrapper; keep `NewsIsland` only |
| `app/(app)/home/page.tsx` | Modify: auth-free shell wiring |
| (Supabase, manual) | RLS `SELECT` policies on `profiles` + `humidor_items` |

---

## Task 1: Branch off synced main + commit planning docs

**Files:** none (git only)

- [ ] **Step 1: Sync main and branch**

The spec + this plan are untracked working-tree files; they survive the checkout.

```bash
cd /Users/dave.black/Documents/the-humidor
git stash push -u -- docs/superpowers/specs/2026-06-28-home-static-shell-vertical-slice.md docs/superpowers/plans/2026-06-28-home-static-shell-vertical-slice.md 2>/dev/null || true
git fetch origin main && git checkout main && git merge --ff-only origin/main
git checkout -b feat/home-static-shell
git stash pop 2>/dev/null || true
```

- [ ] **Step 2: Verify clean base**

Run: `git log --oneline main..origin/main`
Expected: prints nothing.

- [ ] **Step 3: Commit the planning docs**

```bash
git add docs/superpowers/specs/2026-06-28-home-static-shell-vertical-slice.md docs/superpowers/plans/2026-06-28-home-static-shell-vertical-slice.md
git commit -m "docs: /home static shell vertical-slice spec + plan"
```

---

## Task 2: RLS policies on profiles + humidor_items (manual SQL — hard gate)

**Files:** none in repo — SQL run by Dave in the Supabase SQL editor.

**Interfaces:**
- Produces: a verified guarantee that the browser Supabase client can read ONLY the current user's `profiles` row and `humidor_items` rows. Tasks 3+ depend on this for safety.

- [ ] **Step 1: Hand Dave the check-and-add SQL**

Paste this for Dave to run in the Supabase SQL editor. It is idempotent (only adds a policy if absent) and enables RLS.

```sql
-- profiles: a user may SELECT only their own row.
alter table public.profiles enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and cmd = 'SELECT' and qual ilike '%auth.uid() = id%'
  ) then
    create policy "profiles_select_own" on public.profiles
      for select using (auth.uid() = id);
  end if;
end $$;

-- humidor_items: a user may SELECT only their own rows.
alter table public.humidor_items enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'humidor_items'
      and cmd = 'SELECT' and qual ilike '%auth.uid() = user_id%'
  ) then
    create policy "humidor_items_select_own" on public.humidor_items
      for select using (auth.uid() = user_id);
  end if;
end $$;
```

- [ ] **Step 2: Hand Dave the verify query (the hard gate)**

Dave runs this **while signed in as a normal user** (Supabase SQL editor's "run as authenticated" / or via the app's session). Both counts MUST be 0.

```sql
-- Must both return 0 — proves a user cannot read other users' rows.
select
  (select count(*) from public.humidor_items where user_id <> auth.uid()) as foreign_humidor_rows,
  (select count(*) from public.profiles      where id      <> auth.uid()) as foreign_profile_rows;
```

Also confirm the policies exist:

```sql
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename in ('profiles','humidor_items')
order by tablename, policyname;
```

- [ ] **Step 3: Gate**

Do NOT proceed to Task 3's island wiring as shippable until Dave confirms both `foreign_*_rows` are 0 and both `*_select_own` policies are present. (Implementation of Tasks 3-6 may proceed in parallel, but the PR must not merge until this is confirmed — note it in the PR checklist.)

---

## Task 3: Client fetchers + SWR key

**Files:**
- Modify: `lib/data/keys.ts`
- Create: `lib/data/profile-client.ts`
- Create: `lib/data/aging-client.ts`

**Interfaces:**
- Consumes: `ProfileLite` (type) from `lib/data/profile.ts`; `AgingItem` (type) from `components/dashboard/AgingAlerts.tsx`; `createClient` from `utils/supabase/client.ts`; `keyFor` from `lib/data/keys.ts`.
- Produces: `fetchProfileLite(userId: string): Promise<ProfileLite | null>`, `fetchAgingItems(userId: string): Promise<AgingItem[]>`, `keyFor.homeAging(userId: string): [string, string]`. Tasks 5 consume these.

- [ ] **Step 1: Add the `homeAging` SWR key**

In `lib/data/keys.ts`, inside the `keyFor` object, add (next to the existing `notifications` entry):

```ts
  homeAging:     (userId: string) => ["home-aging", userId],
```

(The `profile` key already exists: `profile: (userId) => ["profile", userId]` — reuse it for Masthead, SmokingConditions, LocalShops.)

- [ ] **Step 2: Create the client profile fetcher**

Create `lib/data/profile-client.ts`:

```ts
"use client";

/*
 * Client-side profile fetch for the static-shell home islands.
 * Mirrors the server `getProfileLite` projection (lib/data/profile.ts) but
 * uses the browser Supabase client. RLS (`profiles` SELECT auth.uid() = id)
 * scopes the read to the current user; the explicit `.eq("id", userId)` keeps
 * the query identical to the server one.
 */

import { createClient } from "@/utils/supabase/client";
import type { ProfileLite } from "@/lib/data/profile";

export async function fetchProfileLite(userId: string): Promise<ProfileLite | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_name, first_name, city, zip_code, badge, assigned_badges, membership_tier, is_admin")
    .eq("id", userId)
    .single();
  return data ?? null;
}
```

- [ ] **Step 3: Create the client aging fetcher**

Create `lib/data/aging-client.ts`:

```ts
"use client";

/*
 * Client-side aging-window fetch for the home Aging island. Same query as
 * the former server `AgingIsland` (humidor_items joined to cigar_catalog,
 * non-wishlist, aging_target_date within [today-7d, today+31d]), via the
 * browser Supabase client. RLS (`humidor_items` SELECT auth.uid() = user_id)
 * scopes the read.
 */

import { createClient } from "@/utils/supabase/client";
import type { AgingItem } from "@/components/dashboard/AgingAlerts";

export async function fetchAgingItems(userId: string): Promise<AgingItem[]> {
  const supabase = createClient();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 31);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const agingFloor = new Date();
  agingFloor.setDate(agingFloor.getDate() - 7);
  const agingFloorStr = agingFloor.toISOString().split("T")[0];

  const { data } = await supabase
    .from("humidor_items")
    .select(
      "id, aging_start_date, aging_target_date, " +
      "cigar:cigar_catalog(brand, series)"
    )
    .eq("user_id", userId)
    .eq("is_wishlist", false)
    .not("aging_target_date", "is", null)
    .gte("aging_target_date", agingFloorStr)
    .lte("aging_target_date", cutoffStr)
    .order("aging_target_date", { ascending: true });

  return (data ?? []) as unknown as AgingItem[];
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors; `ProfileLite`/`AgingItem` type-only imports resolve, no server code pulled into client modules).

- [ ] **Step 5: Commit**

```bash
git add lib/data/keys.ts lib/data/profile-client.ts lib/data/aging-client.ts
git commit -m "feat(home): client profile + aging fetchers, homeAging SWR key"
```

---

## Task 4: HomeAuthGate client guard

**Files:**
- Create: `app/(app)/home/HomeAuthGate.tsx`

**Interfaces:**
- Consumes: `useAppSession` from `components/system/app-session.tsx`; `resolveSessionGate` from `lib/auth/session-gate.ts`.
- Produces: `HomeAuthGate` (default-free named export, renders `null`). Task 6 mounts it in `page.tsx`.

- [ ] **Step 1: Create the guard**

Create `app/(app)/home/HomeAuthGate.tsx` (mirrors the effect in `app/(app)/humidor/HumidorRoute.tsx`, but renders `null` because News stays a server island interleaved with the client content):

```tsx
"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppSession } from "@/components/system/app-session";
import { resolveSessionGate } from "@/lib/auth/session-gate";

/**
 * Client auth gate for the static /home shell. Reads the session from
 * AppSessionProvider and applies the same rule the proxy applies
 * (resolveSessionGate), redirecting to /login or /onboarding when needed.
 * Renders nothing — the user-data islands each show their own skeleton until
 * the session is ready, and the public News server island renders regardless.
 */
export function HomeAuthGate() {
  const { ready, session } = useAppSession();
  const router   = useRouter();
  const pathname = usePathname();

  const gate = resolveSessionGate({
    hasSession:          session !== null,
    onboardingCompleted: session?.onboardingCompleted ?? false,
    pathname,
  });

  useEffect(() => {
    if (!ready) return;
    if (gate === "login") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (gate === "onboarding") {
      router.replace("/onboarding");
    }
  }, [ready, gate, pathname, router]);

  return null;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/home/HomeAuthGate.tsx"
git commit -m "feat(home): client auth gate reusing resolveSessionGate"
```

---

## Task 5: Convert the four data islands to client components

**Files:**
- Create: `app/(app)/home/client-islands.tsx`
- Modify: `app/(app)/home/_islands.tsx`

**Interfaces:**
- Consumes: `useAppSession`; `useSWR`; `keyFor` + `jsonFetcher`(unused here) from `lib/data/keys.ts`; `fetchProfileLite`, `fetchAgingItems`; the dashboard components `Masthead`, `SmokingConditions`, `AgingAlerts`, `Notifications`, `LocalShops`; the skeletons `MastheadSkeleton`, `SmokingConditionsSkeleton`, `AgingSkeleton`, `NotificationsSkeleton`.
- Produces: client island components `MastheadIsland`, `SmokingConditionsIsland`, `NotificationsIsland`, `AgingIsland`, `LocalShopsIsland` (no props). Task 6 renders them.

- [ ] **Step 1: Create the client islands file**

Create `app/(app)/home/client-islands.tsx`:

```tsx
"use client";

/*
 * Client data islands for the static /home shell. Each reads the current
 * user id from AppSessionProvider and fetches via SWR (browser Supabase
 * client), showing its existing skeleton until the session is ready and the
 * first fetch resolves. This mirrors components/dashboard/Notifications.tsx,
 * the island that already used this pattern. RLS scopes every read.
 */

import useSWR from "swr";

import { useAppSession } from "@/components/system/app-session";
import { keyFor }        from "@/lib/data/keys";
import { fetchProfileLite } from "@/lib/data/profile-client";
import { fetchAgingItems }  from "@/lib/data/aging-client";

import { Masthead }          from "@/components/dashboard/Masthead";
import { SmokingConditions } from "@/components/dashboard/SmokingConditions";
import { AgingAlerts }       from "@/components/dashboard/AgingAlerts";
import { Notifications }     from "@/components/dashboard/Notifications";
import { LocalShops }        from "@/components/dashboard/LocalShops";

import {
  MastheadSkeleton,
  SmokingConditionsSkeleton,
  AgingSkeleton,
  NotificationsSkeleton,
} from "./_skeletons";

/* Masthead — greeting + admin link. */
export function MastheadIsland() {
  const { ready, session } = useAppSession();
  const userId = session?.userId ?? null;
  const { data } = useSWR(
    userId ? keyFor.profile(userId) : null,
    () => fetchProfileLite(userId as string),
  );
  if (!ready || !session || data === undefined) return <MastheadSkeleton />;
  return (
    <Masthead
      displayName={data?.display_name ?? "there"}
      isAdmin={!!data?.is_admin}
    />
  );
}

/* Smoking conditions strip — reads profile zip/city, then client weather. */
export function SmokingConditionsIsland() {
  const { ready, session } = useAppSession();
  const userId = session?.userId ?? null;
  const { data } = useSWR(
    userId ? keyFor.profile(userId) : null,
    () => fetchProfileLite(userId as string),
  );
  if (!ready || !session || data === undefined) return <SmokingConditionsSkeleton />;
  return (
    <SmokingConditions
      zip={data?.zip_code?.trim() || null}
      city={data?.city?.trim() || null}
    />
  );
}

/* Notifications — already self-fetches via SWR + auth.uid() RPC. */
export function NotificationsIsland() {
  const { ready, session } = useAppSession();
  if (!ready || !session) return <NotificationsSkeleton />;
  return <Notifications userId={session.userId} />;
}

/* Aging shelf — windowed humidor query. */
export function AgingIsland() {
  const { ready, session } = useAppSession();
  const userId = session?.userId ?? null;
  const { data } = useSWR(
    userId ? keyFor.homeAging(userId) : null,
    () => fetchAgingItems(userId as string),
  );
  if (!ready || !session || data === undefined) return <AgingSkeleton />;
  return <AgingAlerts initialItems={data} />;
}

/* Local shops — reads profile zip for the external Maps link. No skeleton
   (the card renders its own internal fallback); render nothing until ready. */
export function LocalShopsIsland() {
  const { ready, session } = useAppSession();
  const userId = session?.userId ?? null;
  const { data } = useSWR(
    userId ? keyFor.profile(userId) : null,
    () => fetchProfileLite(userId as string),
  );
  if (!ready || !session || data === undefined) return null;
  return <LocalShops zip={data?.zip_code?.trim() || null} />;
}
```

- [ ] **Step 2: Trim the server islands file to News only**

In `app/(app)/home/_islands.tsx`, delete the now-moved islands: `MastheadIsland`, `SmokingConditionsIsland`, `AgingIsland`, `NotificationsIsland`, `LocalShopsIsland`, and the now-unused imports (`createClient` from server, `getProfileLite`, `Masthead`, `SmokingConditions`, `AgingAlerts`, `Notifications`, `LocalShops`, and the `AgingItem` type import). Keep ONLY the `NewsIsland` server component and its needed imports:

```tsx
/*
 * Server island for the home dashboard: the public News rail. All user-data
 * islands moved client-side (client-islands.tsx) for the static-shell model;
 * News stays server-rendered (public, cached) inside its Suspense boundary.
 */

import { getLatestNews } from "@/lib/data/news";
import { News }          from "@/components/dashboard/News";

/* News rail (cached at the data layer via unstable_cache). */
export async function NewsIsland() {
  const items = await getLatestNews(5);
  return <News items={items} />;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no unused imports in `_islands.tsx`; client islands resolve all types).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/home/client-islands.tsx" "app/(app)/home/_islands.tsx"
git commit -m "feat(home): client data islands; trim server islands to News"
```

---

## Task 6: Rewrite page.tsx as the auth-free static shell

**Files:**
- Modify: `app/(app)/home/page.tsx`

**Interfaces:**
- Consumes: `NewsIsland` (server) from `./_islands`; the client islands from `./client-islands`; `HomeAuthGate` from `./HomeAuthGate`; `TonightsPairing`, `FieldGuide`, `DashboardPager`; `NewsSkeleton` from `./_skeletons`.
- Produces: a static, user-agnostic `/home` document.

- [ ] **Step 1: Replace page.tsx**

Replace the entire contents of `app/(app)/home/page.tsx` with:

```tsx
import { Suspense }      from "react";
import { TonightsPairing } from "@/components/dashboard/TonightsPairing";
import { FieldGuide }      from "@/components/dashboard/FieldGuide";
import { DashboardPager }  from "@/components/dashboard/DashboardPager";

import { NewsIsland } from "./_islands";
import {
  MastheadIsland,
  SmokingConditionsIsland,
  NotificationsIsland,
  AgingIsland,
  LocalShopsIsland,
} from "./client-islands";
import { HomeAuthGate } from "./HomeAuthGate";
import { NewsSkeleton } from "./_skeletons";

/*
 * Edge runtime: faster cold start. The route is a STATIC, user-agnostic shell
 * — no getServerUser(), no per-user server reads — so the document carries no
 * PII and the service worker can serve it to anyone. Auth gating happens
 * client-side (HomeAuthGate, reusing resolveSessionGate, same as /humidor);
 * the proxy still 401s/redirects unauth requests. Per-user data arrives
 * client-side in the islands via SWR. News stays a public server island.
 */
export const runtime = "edge";

export default function HomePage() {
  return (
    <>
      {/* Client auth gate: redirects to /login or /onboarding after mount. */}
      <HomeAuthGate />

      {/* 0. Masthead (full-width greeting + admin link) — client island. */}
      <MastheadIsland />

      <div className="px-4 sm:px-6 pt-6 pb-6 flex flex-col gap-6 max-w-2xl mx-auto">

        {/* 1. Tonight's Pairing — primary CTAs, no data. */}
        <TonightsPairing />

        {/* 2. Dashboard pager: conditions · notifications · aging. */}
        <DashboardPager initialIndex={1}>
          <SmokingConditionsIsland />
          <NotificationsIsland />
          <AgingIsland />
        </DashboardPager>

        {/* 4. The Wire (news) — public server island, streams independently. */}
        <Suspense fallback={<NewsSkeleton />}>
          <NewsIsland />
        </Suspense>

        {/* 5. Field Guide — self-fetching client; in static shell. */}
        <FieldGuide />

        {/* 6. Local Shops — client island (reads profile ZIP). */}
        <LocalShopsIsland />

      </div>
    </>
  );
}
```

- [ ] **Step 2: Confirm the shell is user-agnostic**

Run: `grep -n "getServerUser\|userId" "app/(app)/home/page.tsx"`
Expected: no output (no server auth, no userId props).

- [ ] **Step 3: Type-check + lint the touched files**

Run: `npx tsc --noEmit`
Expected: PASS.
Run: `npx eslint "app/(app)/home/page.tsx" "app/(app)/home/client-islands.tsx" "app/(app)/home/HomeAuthGate.tsx" "app/(app)/home/_islands.tsx" lib/data/profile-client.ts lib/data/aging-client.ts`
Expected: no new errors (repo-wide lint is already red on main from pre-existing issues; only the touched files matter).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/home/page.tsx"
git commit -m "feat(home): auth-free static shell page wiring"
```

---

## Task 7: Build, verify, PR

**Files:** none (verification + git)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: build succeeds; `/home` builds as a route. Confirm no server-auth on the shell:

Run: `grep -rn "getServerUser" "app/(app)/home/"`
Expected: no output.

- [ ] **Step 2: Unit tests (session-gate already covers the gate logic)**

Run: `npm run test:unit`
Expected: PASS, including `lib/auth/__tests__/session-gate.test.ts` (the gate `HomeAuthGate` reuses). No new unit tests are added — the gate logic is already tested, and the islands/fetchers are thin Supabase wrappers with no existing unit harness (same as `lib/data/humidor-fetchers.ts`). Verification is build + the manual checks below.

- [ ] **Step 3: Manual verification (record in PR body)**

With `npm run dev` (and a preview deploy where possible), confirm:
- **Instant paint:** `/home` shell (nav + Masthead skeleton + pager skeletons) appears immediately; data fills in after. Throttle the network to make the difference visible.
- **Parity:** every section shows the same data it did before (greeting, conditions, notifications, aging, news, local shops).
- **Auth states:** signed-out → redirected to `/login?next=/home`; onboarding-incomplete test user → `/onboarding`; signed-in onboarded → home renders with their data.
- **No leak:** DevTools → Network, confirm the `profiles`/`humidor_items` reads are the browser client's and return only the current user's rows; the page HTML (view source) contains no other user's data.
- **Other routes unaffected:** `/humidor`, `/lounge`, `/account` still work.

- [ ] **Step 4: Push + open PR (RLS gate noted)**

```bash
git push -u origin feat/home-static-shell
gh pr create --base main --title "feat(home): static shell + client auth + client data (vertical slice)" --body "$(cat <<'EOF'
## Summary
Applies the proven /humidor static-shell pattern to /home: an auth-free, user-agnostic shell that paints instantly, with client-side auth gating (reusing the tested `resolveSessionGate`) and client-side data fetching. First slice of the app-shell rearchitecture.

- `page.tsx` is now a static shell — no `getServerUser`, no user-data server reads.
- 4 user-data islands (Masthead, SmokingConditions, Aging, LocalShops) fetch via the browser Supabase client + SWR, each with its existing skeleton. Notifications already did this.
- `HomeAuthGate` redirects to /login or /onboarding client-side, reusing `resolveSessionGate`.
- News stays a public server island. `proxy.ts` unchanged.

## REQUIRED before merge — RLS hard gate
- [ ] `profiles` SELECT `auth.uid() = id` policy present
- [ ] `humidor_items` SELECT `auth.uid() = user_id` policy present
- [ ] Cross-user verify query returns 0/0 (see plan Task 2)

## Test plan
- [ ] `npm run build`, `npm run test:unit` (session-gate covered)
- [ ] Manual: instant paint, data parity, auth states (signed-out/onboarding/signed-in), no cross-user data, other routes unaffected

Spec: docs/superpowers/specs/2026-06-28-home-static-shell-vertical-slice.md
EOF
)"
```

---

## Self-Review notes

- **Spec coverage:** static shell page (Task 6), client gate reusing resolveSessionGate (Task 4), 4 islands → client (Task 5), client fetchers + key (Task 3), RLS hard gate (Task 2), News server-rendered unchanged (Task 5 Step 2 + Task 6), proxy untouched (no task modifies it). All spec sections map to a task.
- **Deliberate non-TDD for UI/fetchers:** the gate logic is already unit-tested (`resolveSessionGate`); islands and Supabase fetchers are thin wrappers matching existing untested patterns (`lib/data/humidor-fetchers.ts`, `components/dashboard/Notifications.tsx`). Verification is typecheck + build + the manual matrix. Stated honestly rather than via fabricated tests.
- **Type consistency:** `ProfileLite` (from `lib/data/profile.ts`) and `AgingItem` (from `components/dashboard/AgingAlerts.tsx`) are imported as types in the client fetchers and consumed by the islands. `keyFor.profile(userId)` (existing) is shared by Masthead/SmokingConditions/LocalShops (SWR dedups); `keyFor.homeAging(userId)` (new, Task 3) is used by Aging. Island exports (`MastheadIsland` etc., no props) match `page.tsx` usage (Task 6).
- **RLS sequencing:** Tasks 3-6 can be implemented before Task 2 is confirmed, but the PR must not merge until the cross-user verify passes (encoded as the PR checklist).
