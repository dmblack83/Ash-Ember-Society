# profiles PII RLS Lockdown — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the anon-readable exposure of every member's PII (full name, phone, address, admin flag, Stripe IDs) by locking `profiles` SELECT to own-row and publishing a small `public_profiles` view for cross-user author display.

**Architecture:** Deny-by-default. `profiles` becomes own-row-only readable; a `public_profiles` view exposes only `id, display_name, avatar_url, badge, membership_tier` to authenticated users. Every cross-user profile read is repointed to the view; own-user reads are unchanged.

**Tech Stack:** Supabase Postgres (RLS, views), PostgREST embedding, Next.js, TypeScript.

## Global Constraints

- **The DB changes (Task 2) are manual SQL Dave runs in the Supabase SQL editor**, given as copy-paste blocks. The leak is not closed until Task 2 runs.
- **Repoint rule (Task 3-4):** any `profiles` read that selects ONLY public columns (`display_name, avatar_url, badge, membership_tier`, optionally `id`) → change to `public_profiles`. Reads selecting any private column (`first_name, last_name, phone, city, state, zip_code, is_admin, stripe_*`) MUST be own-user (`.eq("id", <current user>)`) and stay on `profiles`; if such a read is cross-user, it is a leak — drop the private columns and repoint to `public_profiles`.
- **Preserve response shape:** when changing an embed, keep the result key `profiles` via an alias (`profiles:public_profiles!<fk>(...)`) so downstream code reading `row.profiles` is unchanged.
- **PostgREST view-embedding is the known risk:** every embed must be VERIFIED to return author data (Task 5). If an embed fails to resolve through the view, use the fallback in Task 5 Step 3.
- Own-user reads (`getProfileLite`, `fetchProfileLite`, `account/page.tsx`, home islands, admin `is_admin`) are NOT changed — the own-row policy permits them.
- No em dashes in user-facing copy. No `any`.
- Branch off freshly-synced `main`. One PR. This lands before PR #527 merges.

---

## File Structure

| File | Change |
|---|---|
| (Supabase, manual SQL) | Drop world policy, drop dup policy, create `public_profiles` view + grants |
| `lib/data/lounge-fetchers.ts` | Repoint 1 embed |
| `components/feed/LoungeClient.tsx` | Repoint 4 embeds |
| `components/discover/ChannelsClient.tsx` | Repoint 1 embed (add FK hint) |
| `app/(app)/admin/page.tsx` | Repoint 2 embeds |
| `components/field-guide/FieldGuideComments.tsx` | Repoint public-only reads |
| `components/lounge/InlinePost.tsx` | Repoint public-only reads |
| `components/lounge/PostDetailClient.tsx` | Repoint public-only reads |
| `components/lounge/PostModal.tsx` | Repoint public-only reads (incl. dropping cross-user `city`) |
| `components/lounge/CategoryCard.tsx` | Repoint public-only reads |

---

## Task 1: Branch off synced main + commit docs

- [ ] **Step 1: Sync + branch**
```bash
cd /Users/dave.black/Documents/the-humidor
git stash push -u -- docs/superpowers/specs/2026-06-28-profiles-pii-rls-lockdown.md docs/superpowers/plans/2026-06-28-profiles-pii-rls-lockdown.md 2>/dev/null || true
git fetch origin main && git checkout main && git merge --ff-only origin/main
git checkout -b fix/profiles-pii-rls-lockdown
git stash pop 2>/dev/null || true
```
- [ ] **Step 2: Verify clean base** — Run: `git log --oneline main..origin/main` — Expected: nothing.
- [ ] **Step 3: Commit docs**
```bash
git add docs/superpowers/specs/2026-06-28-profiles-pii-rls-lockdown.md docs/superpowers/plans/2026-06-28-profiles-pii-rls-lockdown.md
git commit -m "docs: profiles PII RLS lockdown spec + plan"
```

---

