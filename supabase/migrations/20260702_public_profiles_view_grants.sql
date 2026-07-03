-- public_profiles view: canonical definition + grant hardening.
--
-- ALREADY APPLIED to prod by Dave in the SQL editor 2026-07-02. This
-- file is the repo record (the view previously existed only in the
-- editor — the exact drift class the go-live audit targets).
--
-- Context: profiles is own-row RLS (PR #528). This view is the
-- deliberate cross-user window exposing ONLY safe public columns.
-- SECURITY DEFINER (security_invoker = off) is INTENTIONAL and
-- load-bearing: with invoker semantics the caller's own-row RLS
-- would apply inside the view and every cross-user byline/avatar in
-- the app would go blank. The Supabase "security_definer_view" lint
-- on this view is acknowledged; do NOT "fix" it.
--
-- Grant hardening (the actual bug this migration records): Supabase
-- default privileges granted ALL on the view to authenticated. The
-- view is simple enough to be auto-updatable, and definer semantics
-- bypass profiles RLS for writes through it — so any signed-in user
-- could UPDATE/DELETE other users' display_name/avatar/badge/tier
-- via the REST API. Revoked 2026-07-02; SELECT only remains.

create or replace view public.public_profiles
with (security_invoker = off) as
  select id, display_name, avatar_url, badge, membership_tier
  from public.profiles;

comment on view public.public_profiles is
  'Intentional SECURITY DEFINER: exposes only safe public columns (display_name, avatar_url, badge, tier) cross-user while profiles is own-row RLS. Do not switch to security_invoker. Write privileges revoked (definer writes would bypass profiles RLS). See PR #528.';

revoke all on public.public_profiles from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.public_profiles from authenticated;
grant select on public.public_profiles to authenticated;

-- Verify:
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_name = 'public_profiles' and grantee in ('authenticated','anon');
-- Expect exactly one row: authenticated | SELECT.
--
-- Sweep for the same default-grant pattern on any other view
-- (expect zero rows):
--   select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_name in (select viewname from pg_views where schemaname = 'public')
--     and grantee in ('authenticated', 'anon')
--     and privilege_type <> 'SELECT';
