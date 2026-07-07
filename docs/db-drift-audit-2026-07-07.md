# Migration drift audit — 2026-07-07

Go-live checklist item #1. Compared production schema (qagaiuibtwuhihukghyx)
against `supabase/migrations/` and the code's query expectations.

## Method

1. Dave ran the introspection query below in the Supabase SQL editor (No limit)
   and pasted the output (~930 rows across 8 sections).
2. Every migration file was parsed for created/altered/dropped objects
   (33 tables, 221 columns, 37 indexes, 68 policies, 9+ functions).
3. **Every migration-expected table and column was independently verified
   against prod via PostgREST probes** (`select=<cols>&limit=0` validates
   column existence regardless of RLS). Critical RPCs were called with real
   arguments.
4. Prod-only objects (no migration source) were inventoried and cross-checked
   against code usage (`.from("<table>")` grep).

## Verdict: no dangerous drift

Every object the code or a migration expects exists in prod:

- 33/33 tables, 221/221 columns: probe-verified present.
- `get_report_numbers` (200 with args), `get_hot_posts` (200 with args, returns
  ranked rows): both live — no fallback paths active.
- All 51 public tables have RLS ENABLED. No table is unprotected.
- The `_lounge_read` policy family (burn_reports, burn_report_thirds,
  burn_report_third_flavor_tags) that was once missed is present.
- Prod-side manual indexes from 2026-07-02 (`humidor_items_wishlist_unique`,
  `humidor_items_aging_ready_idx`) present; the dropped redundant humidor
  indexes are confirmed gone.
- Key client-fetcher RLS dependencies confirmed (definitions in snapshot
  POLICYDEF section): `smoke_logs`/`forum_post_likes`/`forum_categories`/
  `flavor_tags` are world-readable SELECT with own-row writes — so report
  numbers on other users' burn reports compute correctly client-side.

## Findings (non-blocking)

1. **19 prod tables have no migration source** (pre-migrations era or created
   directly in the SQL editor): aging_alerts, badges, cigars, comment_likes,
   comments, content_reports, event_rsvps, events, flavor_tags, follows,
   forum_comments, forum_post_likes, forum_posts, notification_preferences,
   post_saves, shop_redemptions, shop_reviews, shops, user_badges.
   Now captured in `supabase/prod-schema-snapshot.txt` (the committed baseline).

2. **15 of those 19 have zero `.from()` references in code** (all except
   flavor_tags, forum_comments, forum_post_likes, forum_posts): the legacy
   `cigars` table (superseded by cigar_catalog), the old social feed
   (comments, comment_likes, post_saves), deferred features (events,
   event_rsvps, badges, user_badges, follows, shop_redemptions, shop_reviews,
   shops, content_reports, notification_preferences, aging_alerts). Candidates
   for an archive-and-drop decision later. NOT dropped by this audit; several
   (shops, aging_alerts, notification_preferences) may return with planned
   features.

3. **Redundant duplicate policies** (harmless, cleanup candidates):
   `smoke_logs` has both "viewable by everyone" (USING true) and "view own"
   SELECT policies; `humidor_items` has two identical own-row SELECT policies
   ("Users can view own humidor" + "Users can view own humidor items").

4. **SQL-editor exports drop rows silently.** The pasted dump was missing at
   least `smoke_logs.pairing_food` (verified present via REST probe). Any
   future absence-based conclusion from an editor export must be probe-verified.
   The snapshot header documents this.

5. Legacy prod triggers/functions with no repo source (documented in snapshot):
   `on_comment`/`on_smoke_log` counter triggers, `update_*_updated_at`,
   `handle_new_user`, `update_cigar_rating`, `increment/decrement_likes`,
   `find_or_create_cigar` + `insert_cigar_to_catalog` overload families.

## Maintaining the baseline

Re-run the query below (No limit, export all rows), replace
`supabase/prod-schema-snapshot.txt` body, and `git diff` shows prod drift.
Do this after any manual SQL-editor session and before go-live.

```sql
select section, item from (
  select 1 ord, 'COLUMN' section,
         table_name || '.' || column_name || ' ' || data_type ||
         case when is_nullable = 'NO' then ' NOT NULL' else '' end ||
         case when column_default is not null then ' DEFAULT ' || left(column_default, 60) else '' end item
  from information_schema.columns
  where table_schema = 'public'
  union all
  select 2, 'INDEX', indexname || ' ON ' || tablename
  from pg_indexes where schemaname = 'public'
  union all
  select 3, 'POLICY', tablename || ': ' || policyname || ' [' || cmd || ']' ||
         case when roles::text <> '{public}' then ' roles=' || roles::text else '' end
  from pg_policies where schemaname = 'public'
  union all
  select 4, 'RLS', c.relname || ': ' || case when c.relrowsecurity then 'ENABLED' else 'DISABLED' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  union all
  select 5, 'FUNCTION', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
  union all
  select 6, 'TRIGGER', event_object_table || ': ' || trigger_name || ' [' || string_agg(event_manipulation, ',') || ']'
  from information_schema.triggers
  where trigger_schema = 'public'
  group by event_object_table, trigger_name
  union all
  select 7, 'CONSTRAINT', conrelid::regclass::text || ': ' || conname || ' [' || contype::text || ']'
  from pg_constraint c join pg_namespace n on n.oid = c.connamespace
  where n.nspname = 'public'
  union all
  select 8, 'VIEW', table_name from information_schema.views where table_schema = 'public'
) x
order by ord, item;
```