## Task 2: DB lockdown + public view (manual SQL — Dave)

**Interfaces:** Produces a `profiles` table readable only own-row, and a `public_profiles` view (4 public columns) readable by authenticated users. Tasks 3-4 read from the view.

- [ ] **Step 1: Hand Dave Block A (lock profiles) — run in Supabase SQL editor**
```sql
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='profiles'
      and cmd='SELECT' and qual ilike '%auth.uid() = id%'
  ) then
    create policy "profiles_select_own" on public.profiles
      for select to authenticated using (auth.uid() = id);
  end if;
end $$;
```

- [ ] **Step 2: Hand Dave Block B (public view) — run separately**
```sql
create or replace view public.public_profiles
with (security_invoker = off) as
  select id, display_name, avatar_url, badge, membership_tier
  from public.profiles;

revoke all on public.public_profiles from anon;
grant select on public.public_profiles to authenticated;
```

- [ ] **Step 3: Hand Dave Block C (confirm) — paste result back**
```sql
select tablename, policyname, roles, cmd, qual
from pg_policies where schemaname='public' and tablename='profiles' and cmd='SELECT';
-- expect: only an own-row (auth.uid() = id) SELECT policy. No qual=true / {public} row.
```

- [ ] **Step 4: Gate** — Do not merge the PR until Dave confirms Block C shows no `qual: true` SELECT policy on `profiles` and the view exists. (Code tasks 3-4 may proceed in parallel; they only work end-to-end once Block A/B are applied.)

---

## Task 3: Repoint the cross-user JOIN embeds

**Files:** `lib/data/lounge-fetchers.ts`, `components/feed/LoungeClient.tsx`, `components/discover/ChannelsClient.tsx`, `app/(app)/admin/page.tsx`

**Interfaces:** Produces author embeds that read from `public_profiles`, preserving the `profiles`/`submitter` result key.

- [ ] **Step 1: lounge-fetchers.ts line 350**

Change:
```ts
      "profiles:profiles!forum_comments_user_id_fkey(display_name, avatar_url, badge, membership_tier)"
```
to:
```ts
      "profiles:public_profiles!forum_comments_user_id_fkey(display_name, avatar_url, badge, membership_tier)"
```

- [ ] **Step 2: LoungeClient.tsx — four embeds**

Line 253 and 762, change `profiles!posts_user_id_fkey(...)` to `profiles:public_profiles!posts_user_id_fkey(...)`:
```ts
        .select("*, profiles:public_profiles!posts_user_id_fkey(display_name, avatar_url, badge, membership_tier)")
```
Line 444 and 460, change `profiles!post_comments_user_id_fkey(...)` to `profiles:public_profiles!post_comments_user_id_fkey(...)`:
```ts
      .select("*, profiles:public_profiles!post_comments_user_id_fkey(display_name, badge, membership_tier)")
```

- [ ] **Step 3: ChannelsClient.tsx line 280 — add the FK hint for the view embed**

Change:
```ts
        .select("id, content, created_at, user_id, profiles(display_name, avatar_url, badge, membership_tier)")
```
to (hint the FK so PostgREST resolves the view relationship; keep the `profiles` key):
```ts
        .select("id, content, created_at, user_id, profiles:public_profiles!channel_messages_user_id_fkey(display_name, avatar_url, badge, membership_tier)")
```
NOTE: confirm the actual FK constraint name on the channel-messages table's `user_id` (it may differ from `channel_messages_user_id_fkey`). Run, in the SQL editor:
```sql
select conname from pg_constraint
where conrelid = (select oid from pg_class where relname = 'channel_messages') and contype='f';
```
Use the FK that references `profiles`/`auth.users(id)` via `user_id`. If ChannelsClient queries a differently-named table, adjust accordingly (read the `.from(...)` above line 280).

- [ ] **Step 4: admin/page.tsx lines 35, 72**

