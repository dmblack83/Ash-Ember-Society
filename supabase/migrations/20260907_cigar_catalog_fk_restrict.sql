-- ============================================================
-- Flip humidor_items.cigar_id and smoke_logs.cigar_id from
-- ON DELETE CASCADE to ON DELETE RESTRICT.
--
-- Discovered while building the community-cigar review queue:
-- both FKs (20260413 / 20260414) cascade, so deleting a
-- cigar_catalog row would silently destroy members' humidor
-- items and burn logs. Nothing in the app deletes catalog rows
-- today, and the new admin delete endpoint checks references
-- first, but the database should refuse this class of accident
-- on its own. Manual-apply in the Supabase SQL editor.
-- ============================================================

alter table humidor_items
  drop constraint if exists humidor_items_cigar_id_fkey;
alter table humidor_items
  add constraint humidor_items_cigar_id_fkey
  foreign key (cigar_id) references cigar_catalog(id)
  on delete restrict;

alter table smoke_logs
  drop constraint if exists smoke_logs_cigar_id_fkey;
alter table smoke_logs
  add constraint smoke_logs_cigar_id_fkey
  foreign key (cigar_id) references cigar_catalog(id)
  on delete restrict;

-- ── Verify ──────────────────────────────────────────────────
-- select conname, confdeltype from pg_constraint
--   where conname in ('humidor_items_cigar_id_fkey', 'smoke_logs_cigar_id_fkey');
--   -- confdeltype 'r' (restrict) for both, not 'c' (cascade)

-- ── Rollback (restores the cascade behavior) ────────────────
-- alter table humidor_items drop constraint humidor_items_cigar_id_fkey;
-- alter table humidor_items add constraint humidor_items_cigar_id_fkey
--   foreign key (cigar_id) references cigar_catalog(id) on delete cascade;
-- alter table smoke_logs drop constraint smoke_logs_cigar_id_fkey;
-- alter table smoke_logs add constraint smoke_logs_cigar_id_fkey
--   foreign key (cigar_id) references cigar_catalog(id) on delete cascade;
