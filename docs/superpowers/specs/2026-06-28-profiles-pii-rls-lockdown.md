# profiles PII RLS Lockdown — Security Fix Spec

> Closes a live, anon-readable exposure of every member's private profile fields via the
> public Supabase anon key. Surfaced by the `/home` static-shell slice's RLS hard gate
> (PR #527). Approach: deny-by-default (lock `profiles` to own-row; publish only a tiny
> safe view). Written 2026-06-28.

---

## 1. The vulnerability

`public.profiles` has a SELECT policy `"Profiles are viewable by everyone"` with `qual:
true` granted to role `{public}`. Postgres OR's permissive policies and `public` includes
`anon`, so **anyone with the public `NEXT_PUBLIC_SUPABASE_ANON_KEY` (shipped in every
browser bundle) can read every member's entire profiles row, with no login.**

Confirmed exposed columns (from `account/page.tsx`'s own select): `first_name, last_name,
phone, city, state, zip_code, is_admin, stripe_customer_id, stripe_subscription_id` — i.e.
**every member's full name, phone number, home address, admin flag, and Stripe billing
identifiers.** Severity: high.

Pre-existing and independent of the `/home` slice — the old code read profiles server-side
but with the same public key and policy, so the data was already directly reachable. The
slice's RLS gate is the first check that caught it.

`humidor_items` is unaffected (own-row policies only, no `qual: true`).

## 2. Why deny-by-default (not "move the sensitive columns")

The naive fix — enumerate the sensitive columns and move/drop them — is **fail-open**: miss
one and the leak silently continues. Scoping this fix already turned up more sensitive
columns on each pass (`city/zip` → `+last_name/state` → `+phone/stripe_*`). A security fix
must **fail safe**.

Deny-by-default inverts it: lock `profiles` SELECT to **own-row only**, then publish a
single small view exposing **only** the columns that are genuinely public. Every other
column — present or future — is private automatically. The failure mode becomes "a public
field was forgotten" (a visibly missing author name), never "a private field leaked."

The only columns read **cross-user** anywhere in the app are `display_name, avatar_url,
badge, membership_tier` (every Lounge/Channels/Field-Guide embed selects exactly these).
Those four are the entire public surface.

## 3. The fix

### 3.1 Lock `profiles` to own-row (manual SQL, Dave)
```sql
-- Remove the world-readable policy.
drop policy if exists "Profiles are viewable by everyone" on public.profiles;

-- Keep exactly one own-row SELECT policy; drop the redundant duplicate.
drop policy if exists "Users can view own profile" on public.profiles;  -- dup (public role)
-- "Users can read own profile" (authenticated, auth.uid() = id) remains as the own-row read.
-- (If it is absent for any reason, create it:)
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
After this, a user (or anon) can no longer read anyone else's `profiles` row. INSERT/UPDATE
policies are unchanged (own-row).

### 3.2 Publish the public view (manual SQL, Dave)
```sql
create or replace view public.public_profiles
with (security_invoker = off) as
  select id, display_name, avatar_url, badge, membership_tier
  from public.profiles;

revoke all on public.public_profiles from anon;
grant select on public.public_profiles to authenticated;
```
`security_invoker = off` (definer) means the view bypasses the base-table RLS and returns
those four columns for all rows — but ONLY those four columns, and ONLY to `authenticated`
(the app is fully authed; `anon` is revoked). This is the controlled public projection.

### 3.3 Migrate cross-user reads to the view (code)
Repoint every **cross-user** profile read from `profiles` to `public_profiles`. Own-user
reads stay on `profiles` (unchanged — the own-row policy allows full own-row access).

**Embedded joins** (change the embed target; the FK-hint stays the same constraint name):
- `lib/data/lounge-fetchers.ts:350` — `profiles:profiles!forum_comments_user_id_fkey(...)`
- `components/feed/LoungeClient.tsx` 253, 444, 460, 762 — `profiles!posts_user_id_fkey(...)`,
  `profiles!post_comments_user_id_fkey(...)`
- `components/discover/ChannelsClient.tsx:280` — `profiles(display_name, avatar_url, badge, membership_tier)`
- `app/(app)/admin/page.tsx` 35, 72 — `submitter:profiles!...fkey(display_name)`

**Direct cross-user single-row reads** (change `.from("profiles")` → `.from("public_profiles")`):
- `components/field-guide/FieldGuideComments.tsx` (cross-user author reads)
- `components/lounge/InlinePost.tsx`, `PostDetailClient.tsx`, `PostModal.tsx`, `CategoryCard.tsx`

Each selects only `display_name, avatar_url, badge, membership_tier` (subset), all present
in the view. The plan enumerates each exact line; the audit step (3.5) catches any missed.

**PostgREST view embedding** is the one real risk: embedding a view through an FK hint
(`public_profiles!posts_user_id_fkey(...)`) must resolve. The plan verifies each embed
returns author data; if PostgREST cannot auto-resolve the view relationship, the fallback is
a Supabase "computed relationship" function or a `security definer` RPC for that read. This
is verified per-embed, not assumed.

### 3.4 Own-user reads — NO change
`getProfileLite` (`lib/data/profile.ts`), `fetchProfileLite` (`lib/data/profile-client.ts`,
from the home slice), `account/page.tsx`, the home islands, and the admin `is_admin` checks
all read the CURRENT user's own row (`.eq("id", auth-user)`), which the own-row policy
permits in full. They are untouched. (This is why the `/home` slice is correct under this
fix without further change.)

### 3.5 Audit (code) — the safety net
Grep every `from("profiles")` and every `profiles(` / `profiles!` embed in `app/`,
`components/`, `lib/`. For each, confirm it is either (a) an own-user read
(`.eq("id", <current user>)`), or (b) repointed to `public_profiles`, or (c) a server-side
service-role read (bypasses RLS, intentional). Anything reading another user's row from
`profiles` for non-public columns is a bug to fix before merge.

## 4. Out of scope
- Other tables' RLS (separate audit).
- Moving/dropping any columns — none are moved or dropped; `profiles` keeps all columns,
  they are simply no longer world-readable.
- The `/home` slice itself (PR #527) — this unblocks it.

## 5. Success criteria
1. **Leak closed:** an anon client (logged-out, anon key) selecting from `profiles` returns
   **zero rows**; selecting from `public_profiles` returns an error/zero (anon revoked).
   An authenticated user selecting another user's row from `profiles` returns zero rows.
2. **Public surface intact:** an authenticated user reads any user's `display_name,
   avatar_url, badge, membership_tier` via `public_profiles`. Lounge/Channels/Field-Guide
   author name + avatar + badge still render.
3. **Own data intact:** a signed-in user still reads/edits their own full profile (name,
   phone, address) on `/home` and `/account`.
4. **Admin intact:** admin gates (`is_admin`) still work.
5. **No missed reader:** the 3.5 audit shows no cross-user `profiles` read of private columns.

## 6. Risks + rollback
- **Risk: a PostgREST view embed fails to resolve** → an author name/avatar goes missing
  (visible, not a leak). Mitigation: per-embed verification in the plan; fallback to a
  computed relationship or RPC. Fail-safe direction.
- **Risk: a missed cross-user read** now returns zero rows (feature shows blank) rather than
  leaking. Mitigation: 3.5 audit + QA of every author-name surface.
- **Rollback:** re-create the `"Profiles are viewable by everyone"` policy to instantly
  restore prior behavior (re-opens the leak, emergency only). The view + code changes are
  additive and revert cleanly via the PR.

## 7. Sequencing vs PR #527
Land this before merging #527 so the first client-auth slice ships onto trustworthy RLS.
#527's own reads are own-user (safe under this fix with no change), but the profiles leak
must be closed regardless, and it is the higher priority of the two.