Change `submitter:profiles!cigar_image_submissions_user_id_fkey (display_name)` to:
```ts
      submitter:public_profiles!cigar_image_submissions_user_id_fkey (display_name)
```
and `submitter:profiles!cigar_edit_suggestions_suggested_by_fkey (display_name)` to:
```ts
      submitter:public_profiles!cigar_edit_suggestions_suggested_by_fkey (display_name)
```
(The result key `submitter` is preserved.)

- [ ] **Step 5: Typecheck**
Run: `npx tsc --noEmit` — Expected: clean (these are string changes; types unaffected).

- [ ] **Step 6: Commit**
```bash
git add lib/data/lounge-fetchers.ts components/feed/LoungeClient.tsx components/discover/ChannelsClient.tsx "app/(app)/admin/page.tsx"
git commit -m "fix(rls): repoint cross-user author embeds to public_profiles view"
```

---

## Task 4: Repoint the cross-user direct reads + audit

**Files:** `FieldGuideComments.tsx`, `InlinePost.tsx`, `PostDetailClient.tsx`, `PostModal.tsx`, `CategoryCard.tsx`

**Interfaces:** Produces direct cross-user profile reads that go through `public_profiles`; own-user reads remain on `profiles`.

Apply the **repoint rule** (Global Constraints) to each `from("profiles")` site below. For each: if the read selects ONLY public columns, change `.from("profiles")` to `.from("public_profiles")`. If it selects a private column AND is `.eq("id", <current user>)`, leave it. If it selects a private column cross-user, drop the private column(s) and repoint.

- [ ] **Step 1: Classify and change each site**

Reads selecting ONLY public columns — change `from("profiles")` → `from("public_profiles")`:
- `FieldGuideComments.tsx:139-141` (`.eq("id", userId)`), `:404`, `:546-547` (list)
- `InlinePost.tsx:267-268`, `:420-421` (list), `:501-502`
- `PostDetailClient.tsx:320-322`, `:651`
- `PostModal.tsx:281`, `:611` (`.in("id", newUserIds)`), `:688`
- `CategoryCard.tsx:159-160` (list), `:237-239` (`.eq("id", row.user_id)`)

Special case — `PostModal.tsx:468` selects a PRIVATE column cross-user:
```ts
const { data: profileRows } = await supabase.from("profiles").select("id, display_name, avatar_url, badge, membership_tier, city").in("id", allUserIds);
```
This reads OTHER users' `city` (a leak). Change to drop `city` and use the view:
```ts
const { data: profileRows } = await supabase.from("public_profiles").select("id, display_name, avatar_url, badge, membership_tier").in("id", allUserIds);
```
Then remove any downstream use of `.city` from those `profileRows` (search the file for `.city` on these rows; if a post "from {city}" label depended on it, drop the label — cross-user city display was itself a leak).

Note: own-user reads here (`.eq("id", userId)` where `userId` is the current session user, used to render the composer's own avatar) select only public columns, so repointing them to `public_profiles` is also correct and simplest. Apply the rule uniformly: these select only public columns → `public_profiles`.

- [ ] **Step 2: Audit — no cross-user private read remains**
Run:
```bash
grep -rn 'from("profiles")' app components lib | grep -v node_modules
```
For each remaining hit, confirm it is EITHER own-user (`.eq("id", <current user>)` selecting private columns is fine) OR a server-side service-role read. Any cross-user `from("profiles")` selecting private columns is a bug — fix it. Record the audit result in the report.

- [ ] **Step 3: Typecheck**
Run: `npx tsc --noEmit` — Expected: clean (fix any `.city` removal fallout).

- [ ] **Step 4: Commit**
```bash
git add components/field-guide/FieldGuideComments.tsx components/lounge/InlinePost.tsx components/lounge/PostDetailClient.tsx components/lounge/PostModal.tsx components/lounge/CategoryCard.tsx
git commit -m "fix(rls): repoint cross-user direct profile reads to public_profiles; drop cross-user city"
```

---

## Task 5: Build, verify embeds, PR

- [ ] **Step 1: Build + tests**
Run: `npm run build` — Expected: succeeds.
Run: `npm run test:unit` — Expected: 125 passed.

- [ ] **Step 2: Verify each author surface returns data (REQUIRED — the view-embed risk)**
With Block A/B applied (Task 2) and `npm run dev`, signed in, confirm author name + avatar + badge render on EACH surface: Lounge feed (`LoungeClient`), Lounge comments, a forum thread (`lounge-fetchers`), Discover Channels (`ChannelsClient`), Field Guide comments, Post modal/detail, Category cards, and the Admin submissions/suggestions pages (`submitter`). Any blank author name = a view embed that didn't resolve → Step 3.

- [ ] **Step 3: Fallback if any embed is blank**
If a PostgREST embed through `public_profiles` returns null author data, apply one of:
(a) **Computed relationship** — in SQL, create a function relationship so PostgREST can embed the view (Supabase docs: "computed relationships"); or
(b) **Two-step fetch** — fetch the rows, collect `user_id`s, then `public_profiles.select(...).in("id", ids)` and merge in app code (the pattern already used at `PostModal:611`).
Re-verify Step 2 for that surface. Record which embeds needed a fallback.

- [ ] **Step 4: Leak-closed verification (record in PR)**
Confirm (per success criteria): logged out, the anon client cannot read another user's profile; logged in, you cannot read another user's `profiles` row, but `public_profiles` returns the 4 public fields. (Dave can spot-check via the app: other users' names/badges show; no other-user city/phone appears anywhere.)

- [ ] **Step 5: Push + PR**
```bash
git push -u origin fix/profiles-pii-rls-lockdown
gh pr create --base main --title "fix(security): lock profiles RLS to own-row + public_profiles view (PII leak)" --body "$(cat <<'EOF'
## Summary
Closes a live, anon-readable exposure of every member's PII (full name, phone, home address, is_admin, Stripe IDs) via the public anon key + a `qual: true` "viewable by everyone" SELECT policy on `profiles`.

Deny-by-default fix: lock `profiles` SELECT to own-row; publish a `public_profiles` view (display_name, avatar_url, badge, membership_tier) for cross-user author display; repoint every cross-user read to the view. Own-user reads unchanged.

## ⚠️ Manual DB step (required, run before/with merge)
- [ ] Block A (lock profiles), Block B (create view) applied in Supabase
- [ ] Block C confirms `profiles` has no `qual: true` SELECT policy

## Verified
- [ ] `npm run build`, `npm run test:unit` (125)
- [ ] Every author surface still shows name/avatar/badge (view embeds resolve; fallbacks noted)
- [ ] Logged-out anon cannot read other users' profiles; no cross-user city/phone anywhere

Spec: docs/superpowers/specs/2026-06-28-profiles-pii-rls-lockdown.md

Blocks: PR #527 should merge after this.
EOF
)"
```

---

## Self-Review notes
- **Spec coverage:** lock + view (Task 2 ↔ spec 3.1/3.2), embed migration (Task 3 ↔ 3.3 joins), direct-read migration + audit (Task 4 ↔ 3.3 direct + 3.5), own-reads untouched (Global Constraints ↔ 3.4), verification + fallback (Task 5 ↔ 6 risks). All map.
- **The view-embed risk is handled, not assumed:** Task 5 Step 2 verifies every author surface; Step 3 is the explicit fallback. This is the one genuinely uncertain part and it is gated by verification before the PR is considered done.
- **Fail-safe:** a missed cross-user read now returns zero rows (blank author), caught in Task 5 QA — never a leak.
- **No new unit tests:** the change is RLS + string repoints + view embedding, verified by build + the author-surface QA matrix; the repo has no PostgREST-embed test harness.
